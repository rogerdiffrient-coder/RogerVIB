#!/usr/bin/env python3
"""Strict sanity checks for the shipped RogerVIB Micro v0.4 artifact."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "micro-v0.4"
CONFIG_PATH = MODEL_DIR / "config.json"
TRAINING_DIR = ROOT / "training"

EXPECTED_PARAMS = 10_049_184
EXPECTED_FORMAT = "rogervib-gru-i8-v1"
EXPECTED_HIDDEN = 96
EXPECTED_BUCKETS = 104_000
EXPECTED_VOCAB = 96
MIN_CURATED_PAIRS = 180


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def expect_file(path: Path, size: int | None = None) -> None:
    if not path.is_file():
        fail(f"missing {path.relative_to(ROOT)}")
    actual = path.stat().st_size
    if size is not None and actual != size:
        fail(f"{path.name} has {actual:,} bytes; expected {size:,}")
    if actual <= 0:
        fail(f"{path.name} is empty")


def main() -> None:
    expect_file(CONFIG_PATH)
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))

    if cfg.get("format") != EXPECTED_FORMAT:
        fail(f"config format is {cfg.get('format')!r}; expected {EXPECTED_FORMAT!r}")
    if int(cfg.get("parameter_count", 0)) != EXPECTED_PARAMS:
        fail(f"parameter_count is {cfg.get('parameter_count')}; expected {EXPECTED_PARAMS}")
    if int(cfg.get("hidden_size", 0)) != EXPECTED_HIDDEN:
        fail("hidden_size mismatch")
    if int(cfg.get("hash_buckets", 0)) != EXPECTED_BUCKETS:
        fail("hash_buckets mismatch")

    vocab = str(cfg.get("vocab", ""))
    if len(vocab) != EXPECTED_VOCAB or len(set(vocab)) != EXPECTED_VOCAB:
        fail(f"vocab should contain {EXPECTED_VOCAB} unique characters; got {len(vocab)}")

    self_test = cfg.get("self_test") or {}
    indices = self_test.get("logit_indices") or []
    values = self_test.get("logit_values") or []
    if not str(self_test.get("context", "")):
        fail("config self_test.context is missing")
    if not isinstance(self_test.get("context_id"), int):
        fail("config self_test.context_id must be an integer")
    if len(indices) < 5 or len(indices) != len(values):
        fail("config self-test needs matching logit probe arrays")
    if any(not isinstance(i, int) or i < 0 or i >= EXPECTED_VOCAB for i in indices):
        fail("config self-test contains invalid logit indices")
    if not (0 < float(self_test.get("tolerance", 0)) <= 0.2):
        fail("config self-test tolerance is invalid")

    files = cfg.get("files") or {}
    expected = {
        "embedding": EXPECTED_BUCKETS * EXPECTED_HIDDEN,
        "embedding_scales": EXPECTED_BUCKETS * 4,
        "gru_weight_ih": 3 * EXPECTED_HIDDEN * EXPECTED_HIDDEN * 4,
        "gru_weight_hh": 3 * EXPECTED_HIDDEN * EXPECTED_HIDDEN * 4,
        "gru_bias_ih": 3 * EXPECTED_HIDDEN * 4,
        "gru_bias_hh": 3 * EXPECTED_HIDDEN * 4,
        "head_weight": EXPECTED_VOCAB * EXPECTED_HIDDEN * 4,
        "head_bias": EXPECTED_VOCAB * 4,
    }
    for key, size in expected.items():
        name = files.get(key)
        if not name:
            fail(f"config missing files.{key}")
        expect_file(MODEL_DIR / name, size)

    for obsolete in ("model.onnx", "model.onnx.data"):
        if (MODEL_DIR / obsolete).exists():
            fail(f"obsolete {obsolete} is still present")

    sources = sorted(TRAINING_DIR.glob("v04_corpus*.jsonl"))
    if not sources:
        fail("no training/v04_corpus*.jsonl files found")

    pairs = 0
    seen_users: set[str] = set()
    duplicate_users: set[str] = set()
    for source in sources:
        source_pairs = 0
        for line_no, line in enumerate(source.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except Exception as exc:
                fail(f"{source.name}:{line_no} is invalid JSON: {exc}")
            user = str(row.get("user", "")).strip()
            assistant = str(row.get("assistant", "")).strip()
            if not user or not assistant:
                fail(f"{source.name}:{line_no} needs non-empty user and assistant text")
            normalized = user.lower()
            if normalized in seen_users:
                duplicate_users.add(normalized)
            seen_users.add(normalized)
            pairs += 1
            source_pairs += 1
        print(f"corpus: {source.name} -> {source_pairs} pairs")

    if pairs < MIN_CURATED_PAIRS:
        fail(f"only {pairs} curated pairs; require at least {MIN_CURATED_PAIRS}")
    if len(seen_users) < int(MIN_CURATED_PAIRS * 0.9):
        fail("too many duplicate user prompts in curated corpus")
    if duplicate_users:
        print(f"warning: {len(duplicate_users)} exact duplicate user prompts across corpus files")

    total_bytes = sum((MODEL_DIR / files[k]).stat().st_size for k in expected)
    print("PASS: v0.4 artifact is internally consistent")
    print(f"      {EXPECTED_PARAMS:,} parameters, {pairs} curated pairs, {total_bytes/1_000_000:.2f} MB shipped weights")


if __name__ == "__main__":
    main()
