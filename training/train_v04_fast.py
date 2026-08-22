#!/usr/bin/env python3
"""Stateful RogerVIB Micro v0.4 quality training, one epoch per invocation.

The GitHub workflow calls this script once per epoch so it can report progress,
publish a live preview, and upload a full checkpoint between epochs.
"""
from __future__ import annotations

import argparse
import json
import random
import shutil
import time
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
base.EPOCHS = 5

STATE_PATH = base.TRAINING_DIR / "v04_epoch_state.pt"
CHECKPOINT_ROOT = base.TRAINING_DIR / "v04_checkpoints"


def fast_build_corpus(pairs: list[tuple[str, str]]) -> str:
    # Re-seed on every invocation so every epoch sees the exact same corpus.
    random.seed(base.SEED)
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
        a = random.choice(answers)
        b = random.choice(answers)
        blocks.append(f"{a}\n{b}\n")

    random.shuffle(blocks)
    text = "".join(blocks)
    print(f"FAST training corpus: {len(text):,} characters from {len(pairs)} curated pairs", flush=True)
    return text


def build_training_objects():
    pairs = base.load_pairs()
    corpus = fast_build_corpus(pairs)
    xs, ys = base.make_sequences(corpus)
    model = base.RogerVIBV04()
    params = base.parameter_count(model)
    assert params == 10_049_184, params

    emb_opt = torch.optim.SparseAdam(model.context.parameters(), lr=base.LR)
    dense_params = list(model.gru.parameters()) + list(model.head.parameters())
    dense_opt = torch.optim.AdamW(dense_params, lr=base.LR, weight_decay=0.01)
    return xs, ys, model, emb_opt, dense_params, dense_opt


def load_or_initialize(epoch: int):
    xs, ys, model, emb_opt, dense_params, dense_opt = build_training_objects()

    if epoch == 1:
        if STATE_PATH.exists():
            STATE_PATH.unlink()
        if CHECKPOINT_ROOT.exists():
            shutil.rmtree(CHECKPOINT_ROOT)
        with torch.no_grad():
            model.context.weight.zero_()
        completed = 0
    else:
        if not STATE_PATH.exists():
            raise RuntimeError(f"cannot start epoch {epoch}: {STATE_PATH.name} is missing")
        state = torch.load(STATE_PATH, map_location="cpu", weights_only=False)
        completed = int(state.get("epoch", -1))
        if completed != epoch - 1:
            raise RuntimeError(f"cannot start epoch {epoch}: saved state is at epoch {completed}")
        if int(state.get("hidden", -1)) != base.HIDDEN or int(state.get("hash_buckets", -1)) != base.HASH_BUCKETS:
            raise RuntimeError("saved state architecture does not match this trainer")
        model.load_state_dict(state["model"])
        emb_opt.load_state_dict(state["emb_opt"])
        dense_opt.load_state_dict(state["dense_opt"])

    print(f"parameters: {base.parameter_count(model):,}", flush=True)
    print(f"quality architecture: {base.HASH_BUCKETS:,} buckets x {base.HIDDEN} hidden", flush=True)
    print(f"training sequences: {xs.shape[0]:,} x {base.SEQ} chars", flush=True)
    print(f"resuming from completed epoch {completed}", flush=True)
    return xs, ys, model, emb_opt, dense_params, dense_opt


def save_state(epoch: int, model, emb_opt, dense_opt) -> None:
    torch.save(
        {
            "epoch": epoch,
            "hidden": base.HIDDEN,
            "hash_buckets": base.HASH_BUCKETS,
            "model": model.state_dict(),
            "emb_opt": emb_opt.state_dict(),
            "dense_opt": dense_opt.state_dict(),
        },
        STATE_PATH,
    )


def export_checkpoint(epoch: int, model) -> tuple[Path, str]:
    checkpoint_dir = CHECKPOINT_ROOT / f"epoch-{epoch}"
    if checkpoint_dir.exists():
        shutil.rmtree(checkpoint_dir)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    old_out = base.OUT_DIR
    try:
        base.OUT_DIR = checkpoint_dir
        base.export(model)
    finally:
        base.OUT_DIR = old_out

    config_path = checkpoint_dir / "config.json"
    cfg = json.loads(config_path.read_text(encoding="utf-8"))
    cfg["name"] = f"RogerVIB Micro v0.4 CHECKPOINT {epoch}/{base.EPOCHS}"
    cfg["preview"] = True
    cfg["training_epoch"] = epoch
    cfg["training_epochs"] = base.EPOCHS
    cfg["training_profile"] = "quality-h112-stateful-telemetry"
    config_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    return checkpoint_dir, str(cfg["artifact_revision"])


def train_one_epoch(epoch: int) -> None:
    if epoch < 1 or epoch > base.EPOCHS:
        raise SystemExit(f"epoch must be between 1 and {base.EPOCHS}")

    started = time.time()
    xs, ys, model, emb_opt, dense_params, dense_opt = load_or_initialize(epoch)

    # Deterministic but different order for each epoch.
    generator = torch.Generator().manual_seed(base.SEED + epoch)
    order = torch.randperm(xs.shape[0], generator=generator)
    total = 0.0
    seen = 0
    model.train()
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
    save_state(epoch, model, emb_opt, dense_opt)
    checkpoint_dir, revision = export_checkpoint(epoch, model)
    elapsed = time.time() - started

    metrics = {
        "status": "epoch_complete",
        "epoch": epoch,
        "epochs": base.EPOCHS,
        "loss": avg_loss,
        "elapsed_seconds": elapsed,
        "parameter_count": base.parameter_count(model),
        "hidden_size": base.HIDDEN,
        "hash_buckets": base.HASH_BUCKETS,
        "training_sequences": int(xs.shape[0]),
        "artifact_revision": revision,
        "checkpoint_dir": str(checkpoint_dir.relative_to(base.ROOT)),
    }
    metrics_path = base.TRAINING_DIR / f"v04_epoch_{epoch}_metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"epoch {epoch}/{base.EPOCHS} loss={avg_loss:.4f} elapsed={elapsed:.1f}s", flush=True)
    print(f"checkpoint={checkpoint_dir} revision={revision}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--epoch", type=int, required=True)
    args = parser.parse_args()
    train_one_epoch(args.epoch)


if __name__ == "__main__":
    main()
