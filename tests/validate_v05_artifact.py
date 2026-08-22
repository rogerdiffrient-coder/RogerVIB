#!/usr/bin/env python3
from __future__ import annotations
import json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / 'models' / 'micro-v0.5'
CFG_PATH = MODEL / 'config.json'
PARAMS = 24_999_992
H = 152
BUCKETS = 163_459
VOCAB = 96

def fail(msg):
    print(f'FAIL: {msg}', file=sys.stderr); raise SystemExit(1)

def expect(path, size=None):
    if not path.is_file(): fail(f'missing {path.relative_to(ROOT)}')
    n = path.stat().st_size
    if size is not None and n != size: fail(f'{path.name}: {n} bytes, expected {size}')
    if n <= 0: fail(f'{path.name} is empty')

def main():
    expect(CFG_PATH)
    cfg = json.loads(CFG_PATH.read_text())
    if cfg.get('version') != '0.5': fail('version must be 0.5')
    if cfg.get('codename') != 'Damn Daniel': fail('codename must be Damn Daniel')
    if cfg.get('format') != 'rogervib-gru-i8-v1': fail('wrong format')
    if int(cfg.get('parameter_count', 0)) != PARAMS: fail('parameter_count mismatch')
    if int(cfg.get('hidden_size', 0)) != H: fail('hidden_size mismatch')
    if int(cfg.get('hash_buckets', 0)) != BUCKETS: fail('hash_buckets mismatch')
    rev = str(cfg.get('artifact_revision', ''))
    if not re.fullmatch(r'[0-9a-f]{16}', rev): fail('invalid artifact_revision')
    vocab = str(cfg.get('vocab', ''))
    if len(vocab) != VOCAB or len(set(vocab)) != VOCAB: fail('invalid vocab')
    st = cfg.get('self_test') or {}
    if not st.get('context') or not isinstance(st.get('context_id'), int): fail('missing self-test')
    files = cfg.get('files') or {}
    sizes = {
      'embedding': BUCKETS*H,
      'embedding_scales': BUCKETS*4,
      'gru_weight_ih': 3*H*H*4,
      'gru_weight_hh': 3*H*H*4,
      'gru_bias_ih': 3*H*4,
      'gru_bias_hh': 3*H*4,
      'head_weight': VOCAB*H*4,
      'head_bias': VOCAB*4,
    }
    for key,size in sizes.items():
        name = files.get(key)
        if not name: fail(f'missing files.{key}')
        expect(MODEL/name, size)
    for stale in ('model.onnx','model.onnx.data'):
        if (MODEL/stale).exists(): fail(f'obsolete {stale} exists')
    print(f'PASS: RogerVIB v0.5 Damn Daniel artifact: {PARAMS:,} params, revision {rev}')
if __name__ == '__main__': main()
