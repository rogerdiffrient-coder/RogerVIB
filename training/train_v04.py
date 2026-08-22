#!/usr/bin/env python3
"""Train and export RogerVIB Micro v0.4.

Architecture: learned hashed 4-character context embedding + GRU + character head.
Training is developer-side. Export is a lightweight browser-native binary format:
int8 embedding rows with per-row scales, plus float32 GRU/head weights.
"""
from __future__ import annotations

import json
import os
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[1]
TRAINING_DIR = ROOT / "training"
OUT_DIR = ROOT / "models" / "micro-v0.4"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SEED = 404
random.seed(SEED)
torch.manual_seed(SEED)

VOCAB = ["\n"] + [chr(i) for i in range(32, 127)]
TO_ID = {c: i for i, c in enumerate(VOCAB)}
UNK_ID = TO_ID["?"]

# 104,000 * 96 = 9,984,000 parameters in the context table.
# Small GRU + output head brings total to 10,049,184 parameters.
HASH_BUCKETS = 104_000
HIDDEN = 96
SEQ = 96
BATCH = 32
EPOCHS = int(os.environ.get("ROGERVIB_EPOCHS", "5"))
LR = float(os.environ.get("ROGERVIB_LR", "0.0025"))


def sanitize(text: str) -> str:
    return "".join(c if c in TO_ID else "?" for c in str(text))


def fnv1a(text: str) -> int:
    h = 2166136261
    for b in text.encode("ascii", "replace"):
        h ^= b
        h = (h * 16777619) & 0xFFFFFFFF
    return h % HASH_BUCKETS


def context_hashes(text: str) -> list[int]:
    return [fnv1a(text[max(0, i - 3): i + 1]) for i in range(len(text))]


