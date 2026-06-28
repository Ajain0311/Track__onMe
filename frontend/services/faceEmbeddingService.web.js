// services/faceEmbeddingService.web.js
// Web stub — on-device ArcFace embedding + anti-spoofing is NATIVE ONLY
// (TFLite via react-native-fast-tflite + bundled .tflite models). On web,
// check-in uses the account-password second factor, so none of this runs.
//
// Metro picks this file for the `web` platform, which keeps the native-only
// imports and the bundled .tflite model assets out of the web bundle.

export const MODEL_NAME = 'mobilefacenet';
export const EMBED_INPUT = 112;
export const EMBED_DIM = 192;

export const isEmbeddingAvailable = () => false;

export const loadModels = async () => { throw new Error('FACE_MODULE_MISSING'); };

export const analyzeCapture = async () => { throw new Error('FACE_MODULE_MISSING'); };

export const buildFacePayload = (embeddings, quality = null) => ({
  __v: 3,
  model: MODEL_NAME,
  dim: embeddings[0]?.length ?? EMBED_DIM,
  embeddings,
  sampleCount: embeddings.length,
  ...(quality ? { quality } : {}),
});
