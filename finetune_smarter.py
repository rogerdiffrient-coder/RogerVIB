import argparse
import base64
import json
import re
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader

import train_smarter_v1 as smarter
import train_cool_v1 as base


def load_config():
    raw = Path('cool-v1-config.js').read_text(encoding='utf-8').strip()
    prefix = 'window.COOL_V1_CONFIG='
    if not raw.startswith(prefix):
        raise SystemExit('cool-v1-config.js has an unexpected format')
    return json.loads(raw[len(prefix):].rstrip(';\n'))


def load_quantized_blob(config):
    manifest = json.loads(Path('cool-v1-manifest.json').read_text())
    pieces = []
    for i in range(int(manifest['parts'])):
        raw = Path(f'cool-v1-part{i}.js').read_text(encoding='utf-8')
        m = re.search(r'=([^;]+);\s*$', raw)
        if not m:
            raise SystemExit(f'Could not parse cool-v1-part{i}.js')
        pieces.append(json.loads(m.group(1)))
    return base64.b64decode(''.join(pieces))


def restore_model(config):
    # Keep architecture exactly compatible with the deployed Smarter checkpoint.
    base.VOCAB_SIZE = len(config['vocab'])
    base.D_MODEL = int(config['dModel'])
    base.HEADS = int(config['heads'])
    base.FF = int(config['ff'])
    base.LAYERS = int(config['layers'])
    base.CONTEXT = int(config['context'])

    model = base.Cool()
    blob = load_quantized_blob(config)
    state = {}
    for name, meta in config['tensors'].items():
        start = int(meta['offset'])
        end = start + int(meta['length'])
        q = np.frombuffer(blob[start:end], dtype=np.int8).reshape(meta['shape'])
        arr = q.astype(np.float32) * float(meta['scale'])
        state[name] = torch.from_numpy(arr.copy())
    model.load_state_dict(state, strict=True)
    return model


def load_rows(path):
    rows = []
    with open(path, encoding='utf-8') as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise SystemExit(f'{path}:{line_no}: invalid JSON: {exc}')
            if not isinstance(row.get('user'), str) or not isinstance(row.get('answer'), str):
                raise SystemExit(f'{path}:{line_no}: each row needs string user and answer fields')
            rows.append(row)
    if not rows:
        raise SystemExit('No fine-tuning rows found')
    return rows


def encode_rows(rows, tok, context):
    s = tok.stoi
    BOS, EOS, PAD, USER, ASSISTANT = [s[x] for x in ['<bos>', '<eos>', '<pad>', '<user>', '<assistant>']]
    TOOL_SEARCH, TOOL_CALC, TOOL_END, TOOL_RESULT = [s[x] for x in ['<tool_search>', '<tool_calc>', '<tool_end>', '<tool_result>']]
    encoded = []
    for row in rows:
        prefix = [BOS, USER] + tok.encode(row['user']) + [ASSISTANT]
        if row.get('tool'):
            tool_token = TOOL_SEARCH if row['tool'] == 'search' else TOOL_CALC
            call = [tool_token] + tok.encode(row.get('tool_query', row['user'])) + [TOOL_END]
            result = [TOOL_RESULT] + tok.encode(row.get('tool_result', '')) + [ASSISTANT]
            answer = tok.encode(row['answer']) + [EOS]
            seq = (prefix + call + result + answer)[:context + 1]
            mask = [0] * (len(prefix) - 1) + [1] * len(call) + [0] * len(result) + [1] * len(answer)
        else:
            answer = tok.encode(row['answer']) + [EOS]
            seq = (prefix + answer)[:context + 1]
            mask = [0] * (len(prefix) - 1) + [1] * len(answer)
        encoded.append((seq, mask[:max(0, len(seq) - 1)]))

    def collate(batch):
        width = min(context, max(len(seq) - 1 for seq, _ in batch))
        x = torch.full((len(batch), width), PAD, dtype=torch.long)
        y = torch.full((len(batch), width), -100, dtype=torch.long)
        for r, (seq, mask) in enumerate(batch):
            xi, yi = seq[:-1][:width], seq[1:][:width]
            m = torch.tensor(mask[:width], dtype=torch.bool)
            x[r, :len(xi)] = torch.tensor(xi)
            tgt = torch.tensor(yi)
            y[r, :len(yi)][m] = tgt[m]
        return x, y

    return encoded, collate


