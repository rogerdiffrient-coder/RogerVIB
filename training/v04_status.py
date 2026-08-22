#!/usr/bin/env python3
"""Write and optionally publish live RogerVIB v0.4 training status."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRAINING = ROOT / "training"
LATEST = TRAINING / "latest_v04_status.json"
RESULT = TRAINING / "latest_v04_epoch_result.json"

CHECKPOINT_FIELDS = (
    "loss",
    "artifact_revision",
    "parameter_count",
    "hidden_size",
    "hash_buckets",
    "checkpoint_dir",
    "checkpoint_timestamp",
    "result_parse_error",
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_id() -> str:
    return os.environ.get("GITHUB_RUN_ID", "local")


def base_status() -> dict:
    return {
        "run_id": run_id(),
        "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT", "1"),
        "source_sha": os.environ.get("GITHUB_SHA", "unknown"),
        "workflow": os.environ.get("GITHUB_WORKFLOW", "Train RogerVIB Micro v0.4"),
        "repository": os.environ.get("GITHUB_REPOSITORY", "rogerdiffrient-coder/RogerVIB"),
        "total_epochs": 5,
        "started_at": now(),
        "updated_at": now(),
        "state": "starting",
        "epoch": 0,
    }


def load_status() -> dict:
    if LATEST.exists():
        try:
            data = json.loads(LATEST.read_text(encoding="utf-8"))
            if str(data.get("run_id")) == run_id():
                return data
        except Exception:
            pass
    return base_status()


def append_summary(text: str) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(text.rstrip() + "\n")


def record(args: argparse.Namespace) -> tuple[Path, Path]:
    data = load_status()
    data["updated_at"] = now()

    if args.event == "start":
        data = base_status()
        data["state"] = "started"
        data["message"] = args.message or "workflow started and reported successfully"
        append_summary(f"## RogerVIB v0.4 training run {run_id()}\n\nStarted: `{data['started_at']}`\n")
    elif args.event == "epoch":
        # Never carry a previous epoch's metrics forward into a failed/missing checkpoint.
        for key in CHECKPOINT_FIELDS:
            data.pop(key, None)
        data["epoch"] = args.epoch
        data["state"] = "checkpoint" if args.outcome == "success" else "failed"
        data["outcome"] = args.outcome
        data["artifact_name"] = args.artifact
        if RESULT.exists():
            try:
                result = json.loads(RESULT.read_text(encoding="utf-8"))
                if int(result.get("epoch", -1)) == args.epoch:
                    data.update({
                        "loss": result.get("loss"),
                        "artifact_revision": result.get("artifact_revision"),
                        "parameter_count": result.get("parameter_count"),
                        "hidden_size": result.get("hidden_size"),
                        "hash_buckets": result.get("hash_buckets"),
                        "checkpoint_dir": result.get("checkpoint_dir"),
                        "checkpoint_timestamp": result.get("timestamp"),
                    })
            except Exception as exc:
                data["result_parse_error"] = str(exc)
        data["message"] = args.message or f"epoch {args.epoch}/5 {args.outcome}"
        loss = data.get("loss", "?")
        rev = data.get("artifact_revision", "?")
        append_summary(
            f"- Epoch **{args.epoch}/5**: **{args.outcome}** — loss `{loss}`, revision `{rev}`, artifact `{args.artifact}`"
        )
    elif args.event == "stage":
        data["state"] = args.stage
        data["message"] = args.message or args.stage
        append_summary(f"- Stage: **{args.stage}**")
    elif args.event == "finish":
        data["state"] = args.outcome
        data["finished_at"] = now()
        data["message"] = args.message or args.outcome
        append_summary(f"\nFinal state: **{args.outcome}**")

    LATEST.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
    history_dir = TRAINING / "v04_runs"
    history_dir.mkdir(parents=True, exist_ok=True)
    history = history_dir / f"{run_id()}.jsonl"
    with history.open("a", encoding="utf-8") as f:
        f.write(json.dumps(data, sort_keys=True) + "\n")
    print(json.dumps(data, indent=2, sort_keys=True))
    return LATEST, history


def publish(paths: tuple[Path, Path], message: str) -> None:
    def git(*args: str, check: bool = True):
        return subprocess.run(["git", *args], cwd=ROOT, text=True, check=check)

    git("config", "user.name", "RogerVIB Trainer")
    git("config", "user.email", "actions@users.noreply.github.com")
    for path in paths:
        git("add", str(path.relative_to(ROOT)))
    changed = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode != 0
    if not changed:
        print("status unchanged; nothing to publish")
        return
    git("commit", "-m", message)
    git("pull", "--rebase", "origin", "main")
    git("push", "origin", "HEAD:main")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("event", choices=["start", "epoch", "stage", "finish"])
    parser.add_argument("--epoch", type=int, default=0)
    parser.add_argument("--outcome", default="success")
    parser.add_argument("--artifact", default="")
    parser.add_argument("--stage", default="")
    parser.add_argument("--message", default="")
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    paths = record(args)
    if args.publish:
        label = args.event
        if args.event == "epoch":
            label += f" {args.epoch}/5 {args.outcome}"
        elif args.event == "stage":
            label += f" {args.stage}"
        elif args.event == "finish":
            label += f" {args.outcome}"
        publish(paths, f"Report RogerVIB v0.4 {label} [skip ci]")


if __name__ == "__main__":
    main()
