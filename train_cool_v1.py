import base64, json, math, os, random, re
from collections import Counter

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

SEED = 505
random.seed(SEED)
torch.manual_seed(SEED)
torch.set_num_threads(min(8, os.cpu_count() or 4))

VOCAB_SIZE = 1024
D_MODEL = 256
HEADS = 8
FF = 1024
LAYERS = 8
CONTEXT = 256
TRAINING_EXAMPLES = 50_000
EPOCHS = 2

SPECIAL = [
    '<unk>', '<bos>', '<eos>', '<pad>', '<user>', '<assistant>',
    '<tool_search>', '<tool_calc>', '<tool_end>', '<tool_result>', '▁'
]

# Approved RogerVIB tone / behavior seeds inherited from earlier versions.
PAIRS = [
    ('hi', 'sup'), ('hello', 'sup'), ('hey', 'yo'), ('yo', 'sup'), ('hello there', 'sup'),
    ('how are you', 'pretty good'), ('hows it going', 'just here VIBing'), ('how is it going', 'pretty good'),
    ('you good', 'pretty good'), ('how you doing', 'just here VIBing'),
    ('who are you', 'i am rogervib. just here VIBing'), ('what are you', 'rogervib'),
    ('why are you', 'none lmao im just here to VIBe'), ('what is your purpose', 'none lmao im just here to VIBe'),
    ('bye', 'cya'), ('goodbye', 'cya'), ('thanks', 'np'), ('thank you', 'np'),
    ('lmao', 'lmao'), ('lol', 'lmao'), ('bruh', 'bru'), ('you are dumb', 'correct'), ('youre stupid', 'correct'),
    ('im bored', 'make something stupid'), ('favorite food', 'crepe'), ('favorite game', 'geometry dash because i enjoy suffering'),
    ('best programming language', 'blockly'), ('what does ai stand for', 'artificial intelligence'),
    ('what is geometry dash', 'square jumps over triangle.'), ('what is minecraft', 'you MINE and you CRAFT. shocking.'),
    ('my code doesnt work', 'read the error message'), ('my code is broken', 'read the error message'),
    ('tell me a joke', 'what do you call a fish with no eyes. fsh. laugh.'),
    ('say something random', 'there is probably a crab somewhere having a really bad day'),
    ('meaning of life', 'crepe'), ('what is water', 'clear'), ('why is the sky blue', 'blue light scatters more. sky blue.'),
    ('explain gravity', 'earth says GET BACK HERE and you fall down'), ('why do people sleep', 'sleep is nice and also required'),
    ('can you see me', 'not unless you send an image'), ('bugs in games', 'if its funny its a feature'),
    ('i have a bad game idea', 'thats terrible. wait no this could actually be funny. make it anyway'),
    ('i have a good game idea', 'wait this actually cooks'), ('i beat a hard level', 'wait this actually cooks'),
]

SUBJECTS = [
    'platformer', 'clicker game', 'geometry dash level', 'website', 'chatbot', 'game engine', 'editor', 'menu',
    'level creator', 'save system', 'physics engine', 'ui', 'multiplayer prototype', 'music player', 'tool system'
]
ISSUES = ['doesnt work', 'is broken', 'keeps crashing', 'looks weird', 'has a bug', 'is way too slow', 'does nothing']

CURRENT_TOPICS = [
    'geometry dash update', 'python release', 'javascript browser support', 'minecraft update', 'github status',
    'new browser features', 'latest game patch', 'current weather in salt lake city', 'new web standard',
    'latest space mission', 'current nasa news', 'latest open source release', 'current technology news'
]


def basic_parts(text):
    return re.findall(r"[a-z0-9]+|[^\s]", str(text).lower())