def load_pairs() -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    sources = sorted(TRAINING_DIR.glob("v04_corpus*.jsonl"))
    if not sources:
        raise FileNotFoundError("no training/v04_corpus*.jsonl files found")
    for source in sources:
        count = 0
        with source.open("r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, 1):
                if not line.strip():
                    continue
                row = json.loads(line)
                user = sanitize(row.get("user", "")).strip()
                assistant = sanitize(row.get("assistant", "")).strip()
                if not user or not assistant:
                    raise ValueError(f"{source.name}:{line_no} has an empty user/assistant field")
                pairs.append((user, assistant))
                count += 1
        print(f"loaded {count:,} curated pairs from {source.name}")
    return pairs


def variants(text: str) -> list[str]:
    base = sanitize(text.strip())
    out = {base, base.lower()}
    if base.endswith("?"):
        out.add(base[:-1])
    else:
        out.add(base + "?")
    out.add(base.replace("'", ""))
    out.add(base.replace("you are", "youre"))
    out.add(base.replace("i am", "im"))
    return [x for x in out if x]


def build_corpus(pairs: list[tuple[str, str]]) -> str:
    blocks: list[str] = []
    for user, assistant in pairs:
        for u in variants(user):
            blocks.append(f"user: {u}\nroger: {assistant}\n\n")

    followups = [
        ("huh", "yeah that probably needed a better explanation. what part was confusing?"),
        ("why", "why what? point me at the thing youre asking about."),
        ("really", "yep."),
        ("ok", "yep"),
        ("what", "what part?"),
        ("keep going", "sure. what part do you want more detail on?"),
        ("that makes no sense", "yeah, then i probably messed that answer up. tell me which part and ill try again."),
        ("you misunderstood me", "my bad. say it another way or point out what i got wrong and ill try again."),
        ("still broken", "then the last fix didnt solve the real cause. lets use the exact error and trace it."),
        ("stop repeating yourself", "fair. ill try a different answer instead of looping."),
        ("simpler", "yep. ill keep it simpler."),
        ("shorter", "got it. shorter answers."),
    ]
    for _ in range(700):
        a = random.choice(pairs)
        b = random.choice(pairs)
        f = random.choice(followups)
        blocks.append(
            f"user: {a[0]}\nroger: {a[1]}\n"
            f"user: {f[0]}\nroger: {f[1]}\n"
            f"user: {b[0]}\nroger: {b[1]}\n\n"
        )

    # Extra plain English gives the character model more grammatical transitions without
    # pretending to provide giant-model world knowledge.
    subjects = ["the model", "the program", "the browser", "the player", "the level", "the code", "the network", "the dataset", "the function", "the game", "the test", "the user"]
    verbs = ["uses", "needs", "keeps", "changes", "stores", "predicts", "checks", "builds", "reads", "creates", "returns", "loads"]
    objects = ["context", "data", "a value", "the next step", "a result", "a small state", "an answer", "a pattern", "a sequence", "the current input", "the model weights", "an error"]
    endings = ["carefully", "during inference", "when needed", "one step at a time", "before returning", "while the program runs", "from the recent context", "without changing the weights", "before the next step", "only after validation"]
    for _ in range(3500):
        blocks.append(f"{random.choice(subjects)} {random.choice(verbs)} {random.choice(objects)} {random.choice(endings)}.\n")

    random.shuffle(blocks)
    text = "".join(blocks)
    print(f"training corpus: {len(text):,} characters from {len(pairs)} curated pairs")
    return text


class RogerVIBV04(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.context = nn.Embedding(HASH_BUCKETS, HIDDEN, sparse=True)
        self.gru = nn.GRU(HIDDEN, HIDDEN, num_layers=1, batch_first=True)
        self.head = nn.Linear(HIDDEN, len(VOCAB))

    def forward(self, ids: torch.Tensor, hidden: torch.Tensor | None = None):
        x = self.context(ids)
        y, hidden = self.gru(x, hidden)
        return self.head(y), hidden


def parameter_count(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())


def make_sequences(text: str):
    chars = list(sanitize(text))
    hashes = context_hashes("".join(chars))
    targets = [TO_ID.get(c, UNK_ID) for c in chars]
    xs = hashes[:-1]
    ys = targets[1:]
    usable = (len(xs) // SEQ) * SEQ
    xs = torch.tensor(xs[:usable], dtype=torch.long).reshape(-1, SEQ)
    ys = torch.tensor(ys[:usable], dtype=torch.long).reshape(-1, SEQ)
    return xs, ys


def train() -> RogerVIBV04:
    pairs = load_pairs()
    corpus = build_corpus(pairs)
    xs, ys = make_sequences(corpus)
    model = RogerVIBV04()
    params = parameter_count(model)
    assert params == 10_049_184, params
    print(f"parameters: {params:,}")
    print(f"training sequences: {xs.shape[0]:,} x {SEQ} chars")

    emb_opt = torch.optim.SparseAdam(model.context.parameters(), lr=LR)
    dense_params = list(model.gru.parameters()) + list(model.head.parameters())
    dense_opt = torch.optim.AdamW(dense_params, lr=LR, weight_decay=0.01)

    indices = list(range(xs.shape[0]))
    model.train()
    for epoch in range(EPOCHS):
        random.shuffle(indices)
        total = 0.0
        seen = 0
        for start in range(0, len(indices), BATCH):
            batch_ids = indices[start:start + BATCH]
            xb = xs[batch_ids]
            yb = ys[batch_ids]
            emb_opt.zero_grad()
            dense_opt.zero_grad()
            logits, _ = model(xb)
            loss = F.cross_entropy(logits.reshape(-1, len(VOCAB)), yb.reshape(-1))
            loss.backward()
            torch.nn.utils.clip_grad_norm_(dense_params, 1.0)
            emb_opt.step()
            dense_opt.step()
            total += float(loss) * len(batch_ids)
            seen += len(batch_ids)
        print(f"epoch {epoch + 1}/{EPOCHS} loss={total / max(seen, 1):.4f}")
    return model


def write_f32(name: str, tensor: torch.Tensor) -> None:
    arr = tensor.detach().cpu().contiguous().numpy().astype("<f4", copy=False)
    (OUT_DIR / name).write_bytes(arr.tobytes(order="C"))


def export(model: RogerVIBV04) -> None:
    model.eval()
    params = parameter_count(model)

    # Per-row int8 quantization cuts the giant embedding table from ~40 MB to ~10 MB.
    emb = model.context.weight.detach().cpu().numpy().astype(np.float32, copy=False)
    scales = np.max(np.abs(emb), axis=1).astype(np.float32) / 127.0
    scales[scales == 0] = 1.0
    quant = np.clip(np.rint(emb / scales[:, None]), -127, 127).astype(np.int8)
    (OUT_DIR / "embedding.i8").write_bytes(quant.tobytes(order="C"))
    (OUT_DIR / "embedding-scales.f32").write_bytes(scales.astype("<f4", copy=False).tobytes(order="C"))

    write_f32("gru-weight-ih.f32", model.gru.weight_ih_l0)
    write_f32("gru-weight-hh.f32", model.gru.weight_hh_l0)
    write_f32("gru-bias-ih.f32", model.gru.bias_ih_l0)
    write_f32("gru-bias-hh.f32", model.gru.bias_hh_l0)
    write_f32("head-weight.f32", model.head.weight)
    write_f32("head-bias.f32", model.head.bias)

    for stale in ("model.onnx", "model.onnx.data"):
        path = OUT_DIR / stale
        if path.exists():
            path.unlink()

    config = {
        "name": "RogerVIB Micro v0.4 Neural",
        "version": "0.4",
        "format": "rogervib-gru-i8-v1",
        "architecture": "hashed 4-char int8 embedding + float32 GRU character language model",
        "parameter_count": params,
        "hash_buckets": HASH_BUCKETS,
        "hidden_size": HIDDEN,
        "context_chars": 4,
        "vocab": "".join(VOCAB),
        "max_reply_chars": 180,
        "prime_chars": 420,
        "files": {
            "embedding": "embedding.i8",
            "embedding_scales": "embedding-scales.f32",
            "gru_weight_ih": "gru-weight-ih.f32",
            "gru_weight_hh": "gru-weight-hh.f32",
            "gru_bias_ih": "gru-bias-ih.f32",
            "gru_bias_hh": "gru-bias-hh.f32",
            "head_weight": "head-weight.f32",
            "head_bias": "head-bias.f32"
        }
    }
    (OUT_DIR / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT_DIR.iterdir() if p.is_file())
    print(f"exported browser-native v0.4 weights ({total / 1_000_000:.1f} MB total)")


if __name__ == "__main__":
    trained = train()
    export(trained)
