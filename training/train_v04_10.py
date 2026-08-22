#!/usr/bin/env python3
"""Run the existing resumable v0.4 epoch trainer with a 10-epoch horizon."""
from __future__ import annotations

import train_v04_fast as trainer

trainer.TOTAL_EPOCHS = 10

if __name__ == "__main__":
    trainer.main()
