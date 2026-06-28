// services/faceEmbeddingService.js
// On-device ArcFace embedding + passive anti-spoofing (NATIVE ONLY).
//
// Pipeline per captured still:
//   1. ML Kit already gave us the face bounding box (see faceRecognitionService).
//   2. Crop to the face + resize (expo-image-manipulator) → base64 JPEG.
//   3. Decode to RGBA pixels (jpeg-js) → normalized Float32 input tensor.
//   4. MobileFaceNet (TFLite) → 128-d embedding, L2-normalized.
//   5. MiniFASNet (TFLite) → passive real/spoof probability.
//   6. Cheap quality stats (brightness, sharpness) from the same pixels.
//
// Only the EMBEDDING leaves the device — never the image. The server stores the
// embedding, enforces manager approval, and is the authority on the match.

import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';
import { toByteArray } from 'base64-js';

// ── Model + preprocessing constants (must match the bundled .tflite files) ────
export const MODEL_NAME = 'mobilefacenet';
export const EMBED_INPUT = 112;   // MobileFaceNet input is 112×112
export const EMBED_DIM   = 128;   // MobileFaceNet outputs a 128-d embedding
const SPOOF_INPUT = 80;           // MiniFASNet input (adjust to your model)
const SPOOF_REAL_INDEX = 1;       // softmax index for the "real/live" class
const FACE_MARGIN = 0.18;         // expand the ML Kit box by this fraction for context

// Pixel normalization for the embedding model. MUST match how the model was
// trained. (x-127.5)/127.5 → [-1,1] is the most common ArcFace/MobileFaceNet
// convention; some exports use x/255 → [0,1]. Flip this if matches look wrong.
const normalizePixel = (v) => (v - 127.5) / 127.5;

// Quality gate thresholds (tune on-device).
const MIN_BRIGHTNESS = 40;    // mean luma 0–255; below = too dark
const MAX_BRIGHTNESS = 245;   // washed out / glare
const MIN_SHARPNESS  = 8;     // variance-of-Laplacian; below = too blurry
const MIN_FACE_RATIO = 0.045; // face box area / image area; below = too far away
const MIN_REAL_PROB  = 0.7;   // anti-spoof: require ≥ this "real" probability

// ── Lazy native module load (guarded so web bundling doesn't break) ───────────
let loadTensorflowModel = null;
if (Platform.OS !== 'web') {
  try {
    ({ loadTensorflowModel } = require('react-native-fast-tflite'));
  } catch (e) {
    console.warn('[FaceEmbedding] react-native-fast-tflite unavailable:', e?.message);
  }
}

export const isEmbeddingAvailable = () => Platform.OS !== 'web' && !!loadTensorflowModel;

// ── Model loading (cached) ────────────────────────────────────────────────────
let _embedModelP = null;
let _spoofModelP = null;

const loadEmbedModel = () => {
  if (!loadTensorflowModel) throw new Error('FACE_MODULE_MISSING');
  if (!_embedModelP) _embedModelP = loadTensorflowModel(require('../assets/models/mobilefacenet.tflite'));
  return _embedModelP;
};

const loadSpoofModel = () => {
  if (!loadTensorflowModel) throw new Error('FACE_MODULE_MISSING');
  if (!_spoofModelP) {
    // Anti-spoof is optional: if the asset is missing, resolve to null and skip.
    try {
      _spoofModelP = loadTensorflowModel(require('../assets/models/minifasnet.tflite'));
    } catch {
      _spoofModelP = Promise.resolve(null);
    }
  }
  return _spoofModelP;
};

/** Warm both models so the first capture isn't slow. Call once on screen mount. */
export const loadModels = async () => {
  if (!isEmbeddingAvailable()) throw new Error('FACE_MODULE_MISSING');
  await Promise.all([loadEmbedModel(), loadSpoofModel().catch(() => null)]);
};

// ── Image helpers ─────────────────────────────────────────────────────────────

// Clamp the ML Kit box (+ margin) to image bounds → integer crop rect.
const cropRectFor = (box, imgW, imgH) => {
  const ox = box?.origin?.x ?? 0;
  const oy = box?.origin?.y ?? 0;
  const w  = box?.size?.width ?? imgW;
  const h  = box?.size?.height ?? imgH;
  const mx = w * FACE_MARGIN;
  const my = h * FACE_MARGIN;
  let originX = Math.max(0, Math.floor(ox - mx));
  let originY = Math.max(0, Math.floor(oy - my));
  let width   = Math.min(imgW - originX, Math.ceil(w + mx * 2));
  let height  = Math.min(imgH - originY, Math.ceil(h + my * 2));
  width  = Math.max(1, width);
  height = Math.max(1, height);
  return { originX, originY, width, height };
};

// Crop + resize the face to `size`×`size` and return decoded RGBA pixels.
const cropResizeDecode = async (uri, rect, size) => {
  const manip = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: rect }, { resize: { width: size, height: size } }],
    { compress: 1, base64: true, format: ImageManipulator.SaveFormat.JPEG }
  );
  const bytes = toByteArray(manip.base64);
  // useTArray → returns Uint8Array (no Buffer dependency in RN)
  const { width, height, data } = jpeg.decode(bytes, { useTArray: true });
  return { width, height, data }; // data is RGBA, length = width*height*4
};