def make_rows():
    rows = []
    # normal conversations
    for _ in range(16_000):
        u, a = random.choice(PAIRS)
        if random.random() < 0.18: u += '?'
        rows.append({'user': u, 'answer': a})

    greetings = ['hi', 'hello', 'hey', 'yo', 'sup', 'hiya', 'heyy', 'hello there', 'yooo']
    statuses = ['how are you', 'hows it going', 'how is it going', 'you good', 'how you doing', 'whats up', 'how is life']
    for _ in range(3_000): rows.append({'user': random.choice(greetings), 'answer': random.choice(['sup', 'yo', 'hello'])})
    for _ in range(3_000): rows.append({'user': random.choice(statuses), 'answer': random.choice(['pretty good', 'just here VIBing', 'good. just here VIBing'])})

    # coding / creation / useful behavior
    for _ in range(5_000):
        subject = random.choice(SUBJECTS)
        if random.random() < 0.55:
            rows.append({'user': f'my {subject} {random.choice(ISSUES)}', 'answer': random.choice([
                'read the error message', 'find the smallest broken part', 'save first. then do the stupid thing',
                'check what changed right before it broke'
            ])})
        else:
            rows.append({'user': random.choice([f'i made a {subject}', f'im making a {subject}', f'new idea: {subject}']), 'answer': random.choice([
                'wait this actually cooks', 'make it anyway', 'add one deeply unnecessary feature', 'the vibes have passed inspection'
            ])})

    # Calculator tool calls + post-tool answers.
    ops = ['+', '-', '*', '/']
    for _ in range(7_000):
        op = random.choice(ops)
        a = random.randint(1, 999)
        b = random.randint(1, 99)
        if op == '/':
            a = b * random.randint(1, 40)
        expr = f'{a} {op} {b}'
        value = a + b if op == '+' else a - b if op == '-' else a * b if op == '*' else a / b
        result = str(int(value) if float(value).is_integer() else round(value, 8))
        prompt = random.choice([expr, f'what is {expr}', f'calculate {expr}', f'whats {expr}'])
        rows.append({'user': prompt, 'tool': 'calc', 'tool_query': expr, 'tool_result': result, 'answer': result})

    # Search tool calls. Training teaches WHEN to search, not a frozen current fact.
    for _ in range(7_000):
        topic = random.choice(CURRENT_TOPICS)
        user = random.choice([
            f'whats the latest {topic}', f'look up {topic}', f'search for {topic}', f'what is current with {topic}',
            f'find recent info about {topic}'
        ])
        query = topic + ' latest'
        fake_result = random.choice([
            f'Search results for {topic}: the newest result says there has been a recent update. Check the source date before relying on details.',
            f'Search results for {topic}: several recent sources are available. The top result contains the newest reported information.',
            f'Search results for {topic}: current information was returned by the search tool.'
        ])
        answer = random.choice([
            f'i searched for {topic}. the newest result is in the tool data above.',
            f'heres what the search found about {topic}: the current result is in the tool data.',
            f'i checked {topic}. use the newest dated result from the search output.'
        ])
        rows.append({'user': user, 'tool': 'search', 'tool_query': query, 'tool_result': fake_result, 'answer': answer})

    # Multi-turn-ish context compressed into one user turn, plus ambiguity handling.
    for _ in range(4_000):
        rows.append(random.choice([
            {'user': 'im making a game. geometry dash but worse. i added 48 spikes', 'answer': 'excellent start. add one more in the worst possible place'},
            {'user': 'my code broke and i already read the error message', 'answer': 'okay now read the part that says what actually broke'},
            {'user': 'i have an idea but it might be terrible', 'answer': 'thats never stopped us before'},
            {'user': 'can you check something current for me', 'answer': 'yeah. tell me what you want searched'},
            {'user': 'what do you mean by that', 'answer': 'the previous thing. incredibly specific i know'},
        ]))

    # casual nonsense / robust short inputs
    social = ['nice', 'cool', 'awesome', 'okay', 'ok', 'real', 'true', 'what', 'why', 'balls', 'cheese', 'crepe', 'llamas', 'sigma', 'i am sigma', 'f', 'n']
    for _ in range(5_000):
        rows.append({'user': random.choice(social), 'answer': random.choice(['okay', 'lmao', 'bru', 'thats wild', 'crepe', 'what now'])})

    while len(rows) < TRAINING_EXAMPLES:
        u, a = random.choice(PAIRS)
        rows.append({'user': u, 'answer': a})
    rows = rows[:TRAINING_EXAMPLES]
    random.shuffle(rows)
    return rows


def text_fields(row):
    values = [row['user'], row.get('answer', ''), row.get('tool_query', ''), row.get('tool_result', '')]
    return [v for v in values if v]


def build_vocab(rows):
    wc, ng, cc = Counter(), Counter(), Counter()
    for row in rows:
        for text in text_fields(row):
            for part in basic_parts(text):
                if part.isalnum():
                    wc[part] += 1
                    cc.update(part)
                    for n in (2, 3, 4, 5):
                        for i in range(len(part) - n + 1): ng[part[i:i+n]] += 1
                else:
                    cc[part] += 1

    vocab = list(SPECIAL)
    vocab += ['▁' + word for word, _ in wc.most_common(650) if '▁' + word not in vocab]
    for piece, count in ng.most_common():
        if piece not in vocab and count >= 4 and len(vocab) < 930: vocab.append(piece)
    for piece, _ in cc.most_common():
        if piece not in vocab and len(vocab) < VOCAB_SIZE: vocab.append(piece)
    while len(vocab) < VOCAB_SIZE: vocab.append(f'<unused{len(vocab)}>')
    return vocab[:VOCAB_SIZE]