def export_model(model, config, training_examples):
    tensors, chunks, offset = {}, [], 0
    for name, value in model.state_dict().items():
        arr = value.detach().cpu().float().numpy()
        max_abs = float(np.max(np.abs(arr))) if arr.size else 0.0
        scale = max(max_abs / 127.0, 1e-12)
        q = np.clip(np.round(arr / scale), -127, 127).astype(np.int8)
        data = q.tobytes()
        tensors[name] = {'shape': list(arr.shape), 'scale': scale, 'offset': offset, 'length': len(data)}
        chunks.append(data)
        offset += len(data)

    blob = b''.join(chunks)
    config = dict(config)
    config['tensors'] = tensors
    config['fineTuned'] = True
    config['lastFineTuneExamples'] = training_examples
    Path('cool-v1-config.js').write_text('window.COOL_V1_CONFIG=' + json.dumps(config, separators=(',', ':')) + ';\n', encoding='utf-8')

    encoded = base64.b64encode(blob).decode('ascii')
    chunk_chars = 196_000 - (196_000 % 4)
    parts = [encoded[i:i + chunk_chars] for i in range(0, len(encoded), chunk_chars)]
    for old in Path('.').glob('cool-v1-part*.js'):
        old.unlink()
    for i, part in enumerate(parts):
        Path(f'cool-v1-part{i}.js').write_text(
            f'window.COOL_V1_PARTS=(window.COOL_V1_PARTS||[]);window.COOL_V1_PARTS[{i}]={json.dumps(part)};\n',
            encoding='utf-8'
        )
    manifest = json.loads(Path('cool-v1-manifest.json').read_text())
    manifest.update({'parts': len(parts), 'bytes': len(blob), 'lastFineTuneExamples': training_examples})
    Path('cool-v1-manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
    print('exported fine-tuned checkpoint:', len(parts), 'parts,', len(blob), 'bytes')


def main():
    parser = argparse.ArgumentParser(description='Fine-tune the deployed RogerVIB Smarter checkpoint without retraining from scratch.')
    parser.add_argument('--data', default='finetune_data.jsonl')
    parser.add_argument('--epochs', type=int, default=1)
    parser.add_argument('--lr', type=float, default=5e-5)
    parser.add_argument('--batch-size', type=int, default=24)
    args = parser.parse_args()

    config = load_config()
    rows = load_rows(args.data)
    tok = base.Tokenizer(config['vocab'])
    encoded, collate = encode_rows(rows, tok, int(config['context']))
    loader = DataLoader(base.Rows(encoded), batch_size=args.batch_size, shuffle=True, collate_fn=collate, num_workers=0)
    model = restore_model(config)

    # Freeze the lower half. Small corrective updates train much faster and are less likely
    # to erase basic behavior learned by the full model.
    trainable_names = []
    cutoff = max(1, int(config['layers']) // 2)
    for name, param in model.named_parameters():
        layer_match = re.match(r'blocks\.(\d+)\.', name)
        trainable = not layer_match or int(layer_match.group(1)) >= cutoff
        param.requires_grad = trainable
        if trainable:
            trainable_names.append(name)

    trainable_params = [p for p in model.parameters() if p.requires_grad]
    print('fine-tuning from deployed checkpoint')
    print('rows:', len(rows), 'epochs:', args.epochs, 'lr:', args.lr)
    print('trainable params:', sum(p.numel() for p in trainable_params), '/', sum(p.numel() for p in model.parameters()))
    opt = torch.optim.AdamW(trainable_params, lr=args.lr, weight_decay=0.005)

    for epoch in range(args.epochs):
        model.train()
        losses = []
        for x, y in loader:
            opt.zero_grad(set_to_none=True)
            logits = model(x)
            loss = F.cross_entropy(logits.reshape(-1, len(config['vocab'])), y.reshape(-1), ignore_index=-100)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(trainable_params, 0.5)
            opt.step()
            losses.append(float(loss.detach()))
        print('fine-tune epoch', epoch + 1, 'avg loss', sum(losses) / max(1, len(losses)))

    export_model(model, config, len(rows))


if __name__ == '__main__':
    main()
