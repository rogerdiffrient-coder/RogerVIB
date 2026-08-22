#!/usr/bin/env python3
"""Run browser-equivalent inference directly from the exported v0.4 binary files."""
from __future__ import annotations

import json
import os
import random
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "micro-v0.4"
CFG = json.loads((MODEL_DIR / "config.json").read_text(encoding="utf-8"))
H = int(CFG["hidden_size"])
BUCKETS = int(CFG["hash_buckets"])
VOCAB = list(CFG["vocab"])
FILES = CFG["files"]
REPORT_PATH = os.environ.get("ROGERVIB_QUALITY_REPORT", "").strip()


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


def sample(logits: np.ndarray, temp: float, top_k: int, recent: str, rng: random.Random) -> int:
    """Mirror micro/neural-v04-native.js sampling closely, but deterministically."""
    last = recent[-1:] if recent else ""
    ranked: list[tuple[float, int]] = []
    for index, raw in enumerate(logits):
        score = float(raw)
        ch = VOCAB[index]
        if ch == last:
            score -= 0.28
        if len(recent) >= 4 and recent.endswith(ch * 4):
            score -= 2.0
        if np.isfinite(score):
            ranked.append((score, index))
    ranked.sort(reverse=True)
    ranked = ranked[:top_k]
    if not ranked:
        raise RuntimeError("no valid logits")
    maximum = ranked[0][0]
    probs = [np.exp((score - maximum) / max(0.05, temp)) for score, _ in ranked]
    total = float(sum(probs))
    pick = rng.random() * total
    for probability, (_, index) in zip(probs, ranked):
        pick -= float(probability)
        if pick <= 0:
            return index
    return ranked[0][1]


def generate(user: str, max_chars: int = 120, seed: int | None = None) -> str:
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
    rng = random.Random(seed) if seed is not None else None
    for i in range(max_chars):
        if rng is None:
            token_id = int(np.argmax(logits))
        else:
            token_id = sample(logits, 0.48 if i < 10 else 0.62, 7 if i < 10 else 11, answer, rng)
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


def language_like(text: str) -> bool:
    """Reject printable-ASCII punctuation soup while allowing casual chat."""
    if not text or not re.search(r"[A-Za-z]{2,}", text):
        return False
    visible = [ch for ch in text if ch != "\n"]
    if not visible:
        return False
    alpha_space = sum(ch.isalpha() or ch.isspace() for ch in visible)
    symbol_count = sum(not (ch.isalnum() or ch.isspace() or ch in "'.,!?-:;()") for ch in visible)
    return alpha_space / len(visible) >= 0.62 and symbol_count / len(visible) <= 0.08


def write_report(lines: list[str]) -> None:
    if not REPORT_PATH:
        return
    path = Path(REPORT_PATH)
    if not path.is_absolute():
        path = ROOT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    report = [
        "RogerVIB Micro v0.4 candidate quality report",
        f"artifact_revision={CFG.get('artifact_revision', '')}",
        f"hidden_size={H}",
        f"hash_buckets={BUCKETS}",
        "",
    ]

    test = CFG.get("self_test") or {}
    context_id = fnv1a(str(test.get("context", "")))
    if context_id != int(test.get("context_id", -1)):
        write_report(report + ["FAIL: self-test hash mismatch"])
        raise SystemExit("self-test hash mismatch")
    logits, _ = step(context_id, np.zeros(H, dtype=np.float32))
    for idx, expected in zip(test.get("logit_indices", []), test.get("logit_values", [])):
        actual = float(logits[int(idx)])
        if abs(actual - float(expected)) > float(test.get("tolerance", 0.06)):
            write_report(report + [f"FAIL: self-test logit mismatch at {idx}: {actual} vs {expected}"])
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

    cases: list[tuple[str, str, str]] = []
    for prompt in prompts:
        cases.append((prompt, "greedy", generate(prompt)))
        for seed in (7, 23):
            cases.append((prompt, f"sample-{seed}", generate(prompt, seed=seed)))

    nonempty = 0
    looping = 0
    language = 0
    for prompt, mode, reply in cases:
        ok_language = language_like(reply)
        ok_loop = not bad_loop(reply)
        report.extend([
            f"> {prompt} [{mode}]",
            reply or "[empty]",
            f"language_like={ok_language} loop_free={ok_loop}",
            "",
        ])
        print(f"> {prompt} [{mode}]\n{reply or '[empty]'}\n")
        if reply:
            nonempty += 1
        if not ok_loop:
            looping += 1
        if ok_language:
            language += 1
        if any(ord(ch) > 126 and ch != "\n" for ch in reply):
            write_report(report + [f"FAIL: non-ASCII output for {prompt!r} ({mode})"])
            raise SystemExit(f"non-ASCII output for {prompt!r}")

    total = len(cases)
    summary = f"RESULT: {nonempty}/{total} non-empty, {language}/{total} language-like, {looping}/{total} looping"
    report.append(summary)
    write_report(report)

    if nonempty < total - 2:
        raise SystemExit(f"only {nonempty}/{total} candidate replies were non-empty")
    if looping > 2:
        raise SystemExit(f"{looping}/{total} candidate replies fell into obvious loops")
    # Require both greedy and stochastic generation to be consistently language-like.
    if language < int(total * 0.80):
        raise SystemExit(f"only {language}/{total} replies looked language-like; refusing to publish candidate")

    print(f"PASS: {summary}")


if __name__ == "__main__":
    main()
