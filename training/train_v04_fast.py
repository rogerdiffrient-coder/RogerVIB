#!/usr/bin/env python3
"""Fast RogerVIB Micro v0.4 training profile with a live unfinished checkpoint.

The real final model still trains for two epochs. After epoch 1, this script exports
and pushes a separate browser-loadable checkpoint so the site can literally chat
with RogerVIB while epoch 2 is still training.
"""
from __future__ import annotations

import json
import random
import subprocess
from pathlib import Path

import torch
import torch.nn.functional as F

import train_v04 as base

# Keep the exact model architecture/parameter count. Only training workload changes.
base.BATCH = 64
base.EPOCHS = 2
PREVIEW_DIR = base.ROOT / "models" / "micro-v0.4-preview"


def fast_build_corpus(pairs: list[tuple[str, str]]) -> str:
    blocks: list[str] = []

    # Preserve every curated pair and its useful spelling variants.
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
    ]

    for _ in range(180):
        a = random.choice(pairs)
        b = random.choice(pairs)
        f = random.choice(followups)
        blocks.append(
            f"user: {a[0]}\nroger: {a[1]}\n"
            f"user: {f[0]}\nroger: {f[1]}\n"
            f"user: {b[0]}\nroger: {b[1]}\n\n"
        )

    subjects = ["the model", "the program", "the browser", "the code", "the dataset", "the function", "the game", "the test"]
    verbs = ["uses", "needs", "keeps", "changes", "stores", "predicts", "checks", "reads"]
    objects = ["context", "data", "a value", "the next step", "a result", "an answer", "a pattern", "the current input"]
    endings = ["carefully", "during inference", "when needed", "one step at a time", "before returning", "from recent context"]
    for _ in range(500):
        blocks.append(f"{random.choice(subjects)} {random.choice(verbs)} {random.choice(objects)} {random.choice(endings)}.\n")

    random.shuffle(blocks)
    text = "".join(blocks)
    print(f"FAST training corpus: {len(text):,} characters from {len(pairs)} curated pairs")
    return text


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=base.ROOT, text=True, check=check)


def publish_unfinished_checkpoint(model: base.RogerVIBV04, epoch: int, total_epochs: int) -> None:
    """Export epoch-N weights and push them without disturbing the final model folder."""
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
        config_path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    finally:
        base.OUT_DIR = final_out

    # The workflow checkout keeps its GitHub credential, so this makes the checkpoint
    # visible to GitHub Pages while the same process continues into the next epoch.
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
    # Rebase if main moved while this runner was training, then publish the checkpoint.
    git("pull", "--rebase", "origin", "main")
    git("push", "origin", "HEAD:main")
    print(f"published live unfinished checkpoint after epoch {epoch}/{total_epochs}")


def train_fast() -> base.RogerVIBV04:
    pairs = base.load_pairs()
    corpus = fast_build_corpus(pairs)
    xs, ys = base.make_sequences(corpus)
    model = base.RogerVIBV04()
    params = base.parameter_count(model)
    assert params == 10_049_184, params
    print(f"parameters: {params:,}")
    print(f"training sequences: {xs.shape[0]:,} x {base.SEQ} chars")

    emb_opt = torch.optim.SparseAdam(model.context.parameters(), lr=base.LR)
    dense_params = list(model.gru.parameters()) + list(model.head.parameters())
    dense_opt = torch.optim.AdamW(dense_params, lr=base.LR, weight_decay=0.01)
    indices = list(range(xs.shape[0]))

    model.train()
    for epoch in range(base.EPOCHS):
        random.shuffle(indices)
        total = 0.0
        seen = 0
        for start in range(0, len(indices), base.BATCH):
            batch_ids = indices[start:start + base.BATCH]
            xb = xs[batch_ids]
            yb = ys[batch_ids]
            emb_opt.zero_grad()
            dense_opt.zero_grad()
            logits, _ = model(xb)
            loss = F.cross_entropy(logits.reshape(-1, len(base.VOCAB)), yb.reshape(-1))
            loss.backward()
            torch.nn.utils.clip_grad_norm_(dense_params, 1.0)
            emb_opt.step()
            dense_opt.step()
            total += float(loss) * len(batch_ids)
            seen += len(batch_ids)
        print(f"epoch {epoch + 1}/{base.EPOCHS} loss={total / max(seen, 1):.4f}")

        if epoch + 1 < base.EPOCHS:
            model.eval()
            publish_unfinished_checkpoint(model, epoch + 1, base.EPOCHS)
            model.train()

    return model


if __name__ == "__main__":
    trained = train_fast()
    base.OUT_DIR = base.ROOT / "models" / "micro-v0.4"
    base.OUT_DIR.mkdir(parents=True, exist_ok=True)
    base.export(trained)