class Tokenizer:
    def __init__(self, vocab):
        self.vocab = vocab
        self.stoi = {t:i for i,t in enumerate(vocab)}
        self.candidates = {}
        for token in vocab:
            if not token or token.startswith('<') or token.startswith('▁'): continue
            self.candidates.setdefault(token[0], []).append(token)
        for key in self.candidates: self.candidates[key].sort(key=len, reverse=True)

    def encode(self, text):
        out = []
        for part in basic_parts(text):
            whole = '▁' + part
            if whole in self.stoi:
                out.append(self.stoi[whole]); continue
            if part.isalnum():
                out.append(self.stoi['▁'])
                i = 0
                while i < len(part):
                    found = next((tok for tok in self.candidates.get(part[i], []) if part.startswith(tok, i)), None)
                    if found:
                        out.append(self.stoi[found]); i += len(found)
                    else:
                        out.append(self.stoi.get(part[i], self.stoi['<unk>'])); i += 1
            else:
                out.append(self.stoi.get(part, self.stoi['<unk>']))
        return out


class Block(nn.Module):
    def __init__(self):
        super().__init__()
        self.l1 = nn.LayerNorm(D_MODEL)
        self.qkv = nn.Linear(D_MODEL, D_MODEL * 3)
        self.proj = nn.Linear(D_MODEL, D_MODEL)
        self.l2 = nn.LayerNorm(D_MODEL)
        self.f1 = nn.Linear(D_MODEL, FF)
        self.f2 = nn.Linear(FF, D_MODEL)
        self.head_dim = D_MODEL // HEADS

    def rope(self, q, k):
        # q/k: B,H,T,HD. Rotary frequencies are deterministic, so no position table is needed.
        t = q.shape[2]
        half = self.head_dim // 2
        pos = torch.arange(t, device=q.device, dtype=q.dtype)[:, None]
        freq = torch.exp(-math.log(10000.0) * torch.arange(half, device=q.device, dtype=q.dtype) / half)[None, :]
        ang = pos * freq
        cos, sin = ang.cos()[None, None], ang.sin()[None, None]
        def rotate(x):
            a, b = x[..., :half], x[..., half:half*2]
            return torch.cat([a * cos - b * sin, a * sin + b * cos], dim=-1)
        return rotate(q), rotate(k)

    def forward(self, x):
        b, t, d = x.shape
        n = self.l1(x)
        q, k, v = self.qkv(n).chunk(3, -1)
        q = q.view(b, t, HEADS, self.head_dim).transpose(1, 2)
        k = k.view(b, t, HEADS, self.head_dim).transpose(1, 2)
        v = v.view(b, t, HEADS, self.head_dim).transpose(1, 2)
        q, k = self.rope(q, k)
        att = (q @ k.transpose(-2, -1)) / math.sqrt(self.head_dim)
        mask = torch.triu(torch.ones(t, t, device=x.device, dtype=torch.bool), 1)
        att = att.masked_fill(mask, -1e9).softmax(-1)
        y = (att @ v).transpose(1, 2).contiguous().view(b, t, d)
        x = x + self.proj(y)
        return x + self.f2(F.gelu(self.f1(self.l2(x))))


class Cool(nn.Module):
    def __init__(self):
        super().__init__()
        self.tok = nn.Embedding(VOCAB_SIZE, D_MODEL)
        self.blocks = nn.ModuleList([Block() for _ in range(LAYERS)])
        self.lf = nn.LayerNorm(D_MODEL)
        self.head = nn.Linear(D_MODEL, VOCAB_SIZE, bias=False)

    def forward(self, ids):
        x = self.tok(ids)
        for block in self.blocks: x = block(x)
        return self.head(self.lf(x))


class Rows(Dataset):
    def __init__(self, rows): self.rows = rows
    def __len__(self): return len(self.rows)
    def __getitem__(self, i): return self.rows[i]


