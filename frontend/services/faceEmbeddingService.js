// services/faceEmbeddingService.js
// On-device face embedding + passive anti-spoofing (NATIVE ONLY).
//
// Models (bundled in assets/models/, sourced from syaringan357/
// Android-MobileFaceNet-MTCNN-FaceAntiSpoofing, ArcFace-loss MobileFaceNet):
//   mobilefacenet.tflite  112x112x3, norm (px-127.5)/128  -> 192-d embedding
//   antispoof.tflite      256x256x3, norm px/255          -> DeepTree dual output
//
// Pipeline per captured still:
//   1. ML Kit gives the face bounding box (see faceRecognitionService).
//   2. Crop to the face + resize (expo-image-manipulator) -> base64 JPEG.
//   3. Decode to RGBA pixels (jpeg-js) -> normalized Float32 input tensor.
//   4. MobileFaceNet -> 192-d embedding, L2-normalized.
//   5. FaceAntiSpoofing -> spoof score (reject if > threshold).
//   6. Cheap quality stats (brightness, sharpness) from the same pixels.
//
// Only the EMBEDDING leaves the device — never the image. The server stores the
// embedding, enforces manager approval, and is the authority on the match.

import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';
import { toByteArray } from 'base64-js';

// ── Model + preprocessing constants (match the bundled .tflite files) ─────────
export const MODEL_NAME = 'mobilefacenet';
export const EMBED_INPUT = 112;   // MobileFaceNet input 112x112
export const EMBED_DIM   = 192;   // this MobileFaceNet outputs a 192-d embedding
const SPOOF_INPUT = 256;          // FaceAntiSpoofing (DeepTree) input 256x256
// Anti-spoof decision: leaf score > this => presentation attack (spoof). The
// reference Android app uses 0.2. Verify/tune on-device during calibration.
const SPOOF_ATTACK_THRESHOLD = 0.2;
const FACE_MARGIN = 0.18;         // expand the ML Kit box by this fraction for context

// MobileFaceNet normalization: (px - 127.5) / 128  -> ~[-1,1]
const normEmbed = (v) => (v - 127.5) / 128;
// Anti-spoof normalization: px / 255 -> [0,1]
const normSpoof = (v) => v / 255;

// Quality gate thresholds (tune on-device).
const MIN_BRIGHTNESS = 40;    // mean luma 0–255; below = too dark
const MAX_BRIGHTNESS = 245;   // washed out / glare
const MIN_SHARPNESS  = 8;     // variance-of-Laplacian; below = too blurry
const MIN_FACE_RATIO = 0.045; // face box area / image area; below = too far away

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
      _spoofModelP = loadTensorflowModel(require('../assets/models/antispoof.tflite'));
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
  const originX = Math.max(0, Math.floor(ox - mx));
  const originY = Math.max(0, Math.floor(oy - my));
  const width   = Math.max(1, Math.min(imgW - originX, Math.ceil(w + mx * 2)));
  const height  = Math.max(1, Math.min(imgH - originY, Math.ceil(h + my * 2)));
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
  const { width, height, data } = jpeg.decode(bytes, { useTArray: true });
  return { width, height, data }; // data is RGBA, length = width*height*4
};

// Build a normalized NHWC Float32 tensor [1,size,size,3] from RGBA pixels.
const toTensor = (rgba, size, norm) => {
  const out = new Float32Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    out[i * 3]     = norm(rgba[i * 4]);     // R
    out[i * 3 + 1] = norm(rgba[i * 4 + 1]); // G
    out[i * 3 + 2] = norm(rgba[i * 4 + 2]); // B (drop alpha)
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

// DeepTree anti-spoof leaf score: sum(|clss_pred[i]| * leaf_node_mask[i]).
// out[0] = "Identity" (clss_pred[8]), out[1] = "Identity_1" (leaf_node_mask[8]).
const spoofScoreFromOutputs = (out) => {
  if (!Array.isArray(out) || out.length < 2) return null;
  const cls = out[0], mask = out[1];
  if (!cls || !mask || cls.length !== 8 || mask.length !== 8) return null;
  let score = 0;
  for (let i = 0; i < 8; i++) score += Math.abs(cls[i]) * mask[i];
  return score;
};

// ── Public: full analysis of one captured still ───────────────────────────────
/**
 * Analyze a captured photo against quality + liveness gates and, if it passes,
 * produce the face embedding.
 * @param {{uri:string, width:number, height:number}} photo
 * @param {object} face  processed ML Kit face (has .bounds)
 * @returns {Promise<{ok:boolean, reason:string|null, embedding:number[]|null,
 *                     dim:number, spoofScore:number|null, quality:object}>}
 */
export const analyzeCapture = async (photo, face) => {
  if (!isEmbeddingAvailable()) throw new Error('FACE_MODULE_MISSING');
  const imgW = photo.width  || 0;
  const imgH = photo.height || 0;
  const fail = (reason, extra = {}) => ({ ok: false, reason, embedding: null, dim: EMBED_DIM, spoofScore: null, quality: {}, ...extra });

  if (!face?.bounds || !imgW || !imgH) return fail('No face captured. Center your face and try again.');

  const rect = cropRectFor(face.bounds, imgW, imgH);
  const faceRatio = (rect.width * rect.height) / (imgW * imgH);

  // 1. Decode the 112 crop once → quality + embedding.
  const px = await cropResizeDecode(photo.uri, rect, EMBED_INPUT);
  const { brightness, sharpness } = qualityStats(px.data, EMBED_INPUT);
  const quality = { brightness: Math.round(brightness), sharpness: Math.round(sharpness), faceRatio: +faceRatio.toFixed(4) };

  if (faceRatio < MIN_FACE_RATIO) return fail('Move closer — your face is too small in the frame.', { quality });
  if (brightness < MIN_BRIGHTNESS) return fail('Too dark — find better lighting.', { quality });
  if (brightness > MAX_BRIGHTNESS) return fail('Too much glare — reduce direct light.', { quality });
  if (sharpness < MIN_SHARPNESS)  return fail('Image is blurry — hold still.', { quality });

  // 2. Passive anti-spoofing (256x256). Skip gracefully if the model/output is
  //    unavailable or unparseable (fail-open) so a model mismatch can't brick
  //    check-in — verify on-device that real spoof attempts are actually blocked.
  let spoofScore = null;
  try {
    const spoofModel = await loadSpoofModel();
    if (spoofModel) {
      const spx = await cropResizeDecode(photo.uri, rect, SPOOF_INPUT);
      const out = spoofModel.runSync([toTensor(spx.data, SPOOF_INPUT, normSpoof)]);
      spoofScore = spoofScoreFromOutputs(out);
      if (spoofScore != null) {
        quality.spoofScore = +spoofScore.toFixed(4);
        if (spoofScore > SPOOF_ATTACK_THRESHOLD) {
          return fail('Liveness check failed — use your real face, not a photo or screen.', { spoofScore, quality });
        }
      }
    }
  } catch (e) {
    console.warn('[FaceEmbedding] anti-spoof skipped:', e?.message);
  }

  // 3. Embedding.
  const embedModel = await loadEmbedModel();
  const out = embedModel.runSync([toTensor(px.data, EMBED_INPUT, normEmbed)]);
  const embedding = l2normalize(out[0]);

  return { ok: true, reason: null, embedding, dim: embedding.length, spoofScore, quality };
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