// Build a normalized NHWC Float32 tensor [1,size,size,3] from RGBA pixels.
const toTensor = (rgba, size) => {
  const out = new Float32Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    out[i * 3]     = normalizePixel(rgba[i * 4]);     // R
    out[i * 3 + 1] = normalizePixel(rgba[i * 4 + 1]); // G
    out[i * 3 + 2] = normalizePixel(rgba[i * 4 + 2]); // B (drop alpha)
  }
  return out;
};

const l2normalize = (v) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  return Array.from(v, (x) => x / n);
};

// Mean luma + variance-of-Laplacian (sharpness) over the RGBA crop.
const qualityStats = (rgba, size) => {
  const gray = new Float32Array(size * size);
  let sum = 0;
  for (let i = 0; i < size * size; i++) {
    const g = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    gray[i] = g;
    sum += g;
  }
  const brightness = sum / (size * size);

  // 4-neighbour Laplacian; track variance of the response.
  let lSum = 0, lSumSq = 0, n = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;
      const lap = 4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - size] - gray[idx + size];
      lSum += lap; lSumSq += lap * lap; n++;
    }
  }
  const mean = lSum / n;
  const sharpness = lSumSq / n - mean * mean; // variance
  return { brightness, sharpness };
};

const softmax = (arr) => {
  const max = Math.max(...arr);
  const exp = arr.map((x) => Math.exp(x - max));
  const sum = exp.reduce((a, b) => a + b, 0) || 1;
  return exp.map((x) => x / sum);
};

// ── Public: full analysis of one captured still ───────────────────────────────
/**
 * Analyze a captured photo against quality + liveness gates and, if it passes,
 * produce the face embedding.
 * @param {{uri:string, width:number, height:number}} photo
 * @param {object} face  processed ML Kit face (has .bounds)
 * @returns {Promise<{ok:boolean, reason:string|null, embedding:number[]|null,
 *                     dim:number, realProb:number|null, quality:object}>}
 */
export const analyzeCapture = async (photo, face) => {
  if (!isEmbeddingAvailable()) throw new Error('FACE_MODULE_MISSING');
  const imgW = photo.width  || 0;
  const imgH = photo.height || 0;
  if (!face?.bounds || !imgW || !imgH) {
    return { ok: false, reason: 'No face captured. Center your face and try again.', embedding: null, dim: EMBED_DIM, realProb: null, quality: {} };
  }

  const rect = cropRectFor(face.bounds, imgW, imgH);
  const faceRatio = (rect.width * rect.height) / (imgW * imgH);

  // 1. Decode the 112 crop once → quality + embedding.
  const px = await cropResizeDecode(photo.uri, rect, EMBED_INPUT);
  const { brightness, sharpness } = qualityStats(px.data, EMBED_INPUT);
  const quality = { brightness: Math.round(brightness), sharpness: Math.round(sharpness), faceRatio: +faceRatio.toFixed(4) };

  if (faceRatio < MIN_FACE_RATIO) return { ok: false, reason: 'Move closer — your face is too small in the frame.', embedding: null, dim: EMBED_DIM, realProb: null, quality };
  if (brightness < MIN_BRIGHTNESS) return { ok: false, reason: 'Too dark — find better lighting.', embedding: null, dim: EMBED_DIM, realProb: null, quality };
  if (brightness > MAX_BRIGHTNESS) return { ok: false, reason: 'Too much glare — reduce direct light.', embedding: null, dim: EMBED_DIM, realProb: null, quality };
  if (sharpness < MIN_SHARPNESS)  return { ok: false, reason: 'Image is blurry — hold still.', embedding: null, dim: EMBED_DIM, realProb: null, quality };

  // 2. Passive anti-spoofing (skip gracefully if the model isn't bundled).
  let realProb = null;
  try {
    const spoofModel = await loadSpoofModel();
    if (spoofModel) {
      const spx = await cropResizeDecode(photo.uri, rect, SPOOF_INPUT);
      const out = spoofModel.runSync([toTensor(spx.data, SPOOF_INPUT)]);
      const probs = softmax(Array.from(out[0]));
      realProb = probs[SPOOF_REAL_INDEX] ?? null;
      if (realProb != null && realProb < MIN_REAL_PROB) {
        return { ok: false, reason: 'Spoof check failed — use your real face, not a photo or screen.', embedding: null, dim: EMBED_DIM, realProb, quality };
      }
    }
  } catch (e) {
    console.warn('[FaceEmbedding] anti-spoof skipped:', e?.message);
  }

  // 3. Embedding.
  const embedModel = await loadEmbedModel();
  const out = embedModel.runSync([toTensor(px.data, EMBED_INPUT)]);
  const embedding = l2normalize(out[0]);

  return { ok: true, reason: null, embedding, dim: embedding.length, realProb, quality };
};

/** Build the server payload (the `features` object) from one or more embeddings. */
export const buildFacePayload = (embeddings, quality = null) => ({
  __v: 3,
  model: MODEL_NAME,
  dim: embeddings[0]?.length ?? EMBED_DIM,
  embeddings,
  sampleCount: embeddings.length,
  ...(quality ? { quality } : {}),
});
