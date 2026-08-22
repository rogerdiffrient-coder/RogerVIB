#!/usr/bin/env python3
"""Epoch-by-epoch trainer for RogerVIB v0.5 \"Damn Daniel\"."""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import torch
import torch.nn.functional as F

import train_v04 as base
import train_v04_fast as v04fast

# 163,459*152 + 6*152^2 + 102*152 + 96 = 24,999,992 params.
base.HIDDEN = 152
base.HASH_BUCKETS = 163_459
base.BATCH = 96
TOTAL_EPOCHS = 25
EXPECTED_PARAMS = 24_999_992


def build_training_objects():
    pairs = base.load_pairs()
    corpus = v04fast.fast_build_corpus(pairs)
    xs, ys = base.make_sequences(corpus)
    model = base.RogerVIBV04()
    with torch.no_grad():
        model.context.weight.zero_()
    params = base.parameter_count(model)
    assert params == EXPECTED_PARAMS, params
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
    print(f"resumed Damn Daniel from epoch {got}", flush=True)


def save_state(path: Path, epoch: int, model, emb_opt, dense_opt, loss: float) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "format": "rogervib-v05-training-checkpoint-v1",
        "name": "Damn Daniel",
        "epoch": epoch,
        "total_epochs": TOTAL_EPOCHS,
        "loss": loss,
        "architecture": {"hash_buckets": base.HASH_BUCKETS, "hidden_size": base.HIDDEN},
        "parameter_count": EXPECTED_PARAMS,
        "model": model.state_dict(),
        "embedding_optimizer": emb_opt.state_dict(),
        "dense_optimizer": dense_opt.state_dict(),
        "python_random_state": random.getstate(),
        "torch_random_state": torch.get_rng_state(),
    }, path)
    print(f"saved resumable Damn Daniel checkpoint: {path} ({path.stat().st_size/1_000_000:.1f} MB)", flush=True)


def train_one_epoch(epoch: int, resume: Path | None, checkpoint: Path, export_dir: Path) -> dict:
    if not 1 <= epoch <= TOTAL_EPOCHS:
        raise ValueError(f"epoch must be 1..{TOTAL_EPOCHS}")
    xs, ys, model, emb_opt, dense_opt, dense_params = build_training_objects()
    print("RogerVIB v0.5 \"Damn Daniel\"", flush=True)
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
    print(f"DAMN_DANIEL_EPOCH_COMPLETE epoch={epoch}/{TOTAL_EPOCHS} loss={avg_loss:.6f}", flush=True)
    save_state(checkpoint, epoch, model, emb_opt, dense_opt, avg_loss)

    old_out = base.OUT_DIR
    try:
        base.OUT_DIR = export_dir
        export_dir.mkdir(parents=True, exist_ok=True)
        base.export(model)
        cfg_path = export_dir / "config.json"
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        cfg.update({
            "name": f"RogerVIB v0.5 Damn Daniel CHECKPOINT {epoch}/{TOTAL_EPOCHS}",
            "codename": "Damn Daniel",
            "version": "0.5",
            "parameter_count": EXPECTED_PARAMS,
            "preview": epoch < TOTAL_EPOCHS,
            "training_epoch": epoch,
            "training_epochs": TOTAL_EPOCHS,
            "training_loss": avg_loss,
            "training_profile": "damn-daniel-h152-25m-25epoch",
        })
        cfg_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    finally:
        base.OUT_DIR = old_out

    return {
        "name": "Damn Daniel", "version": "0.5", "epoch": epoch,
        "total_epochs": TOTAL_EPOCHS, "loss": avg_loss,
        "parameter_count": EXPECTED_PARAMS, "checkpoint": str(checkpoint),
        "export_dir": str(export_dir),
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--epoch", type=int, required=True)
    p.add_argument("--resume", type=Path)
    p.add_argument("--checkpoint", type=Path, required=True)
    p.add_argument("--export-dir", type=Path, required=True)
    p.add_argument("--result", type=Path, required=True)
    a = p.parse_args()
    result = train_one_epoch(a.epoch, a.resume, a.checkpoint, a.export_dir)
    a.result.parent.mkdir(parents=True, exist_ok=True)
    a.result.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"RESULT_WRITTEN {a.result}", flush=True)


if __name__ == "__main__":
    main()
