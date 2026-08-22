#!/usr/bin/env python3
"""Fast RogerVIB Micro v0.4 training profile.

This profile keeps the exact 10,049,184 parameter budget, but spends more of it
on the recurrent core and trains on substantially more connected language.
Unseen hash rows start at zero so novel contexts are neutral instead of noise.
"""
from __future__ import annotations

import json
import random
import subprocess

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
PREVIEW_DIR = base.ROOT / "models" / "micro-v0.4-preview"


def fast_build_corpus(pairs: list[tuple[str, str]]) -> str:
    blocks: list[str] = []

    # Curated user/assistant pairs are the highest-value data. Repeat them through
    # variants so common chat prefixes are seen many times instead of once.
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

    # Connected dialogue teaches the GRU what normal conversation texture looks like.
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

    # Add plain language from the curated answers themselves. This gives the
    # character model many more examples of spaces, words, punctuation, and sentence endings.
    answers = [assistant for _, assistant in pairs]
    for _ in range(2200):
        a = random.choice(answers)
        b = random.choice(answers)
        blocks.append(f"{a}\n{b}\n")

    random.shuffle(blocks)
    text = "".join(blocks)
    print(f"FAST training corpus: {len(text):,} characters from {len(pairs)} curated pairs")
    return text


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=base.ROOT, text=True, check=check)


def publish_unfinished_checkpoint(model: base.RogerVIBV04, epoch: int, total_epochs: int) -> None:
    """Export one midpoint checkpoint without disturbing the final model folder."""
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    final_out = base.OUT_DIR
    try:
        base.OUT_DIR = PREVIEW_DIR
        base.export(model)
        config_path = PREVIEW_DIR / "config.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))
        config["name"] = "RogerVIB Micro v0.4 UNFINISHED"
        config["preview"] = True
        config["training_epoch"] = epoch
        config["training_epochs"] = total_epochs
        config["training_profile"] = "quality-h112-zero-init"
        config_path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    finally:
        base.OUT_DIR = final_out

    git("config", "user.name", "RogerVIB Trainer")
    git("config", "user.email", "actions@users.noreply.github.com")
    git("add", "-A", str(PREVIEW_DIR.relative_to(base.ROOT)))
    changed = subprocess.run(
        ["git", "diff", "--cached", "--quiet"], cwd=base.ROOT, check=False
    ).returncode != 0
    if not changed:
        print("unfinished checkpoint is unchanged; skipping preview commit")
        return

    git("commit", "-m", f"Publish RogerVIB v0.4 unfinished checkpoint epoch {epoch}/{total_epochs} [skip ci]")
    git("pull", "--rebase", "origin", "main")
    git("push", "origin", "HEAD:main")
    print(f"published live unfinished checkpoint after epoch {epoch}/{total_epochs}")


def train_fast() -> base.RogerVIBV04:
    pairs = base.load_pairs()
    corpus = fast_build_corpus(pairs)
    xs, ys = base.make_sequences(corpus)
    model = base.RogerVIBV04()

    # SparseAdam updates only rows encountered in training. Zero initialization is
    # essential: an unseen four-character context must not inject random noise.
    with torch.no_grad():
        model.context.weight.zero_()

    params = base.parameter_count(model)
    assert params == 10_049_184, params
    print(f"parameters: {params:,}")
    print(f"quality architecture: {base.HASH_BUCKETS:,} buckets x {base.HIDDEN} hidden")
    print(f"training sequences: {xs.shape[0]:,} x {base.SEQ} chars")

    emb_opt = torch.optim.SparseAdam(model.context.parameters(), lr=base.LR)
    dense_params = list(model.gru.parameters()) + list(model.head.parameters())
    dense_opt = torch.optim.AdamW(dense_params, lr=base.LR, weight_decay=0.01)

    model.train()
    preview_epoch = max(1, base.EPOCHS // 2)
    for epoch in range(base.EPOCHS):
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
        print(f"epoch {epoch + 1}/{base.EPOCHS} loss={avg_loss:.4f}")

        if epoch + 1 == preview_epoch and epoch + 1 < base.EPOCHS:
            model.eval()
            publish_unfinished_checkpoint(model, epoch + 1, base.EPOCHS)
            model.train()

    return model


if __name__ == "__main__":
    trained = train_fast()
    base.OUT_DIR = base.ROOT / "models" / "micro-v0.4"
    base.OUT_DIR.mkdir(parents=True, exist_ok=True)
    base.export(trained)
