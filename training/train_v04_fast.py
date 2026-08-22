#!/usr/bin/env python3
"""Observable, resumable RogerVIB Micro v0.4 training profile.

The workflow runs exactly one epoch per process. After each epoch this script saves
optimizer/model state and exports a complete browser-native checkpoint. This lets
GitHub Actions report and upload every epoch instead of disappearing inside one
long opaque training step.
"""
from __future__ import annotations

import json
import os
import random
from datetime import datetime, timezone
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

STATE_PATH = Path(os.environ.get("ROGERVIB_STATE_PATH", base.TRAINING_DIR / ".v04_state.pt"))
RESULT_PATH = Path(os.environ.get("ROGERVIB_EPOCH_RESULT", base.TRAINING_DIR / "latest_v04_epoch_result.json"))


def fast_build_corpus(pairs: list[tuple[str, str]]) -> str:
    # Re-seed here so every epoch process rebuilds the exact same corpus.
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


def build_model_and_optimizers():
    model = base.RogerVIBV04()
    emb_opt = torch.optim.SparseAdam(model.context.parameters(), lr=base.LR)
    dense_params = list(model.gru.parameters()) + list(model.head.parameters())
    dense_opt = torch.optim.AdamW(dense_params, lr=base.LR, weight_decay=0.01)
    return model, emb_opt, dense_opt, dense_params


def load_or_initialize(epoch: int):
    model, emb_opt, dense_opt, dense_params = build_model_and_optimizers()
    if epoch == 1:
        with torch.no_grad():
            model.context.weight.zero_()
        print("initialized fresh zero-row candidate", flush=True)
    else:
        if not STATE_PATH.exists():
            raise FileNotFoundError(f"cannot resume epoch {epoch}: missing {STATE_PATH}")
        state = torch.load(STATE_PATH, map_location="cpu", weights_only=False)
        completed = int(state.get("epoch", 0))
        if completed != epoch - 1:
            raise RuntimeError(f"resume mismatch: state is epoch {completed}, requested epoch {epoch}")
        model.load_state_dict(state["model"])
        emb_opt.load_state_dict(state["emb_opt"])
        dense_opt.load_state_dict(state["dense_opt"])
        print(f"resumed from epoch {completed}", flush=True)
    return model, emb_opt, dense_opt, dense_params


def train_one_epoch(epoch: int) -> tuple[base.RogerVIBV04, float]:
    pairs = base.load_pairs()
    corpus = fast_build_corpus(pairs)
    xs, ys = base.make_sequences(corpus)
    model, emb_opt, dense_opt, dense_params = load_or_initialize(epoch)

    params = base.parameter_count(model)
    assert params == 10_049_184, params
    print(f"parameters: {params:,}", flush=True)
    print(f"quality architecture: {base.HASH_BUCKETS:,} buckets x {base.HIDDEN} hidden", flush=True)
    print(f"training sequences: {xs.shape[0]:,} x {base.SEQ} chars", flush=True)
    print(f"BEGIN EPOCH {epoch}/{base.EPOCHS}", flush=True)

    # Deterministic but different shuffle for each epoch, independent of process restarts.
    generator = torch.Generator().manual_seed(base.SEED + epoch * 1009)
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
    print(f"END EPOCH {epoch}/{base.EPOCHS} loss={avg_loss:.4f}", flush=True)

    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "epoch": epoch,
            "model": model.state_dict(),
            "emb_opt": emb_opt.state_dict(),
            "dense_opt": dense_opt.state_dict(),
            "loss": avg_loss,
        },
        STATE_PATH,
    )
    return model, avg_loss


def export_checkpoint(model: base.RogerVIBV04, epoch: int, loss: float) -> Path:
    checkpoint_dir = Path(
        os.environ.get(
            "ROGERVIB_CHECKPOINT_DIR",
            base.ROOT / "models" / "micro-v0.4-checkpoints" / f"epoch-{epoch}",
        )
    )
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    old_out = base.OUT_DIR
    try:
        base.OUT_DIR = checkpoint_dir
        base.export(model)
    finally:
        base.OUT_DIR = old_out

    config_path = checkpoint_dir / "config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config.update(
        {
            "training_epoch": epoch,
            "training_epochs": base.EPOCHS,
            "training_loss": loss,
            "training_profile": "quality-h112-zero-init-resumable",
            "checkpoint": True,
        }
    )
    config_path.write_text(json.dumps(config, indent=2), encoding="utf-8")

    result = {
        "epoch": epoch,
        "epochs": base.EPOCHS,
        "loss": loss,
        "artifact_revision": config["artifact_revision"],
        "parameter_count": config["parameter_count"],
        "hidden_size": config["hidden_size"],
        "hash_buckets": config["hash_buckets"],
        "checkpoint_dir": str(checkpoint_dir.relative_to(base.ROOT)),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(
        f"CHECKPOINT READY epoch={epoch}/{base.EPOCHS} loss={loss:.4f} "
        f"revision={config['artifact_revision']} dir={result['checkpoint_dir']}",
        flush=True,
    )
    return checkpoint_dir


def main() -> None:
    epoch = int(os.environ.get("ROGERVIB_EPOCH", "0"))
    if not 1 <= epoch <= base.EPOCHS:
        raise SystemExit(f"ROGERVIB_EPOCH must be 1..{base.EPOCHS}; got {epoch}")
    model, loss = train_one_epoch(epoch)
    export_checkpoint(model, epoch, loss)


if __name__ == "__main__":
    main()
