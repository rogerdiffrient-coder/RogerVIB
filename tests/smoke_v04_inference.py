#!/usr/bin/env python3
"""Run browser-equivalent inference directly from the exported v0.4 binary files."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "micro-v0.4"
CFG = json.loads((MODEL_DIR / "config.json").read_text(encoding="utf-8"))
H = int(CFG["hidden_size"])
BUCKETS = int(CFG["hash_buckets"])
VOCAB = list(CFG["vocab"])
FILES = CFG["files"]


def load_i8(key: str) -> np.ndarray:
    return np.fromfile(MODEL_DIR / FILES[key], dtype=np.int8)


def load_f32(key: str) -> np.ndarray:
    return np.fromfile(MODEL_DIR / FILES[key], dtype="<f4")


EMB = load_i8("embedding").reshape(BUCKETS, H)
SCALES = load_f32("embedding_scales")
WIH = load_f32("gru_weight_ih").reshape(3 * H, H)
WHH = load_f32("gru_weight_hh").reshape(3 * H, H)
BIH = load_f32("gru_bias_ih")
BHH = load_f32("gru_bias_hh")
HEAD_W = load_f32("head_weight").reshape(len(VOCAB), H)
HEAD_B = load_f32("head_bias")


def fnv1a(text: str) -> int:
    h = 2166136261
    for b in text.encode("ascii", "replace"):
        h ^= b
        h = (h * 16777619) & 0xFFFFFFFF
    return h % BUCKETS


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -20.0, 20.0)))


def step(context_id: int, hidden: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    x = EMB[context_id].astype(np.float32) * SCALES[context_id]
    r = sigmoid(WIH[:H] @ x + BIH[:H] + WHH[:H] @ hidden + BHH[:H])
    z = sigmoid(WIH[H:2*H] @ x + BIH[H:2*H] + WHH[H:2*H] @ hidden + BHH[H:2*H])
    n = np.tanh(WIH[2*H:] @ x + BIH[2*H:] + r * (WHH[2*H:] @ hidden + BHH[2*H:]))
    next_hidden = ((1.0 - z) * n + z * hidden).astype(np.float32)
    logits = (HEAD_W @ next_hidden + HEAD_B).astype(np.float32)
    if not np.isfinite(next_hidden).all() or not np.isfinite(logits).all():
        raise RuntimeError("non-finite neural state")
    return logits, next_hidden


def generate(user: str, max_chars: int = 100) -> str:
    prompt = f"user: {user}\nroger: "[-int(CFG.get("prime_chars", 360)):]
    hidden = np.zeros(H, dtype=np.float32)
    seen = ""
    logits = None
    for ch in prompt:
        seen += ch
        logits, hidden = step(fnv1a(seen[-int(CFG.get("context_chars", 4)):]), hidden)
    assert logits is not None

    answer = ""
    generated = prompt
    for _ in range(max_chars):
        # Greedy decoding makes CI deterministic. Production sampling is intentionally less rigid.
        token_id = int(np.argmax(logits))
        ch = VOCAB[token_id]
        answer += ch
        generated += ch
        if answer.endswith("\n\n") or "\nuser:" in answer:
            break
        logits, hidden = step(fnv1a(generated[-int(CFG.get("context_chars", 4)):]), hidden)
    return answer.split("\nuser:", 1)[0].strip()


def bad_loop(text: str) -> bool:
    if len(text) >= 8 and len(set(text[-8:])) == 1:
        return True
    if len(text) >= 48 and text[-24:] == text[-48:-24]:
        return True
    return False


def main() -> None:
    test = CFG.get("self_test") or {}
    context_id = fnv1a(str(test.get("context", "")))
    if context_id != int(test.get("context_id", -1)):
        raise SystemExit("self-test hash mismatch")
    logits, _ = step(context_id, np.zeros(H, dtype=np.float32))
    for idx, expected in zip(test.get("logit_indices", []), test.get("logit_values", [])):
        actual = float(logits[int(idx)])
        if abs(actual - float(expected)) > float(test.get("tolerance", 0.06)):
            raise SystemExit(f"self-test logit mismatch at {idx}: {actual} vs {expected}")

    prompts = [
        "hi",
        "how is it going",
        "who are you",
        "still broken",
        "what is a neural network",
        "im confused",
        "tell me a joke",
        "geometry dash",
    ]
    for prompt in prompts:
        reply = generate(prompt)
        print(f"> {prompt}\n{reply or '[empty]'}\n")
        if not reply:
            raise SystemExit(f"empty greedy reply for {prompt!r}")
        if bad_loop(reply):
            raise SystemExit(f"obvious output loop for {prompt!r}: {reply!r}")
        if any(ord(ch) > 126 and ch != "\n" for ch in reply):
            raise SystemExit(f"non-ASCII output for {prompt!r}")

    print("PASS: exported v0.4 weights survive deterministic inference smoke tests")


if __name__ == "__main__":
    main()
