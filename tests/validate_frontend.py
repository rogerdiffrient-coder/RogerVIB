#!/usr/bin/env python3
"""Static regression checks for the tiny RogerVIB production page."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "index.html").read_text(encoding="utf-8")
APP = (ROOT / "micro" / "app-v4.js").read_text(encoding="utf-8")
RUNTIME = (ROOT / "micro" / "neural-v04-native.js").read_text(encoding="utf-8")
CSS = (ROOT / "micro" / "micro.css").read_text(encoding="utf-8")


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def require(text: str, needle: str, where: str) -> None:
    if needle not in text:
        fail(f"{where} is missing {needle!r}")


def forbid(text: str, needle: str, where: str) -> None:
    if needle.lower() in text.lower():
        fail(f"{where} still contains obsolete {needle!r}")


def main() -> None:
    require(INDEX, 'micro/neural-v04-native.js', 'index.html')
    require(INDEX, 'micro/app-v4.js', 'index.html')
    require(INDEX, 'value="neural-v0.4"', 'index.html')
    require(INDEX, 'value="baseline-v0.2"', 'index.html')
    require(APP, "window.RogerVIBNeuralV04", 'micro/app-v4.js')
    require(APP, "switched this chat to v0.2", 'micro/app-v4.js')
    require(RUNTIME, "runtime:'native-js'", 'micro/neural-v04-native.js')
    require(RUNTIME, "rogervib-gru-i8-v1", 'micro/neural-v04-native.js')
    require(CSS, '.message-row', 'micro/micro.css')

    forbid(INDEX, 'onnxruntime', 'index.html')
    forbid(INDEX, 'neural-v04.js', 'index.html')
    forbid(RUNTIME, 'window.ort', 'micro/neural-v04-native.js')
    forbid(RUNTIME, 'InferenceSession', 'micro/neural-v04-native.js')
    forbid(APP, 'micro brain crashed:', 'micro/app-v4.js')

    versions = re.findall(r'[?&]v=(\d+\.\d+\.\d+)', INDEX)
    if not versions:
        fail('index.html has no cache-bump versions')
    if len(set(versions)) != 1:
        fail(f'index.html mixes cache versions: {sorted(set(versions))}')

    build_match = re.search(r"ROGERVIB_BUILD='([^']+)'", INDEX)
    if not build_match:
        fail('index.html does not expose ROGERVIB_BUILD')
    if build_match.group(1) != versions[0]:
        fail(f"ROGERVIB_BUILD {build_match.group(1)!r} does not match asset version {versions[0]!r}")

    for path in (
        ROOT / 'micro' / 'neural-v04.js',
    ):
        if path.exists():
            fail(f'obsolete runtime still exists: {path.relative_to(ROOT)}')

    print(f"PASS: frontend wiring is internally consistent (build {versions[0]})")


if __name__ == '__main__':
    main()
