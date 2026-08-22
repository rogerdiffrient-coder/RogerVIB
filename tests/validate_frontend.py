#!/usr/bin/env python3
"""Static regression checks for the RogerVIB Micro production page."""
from __future__ import annotations
import json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
INDEX=(ROOT/'index.html').read_text(encoding='utf-8')
APP=(ROOT/'micro'/'app-v5.js').read_text(encoding='utf-8')
RUNTIME04=(ROOT/'micro'/'neural-v04-native.js').read_text(encoding='utf-8')
RUNTIME05=(ROOT/'micro'/'neural-v05-native.js').read_text(encoding='utf-8')
CFG05=json.loads((ROOT/'models'/'micro-v0.5'/'config.json').read_text(encoding='utf-8'))
CSS=(ROOT/'micro'/'micro.css').read_text(encoding='utf-8')

def fail(message): print(f'FAIL: {message}',file=sys.stderr);raise SystemExit(1)
def require(text,needle,where):
    if needle not in text: fail(f'{where} is missing {needle!r}')
def forbid(text,needle,where):
    if needle.lower() in text.lower(): fail(f'{where} still contains obsolete {needle!r}')

def main():
    for needle in ('micro/neural-v05-native.js','micro/neural-v04-native.js','micro/app-v5.js','value="neural-v0.5"','value="neural-v0.4"','value="baseline-v0.2"'):
        require(INDEX,needle,'index.html')
    require(INDEX,"models/micro-v0.5-preview/",'index.html unfinished mode')
    require(INDEX,"models/micro-v0.4-preview/",'index.html unfinished mode')
    require(APP,"DEFAULT_MODEL='neural-v0.5'",'micro/app-v5.js')
    require(APP,'window.RogerVIBNeuralV05','micro/app-v5.js')
    require(APP,'window.RogerVIBNeuralV04','micro/app-v5.js')
    require(RUNTIME05,"MODEL_BASE='models/micro-v0.5'",'micro/neural-v05-native.js')
    require(RUNTIME05,"window.RogerVIBNeuralV05",'micro/neural-v05-native.js')
    require(RUNTIME05,"rogervib-gru-i8-v1",'micro/neural-v05-native.js')
    require(RUNTIME05,'runSelfTest','micro/neural-v05-native.js')
    require(RUNTIME04,'runSelfTest','micro/neural-v04-native.js')
    require(CSS,'.message-row','micro/micro.css')
    if CFG05.get('version')!='0.5' or CFG05.get('codename')!='Damn Daniel' or CFG05.get('preview') is not False: fail('final v0.5 config is not a final Damn Daniel artifact')
    if int(CFG05.get('parameter_count',0))!=24999992: fail('v0.5 parameter count mismatch')
    forbid(INDEX,'onnxruntime','index.html');forbid(RUNTIME05,'window.ort','micro/neural-v05-native.js');forbid(RUNTIME05,'InferenceSession','micro/neural-v05-native.js')
    versions=re.findall(r'[?&]v=(\d+\.\d+\.\d+)',INDEX)
    if not versions: fail('index.html has no cache-bump versions')
    if len(set(versions))!=1: fail(f'index.html mixes cache versions: {sorted(set(versions))}')
    build=re.search(r"ROGERVIB_BUILD='([^']+)'",INDEX)
    if not build or build.group(1)!=versions[0]: fail('ROGERVIB_BUILD does not match asset version')
    print(f"PASS: v0.5 Damn Daniel is wired into final + unfinished frontend modes (build {versions[0]})")
if __name__=='__main__': main()
