# On-device face models

These two TensorFlow Lite models are loaded by `services/faceEmbeddingService.js`
and **must be present before an EAS build**. They are binary assets (not committed
as source); drop the files here with these exact names:

| File | Purpose | Input | Output | Suggested source (Apache-2.0) |
|---|---|---|---|---|
| `mobilefacenet.tflite` | Face embedding (ArcFace-loss) | `1×112×112×3` RGB, values `[0,1]` | 128-d float embedding | [sirius-ai/MobileFaceNet_TF](https://github.com/sirius-ai/MobileFaceNet_TF) |
| `minifasnet.tflite` | Passive anti-spoofing (real vs spoof) | RGB face crop (e.g. `1×80×80×3`) | 2-class softmax `[real, spoof]` | [minivision-ai/Silent-Face-Anti-Spoofing](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing) |

If the model you obtain differs in input size or embedding dimension, update the
constants at the top of `services/faceEmbeddingService.js` (`EMBED_INPUT`,
`EMBED_DIM`, `SPOOF_INPUT`) — the embedding dimension is sent to the server in the
payload (`dim`), so the server adapts automatically.

> Keep `mobilefacenet.tflite` < ~10 MB so it can be bundled in the app binary.
> Larger models should be downloaded at first launch via `expo-file-system` instead.
