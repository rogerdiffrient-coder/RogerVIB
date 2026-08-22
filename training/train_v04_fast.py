#!/usr/bin/env python3
"""Epoch-by-epoch RogerVIB Micro v0.4 trainer.

The workflow invokes this script once per epoch. Every invocation restores the
full model/optimizer/RNG state, trains exactly one epoch, exports browser-native
weights for that epoch, and saves a resumable PyTorch checkpoint.
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import torch
import torch.nn.functional as F

import train_v04 as base

# Exact parameter count:
# buckets*hidden + 6*hidden^2 + 102*hidden + 96
# 88,950*112 + 6*112^2 + 102*112 + 96 = 10,049,184
base.HIDDEN = 112
base.HASH_BUCKETS = 88_950
base.BATCH = 96
TOTAL_EPOCHS = 5


def fast_build_corpus(pairs: list[tuple[str, str]]) -> str:
    blocks: list[str] = []
    for user, assistant in pairs:
        for u in base.variants(user):
            blocks.append(f"user: {u}\nroger: {assistant}\n\n")

    followups = [
        ("huh", "yeah that probably needed a better explanation. what part was confusing?"),
        ("why", "why what? point me at the thing youre asking about."),
        ("ok", "yep"),
        ("what", "what part?"),
        ("still broken", "then the last fix didnt solve the real cause. lets use the exact error and trace it."),
        ("stop repeating yourself", "fair. ill try a different answer instead of looping."),
        ("simpler", "yep. ill keep it simpler."),
        ("shorter", "got it. shorter answers."),
        ("really", "yep."),
        ("continue", "sure. what do you want me to continue from?"),
    ]

    for _ in range(900):
        a = random.choice(pairs)
        b = random.choice(pairs)
        c = random.choice(pairs)
        f = random.choice(followups)
        blocks.append(
            f"user: {a[0]}\nroger: {a[1]}\n"
            f"user: {f[0]}\nroger: {f[1]}\n"
            f"user: {b[0]}\nroger: {b[1]}\n"
            f"user: {c[0]}\nroger: {c[1]}\n\n"
        )

    answers = [assistant for _, assistant in pairs]
    for _ in range(2200):
        blocks.append(f"{random.choice(answers)}\n{random.choice(answers)}\n")

    random.shuffle(blocks)
    text = "".join(blocks)
    print(f"FAST training corpus: {len(text):,} characters from {len(pairs)} curated pairs", flush=True)
    return text


def build_training_objects():
    pairs = base.load_pairs()
    corpus = fast_build_corpus(pairs)
    xs, ys = base.make_sequences(corpus)
    model = base.RogerVIBV04()
    with torch.no_grad():
        model.context.weight.zero_()

    params = base.parameter_count(model)
    assert params == 10_049_184, params
    dense_params = list(model.gru.parameters()) + list(model.head.parameters())
    emb_opt = torch.optim.SparseAdam(model.context.parameters(), lr=base.LR)
    dense_opt = torch.optim.AdamW(dense_params, lr=base.LR, weight_decay=0.01)
    return xs, ys, model, emb_opt, dense_opt, dense_params


def load_state(path: Path, model, emb_opt, dense_opt, expected_epoch: int) -> None:
    state = torch.load(path, map_location="cpu", weights_only=False)
    got = int(state["epoch"])
    if got != expected_epoch:
        raise RuntimeError(f"checkpoint epoch mismatch: expected {expected_epoch}, found {got}")
    model.load_state_dict(state["model"])
    emb_opt.load_state_dict(state["embedding_optimizer"])
    dense_opt.load_state_dict(state["dense_optimizer"])
    random.setstate(state["python_random_state"])
    torch.set_rng_state(state["torch_random_state"])
    print(f"resumed full training state from epoch {got}", flush=True)


def save_state(path: Path, epoch: int, model, emb_opt, dense_opt, loss: float) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "format": "rogervib-v04-training-checkpoint-v1",
            "epoch": epoch,
            "total_epochs": TOTAL_EPOCHS,
            "loss": loss,
            "architecture": {"hash_buckets": base.HASH_BUCKETS, "hidden_size": base.HIDDEN},
            "model": model.state_dict(),
            "embedding_optimizer": emb_opt.state_dict(),
            "dense_optimizer": dense_opt.state_dict(),
            "python_random_state": random.getstate(),
            "torch_random_state": torch.get_rng_state(),
        },
        path,
    )
    print(f"saved resumable checkpoint: {path} ({path.stat().st_size / 1_000_000:.1f} MB)", flush=True)


def train_one_epoch(epoch: int, resume: Path | None, checkpoint: Path, export_dir: Path) -> dict:
    if not 1 <= epoch <= TOTAL_EPOCHS:
        raise ValueError(f"epoch must be 1..{TOTAL_EPOCHS}")

    xs, ys, model, emb_opt, dense_opt, dense_params = build_training_objects()
    print(f"parameters: {base.parameter_count(model):,}", flush=True)
    print(f"architecture: {base.HASH_BUCKETS:,} buckets x {base.HIDDEN} hidden", flush=True)
    print(f"training sequences: {xs.shape[0]:,} x {base.SEQ} chars", flush=True)

    if epoch == 1:
        if resume is not None:
            raise ValueError("epoch 1 must not receive --resume")
    else:
        if resume is None or not resume.exists():
            raise FileNotFoundError(f"epoch {epoch} requires previous checkpoint: {resume}")
        load_state(resume, model, emb_opt, dense_opt, epoch - 1)

    model.train()
    order = torch.randperm(xs.shape[0])
    total = 0.0
    seen = 0
    for start in range(0, len(order), base.BATCH):
        batch_ids = order[start:start + base.BATCH]
        xb = xs[batch_ids]
        yb = ys[batch_ids]
        emb_opt.zero_grad(set_to_none=True)
        dense_opt.zero_grad(set_to_none=True)
        logits, _ = model(xb)
        loss = F.cross_entropy(logits.reshape(-1, len(base.VOCAB)), yb.reshape(-1))
        loss.backward()
        torch.nn.utils.clip_grad_norm_(dense_params, 1.0)
        emb_opt.step()
        dense_opt.step()
        total += float(loss) * len(batch_ids)
        seen += len(batch_ids)

    avg_loss = total / max(seen, 1)
    print(f"EPOCH_COMPLETE epoch={epoch}/{TOTAL_EPOCHS} loss={avg_loss:.6f}", flush=True)
    save_state(checkpoint, epoch, model, emb_opt, dense_opt, avg_loss)

    old_out = base.OUT_DIR
    try:
        base.OUT_DIR = export_dir
        export_dir.mkdir(parents=True, exist_ok=True)
        base.export(model)
        cfg_path = export_dir / "config.json"
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        cfg["name"] = f"RogerVIB Micro v0.4 CHECKPOINT {epoch}/{TOTAL_EPOCHS}"
        cfg["preview"] = epoch < TOTAL_EPOCHS
        cfg["training_epoch"] = epoch
        cfg["training_epochs"] = TOTAL_EPOCHS
        cfg["training_loss"] = avg_loss
        cfg["training_profile"] = "quality-h112-zero-init-epoch-telemetry"
        cfg_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    finally:
        base.OUT_DIR = old_out

    return {"epoch": epoch, "total_epochs": TOTAL_EPOCHS, "loss": avg_loss, "checkpoint": str(checkpoint), "export_dir": str(export_dir)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--epoch", type=int, required=True)
    parser.add_argument("--resume", type=Path)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--export-dir", type=Path, required=True)
    parser.add_argument("--result", type=Path, required=True)
    args = parser.parse_args()

    result = train_one_epoch(args.epoch, args.resume, args.checkpoint, args.export_dir)
    args.result.parent.mkdir(parents=True, exist_ok=True)
    args.result.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"RESULT_WRITTEN {args.result}", flush=True)


if __name__ == "__main__":
    main()
