# On-device face models

Two TensorFlow Lite models loaded by `services/faceEmbeddingService.js`. They are
**bundled binaries** (committed here) and required for the native (EAS) build to
compile — metro resolves the `require()` at build time.

| File | Purpose | Input | Output / decision | Norm |
|---|---|---|---|---|
| `mobilefacenet.tflite` | Face embedding (ArcFace-loss) | `1×112×112×3` RGB | **192-d** float embedding (L2-normalized client-side) | `(px−127.5)/128` |
| `antispoof.tflite` | Passive anti-spoofing (DeepTree) | `1×256×256×3` RGB | 2 outputs (`clss_pred[8]`, `leaf_mask[8]`); `score=Σ|clss[i]|·mask[i]`; **score > 0.2 ⇒ spoof** | `px/255` |

**Source:** [syaringan357/Android-MobileFaceNet-MTCNN-FaceAntiSpoofing](https://github.com/syaringan357/Android-MobileFaceNet-MTCNN-FaceAntiSpoofing)
(`app/src/main/assets/MobileFaceNet.tflite` and `FaceAntiSpoofing.tflite`). The
embedding model uses InsightFace/ArcFace loss; the anti-spoof model is the CVPR-2019
DeepTreeLearning net.

If you swap either model, update the constants at the top of
`services/faceEmbeddingService.js` (`EMBED_INPUT`, `EMBED_DIM`, `SPOOF_INPUT`,
`SPOOF_ATTACK_THRESHOLD`, and the `normEmbed`/`normSpoof` functions). The embedding
dimension travels to the server in the payload (`dim`), so the backend adapts
automatically.

> On-device verification needed: confirm the anti-spoof output ordering
> (`out[0]=clss_pred`, `out[1]=leaf_mask`) and that real spoof attempts
> (printed photo / phone screen) actually push the score above 0.2.
