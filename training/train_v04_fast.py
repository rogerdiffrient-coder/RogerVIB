#!/usr/bin/env python3
"""Fast RogerVIB Micro v0.4 training profile.

Reuses the exact v0.4 architecture/export format while cutting expensive synthetic
padding so developer retrains finish quickly on GitHub Actions CPU runners.
"""
from __future__ import annotations

import random

import train_v04 as base

# Keep the exact model architecture/parameter count. Only training workload changes.
base.BATCH = 64
base.EPOCHS = 2


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

    # Enough multi-turn examples to teach conversational continuity without dwarfing
    # the hand-written corpus.
    for _ in range(180):
        a = random.choice(pairs)
        b = random.choice(pairs)
        f = random.choice(followups)
        blocks.append(
            f"user: {a[0]}\nroger: {a[1]}\n"
            f"user: {f[0]}\nroger: {f[1]}\n"
            f"user: {b[0]}\nroger: {b[1]}\n\n"
        )

    # Small amount of general sentence texture. v0.4 used to generate thousands of
    # these, which cost a lot of CPU while adding much less value than curated data.
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


base.build_corpus = fast_build_corpus

if __name__ == "__main__":
    trained = base.train()
    base.export(trained)