def main():
    rows = make_rows()
    vocab = build_vocab(rows)
    tok = Tokenizer(vocab)
    s = tok.stoi
    BOS, EOS, PAD, USER, ASSISTANT = [s[x] for x in ['<bos>', '<eos>', '<pad>', '<user>', '<assistant>']]
    TOOL_SEARCH, TOOL_CALC, TOOL_END, TOOL_RESULT = [s[x] for x in ['<tool_search>', '<tool_calc>', '<tool_end>', '<tool_result>']]

    encoded_rows = []
    for row in rows:
        prefix = [BOS, USER] + tok.encode(row['user']) + [ASSISTANT]
        if row.get('tool'):
            tool_token = TOOL_SEARCH if row['tool'] == 'search' else TOOL_CALC
            call = [tool_token] + tok.encode(row['tool_query']) + [TOOL_END]
            result = [TOOL_RESULT] + tok.encode(row['tool_result']) + [ASSISTANT]
            answer = tok.encode(row['answer']) + [EOS]
            seq = (prefix + call + result + answer)[:CONTEXT + 1]
            # Train tool call and final answer, but not user or injected tool-result tokens.
            loss = [0] * (len(prefix) - 1)
            loss += [1] * len(call)
            loss += [0] * len(result)
            loss += [1] * len(answer)
        else:
            answer = tok.encode(row['answer']) + [EOS]
            seq = (prefix + answer)[:CONTEXT + 1]
            loss = [0] * (len(prefix) - 1) + [1] * len(answer)
        encoded_rows.append((seq, loss[:max(0, len(seq)-1)]))

    def collate(batch):
        width = min(CONTEXT, max(len(seq)-1 for seq, _ in batch))
        x = torch.full((len(batch), width), PAD, dtype=torch.long)
        y = torch.full((len(batch), width), -100, dtype=torch.long)
        for r, (seq, mask) in enumerate(batch):
            xi, yi = seq[:-1][:width], seq[1:][:width]
            m = torch.tensor(mask[:width], dtype=torch.bool)
            x[r, :len(xi)] = torch.tensor(xi)
            tgt = torch.tensor(yi)
            y[r, :len(yi)][m] = tgt[m]
        return x, y

    train = encoded_rows[:47_500]
    loader = DataLoader(Rows(train), batch_size=48, shuffle=True, collate_fn=collate, num_workers=0)
    model = Cool()
    params = sum(p.numel() for p in model.parameters())
    print('Cool parameters:', params)
    opt = torch.optim.AdamW(model.parameters(), lr=1.3e-3, weight_decay=0.01)

    for epoch in range(EPOCHS):
        if epoch == 1:
            for group in opt.param_groups: group['lr'] = 4e-4
        model.train(); losses = []
        for step, (x, y) in enumerate(loader):
            opt.zero_grad(set_to_none=True)
            logits = model(x)
            loss = F.cross_entropy(logits.reshape(-1, VOCAB_SIZE), y.reshape(-1), ignore_index=-100)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); losses.append(float(loss))
            if step % 150 == 0: print('epoch', epoch + 1, 'step', step, 'loss', round(float(loss), 4))
        print('epoch', epoch + 1, 'avg loss', sum(losses) / len(losses))

    # int8 symmetric per-tensor quantization into one byte stream.
    tensors = {}
    chunks = []
    offset = 0
    for name, value in model.state_dict().items():
        arr = value.detach().cpu().float().numpy()
        max_abs = float(np.max(np.abs(arr))) if arr.size else 0.0
        scale = max(max_abs / 127.0, 1e-12)
        q = np.clip(np.round(arr / scale), -127, 127).astype(np.int8)
        data = q.tobytes()
        tensors[name] = {'shape': list(arr.shape), 'scale': scale, 'offset': offset, 'length': len(data)}
        chunks.append(data); offset += len(data)

    blob = b''.join(chunks)
    config = {
        'version': '0.5.0',
        'architecture': '8-layer subword decoder-only transformer with RoPE and tools',
        'params': params,
        'trainingExamples': TRAINING_EXAMPLES,
        'vocab': vocab,
        'dModel': D_MODEL, 'heads': HEADS, 'ff': FF, 'layers': LAYERS, 'context': CONTEXT,
        'tensors': tensors
    }
    with open('cool-v1-config.js', 'w', encoding='utf-8') as f:
        f.write('window.COOL_V1_CONFIG=' + json.dumps(config, separators=(',', ':')) + ';\n')

    encoded = base64.b64encode(blob).decode('ascii')
    chunk_chars = 196_000
    chunk_chars -= chunk_chars % 4
    parts = [encoded[i:i+chunk_chars] for i in range(0, len(encoded), chunk_chars)]
    for old in [x for x in os.listdir('.') if re.match(r'cool-v1-part\d+\.js$', x)]: os.remove(old)
    for i, part in enumerate(parts):
        with open(f'cool-v1-part{i}.js', 'w', encoding='utf-8') as f:
            f.write(f'window.COOL_V1_PARTS=(window.COOL_V1_PARTS||[]);window.COOL_V1_PARTS[{i}]={json.dumps(part)};\n')
    with open('cool-v1-manifest.json', 'w') as f:
        json.dump({'parts': len(parts), 'params': params, 'bytes': len(blob), 'trainingExamples': TRAINING_EXAMPLES}, f)
    print('wrote', len(parts), 'parts,', len(blob), 'quantized bytes')


if __name__ == '__main__':
    main()
