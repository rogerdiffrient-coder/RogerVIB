# RogerVIB Micro neural training

RogerVIB Micro v0.4 is trained by the developer build pipeline. End users never train the model in the browser; the site only downloads finished weights and runs inference.

## v0.4 architecture

- 10,049,184 trainable parameters
- character-level language model
- learned FNV-1a hashed 4-character context embedding
- 104,000 embedding buckets × 96 dimensions
- one 96-unit GRU recurrent layer
- 96-character output vocabulary
- next-character prediction objective

The large embedding table gives the tiny recurrent core richer learned local text features while keeping per-character browser compute much smaller than a 10M-parameter dense recurrent network.

## Training data

All files matching `training/v04_corpus*.jsonl` are loaded. Each non-empty line must be JSON with:

```json
{"user":"hello","assistant":"hey! whats up?"}
```

The trainer adds spelling/punctuation variants, synthetic multi-turn follow-ups, and a small plain-English grammar corpus before training.

## Export format

The browser does not load PyTorch, TensorFlow, ONNX, or WASM.

The exporter writes:

- `embedding.i8` — int8 context embedding rows
- `embedding-scales.f32` — per-row float32 quantization scales
- `gru-weight-ih.f32`
- `gru-weight-hh.f32`
- `gru-bias-ih.f32`
- `gru-bias-hh.f32`
- `head-weight.f32`
- `head-bias.f32`
- `config.json`

The embedding is quantized per row, reducing roughly 40 MB of float32 embedding data to about 10 MB while the much smaller GRU/output layers remain float32.

`config.json` includes an `artifact_revision` derived from the binary weight contents. The browser appends that revision to weight URLs so a retrain cannot accidentally mix new config with stale cached weights.

## Safety checks before publish

The training workflow does not commit a model until all of these pass:

1. `tests/validate_v04_artifact.py` checks config fields, parameter count, vocabulary, exact binary tensor sizes, corpus coverage, self-test metadata, and confirms obsolete ONNX artifacts are absent.
2. The exporter records a deterministic one-step neural test vector in `config.json`.
3. `tests/smoke_v04_inference.py` loads the **exported binary files**, reproduces browser GRU inference, checks the neural test vector, and generates deterministic sample replies for several prompts.
4. The production browser runtime repeats the neural self-test after downloading the weights. If it fails, v0.4 is marked unavailable before a message is generated.
5. `tests/validate_frontend.py` and `node --check` guard the production HTML/JS wiring.

If v0.4 is unavailable in production, the chat automatically switches to Micro v0.2 rather than inserting a crash message into the conversation.

## Automatic training

`.github/workflows/train-micro-v04.yml` retrains when the v0.4 corpus, trainer, artifact validator, or inference smoke test changes. A successful run commits the finished browser-native artifact back to `models/micro-v0.4/`.
