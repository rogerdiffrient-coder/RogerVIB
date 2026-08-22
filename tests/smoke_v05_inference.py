#!/usr/bin/env python3
"""Run the proven v0.4 browser-equivalent quality test against v0.5 Damn Daniel."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / 'tests' / 'smoke_v04_inference.py').read_text(encoding='utf-8')
source = source.replace('models" / "micro-v0.4', 'models" / "micro-v0.5')
source = source.replace('RogerVIB Micro v0.4 candidate quality report', 'RogerVIB v0.5 Damn Daniel candidate quality report')
source = source.replace('exported v0.4 binary files', 'exported v0.5 Damn Daniel binary files')
exec(compile(source, str(ROOT / 'tests' / 'smoke_v05_inference.py'), 'exec'), {'__name__': '__main__', '__file__': str(ROOT / 'tests' / 'smoke_v05_inference.py')})
