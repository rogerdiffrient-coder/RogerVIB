import base64, json, os, random, re
from collections import Counter

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader

import train_cool_v1 as base

SEED = 606
random.seed(SEED)
torch.manual_seed(SEED)
torch.set_num_threads(min(8, os.cpu_count() or 4))

# v0.6 Smarter: larger model, larger vocabulary, longer context, and much more varied data.
base.VOCAB_SIZE = 2048
base.D_MODEL = 288
base.HEADS = 8
base.FF = 1152
base.LAYERS = 10
base.CONTEXT = 512
VOCAB_SIZE = base.VOCAB_SIZE
D_MODEL = base.D_MODEL
HEADS = base.HEADS
FF = base.FF
LAYERS = base.LAYERS
CONTEXT = base.CONTEXT
TRAINING_EXAMPLES = 120_000
EPOCHS = 3

IDENTITY = [
    ('who are you', 'i am rogervib. just here vibing'),
    ('what are you', 'rogervib. a tiny language model with tools'),
    ('what is rogervib', 'a tiny language model with tools'),
    ('who made you', 'roger made me'),
    ('who created you', 'roger made me'),
    ('who built you', 'roger made me'),
    ('who coded you', 'roger made me'),
    ('who is your creator', 'roger'),
    ('who made rogervib', 'roger'),
    ('are you made by openai', 'nope. roger made me'),
    ('are you chatgpt', 'nope. i am rogervib'),
]

CASUAL = [
    ('hi', 'sup'), ('hello', 'sup'), ('hey', 'yo'), ('yo', 'sup'),
    ('hows it going', 'just here vibing'), ('how are you', 'pretty good'),
    ('okay', 'bru'), ('ok', 'okay'), ('nice', 'nice'), ('cool', 'okay'),
    ('real', 'real'), ('lol', 'lmao'), ('lmao', 'lmao'), ('bruh', 'bru'),
    ('why are you so bad', 'because i have like twelve million parameters. lower your expectations'),
    ('you are dumb', 'correct'), ('youre stupid', 'correct'),
    ('im bored', 'make something stupid'), ('what now', 'idk make something stupid'),
    ('tell me something random', 'there is probably a crab somewhere having a really bad day'),
    ('favorite food', 'crepe'), ('favorite game', 'geometry dash because i enjoy suffering'),
    ('thanks', 'np'), ('thank you', 'np'), ('bye', 'cya'),
]

STATIC_FACTS = [
    ('capital of france', 'paris'), ('capital of italy', 'rome'), ('capital of japan', 'tokyo'),
    ('capital of canada', 'ottawa'), ('capital of australia', 'canberra'), ('capital of egypt', 'cairo'),
    ('capital of spain', 'madrid'), ('capital of germany', 'berlin'), ('capital of greece', 'athens'),
    ('capital of mexico', 'mexico city'), ('capital of brazil', 'brasilia'), ('capital of india', 'new delhi'),
    ('capital of china', 'beijing'), ('capital of south korea', 'seoul'), ('capital of vatican city', 'vatican city'),
    ('largest planet', 'jupiter'), ('closest planet to the sun', 'mercury'), ('planet we live on', 'earth'),
    ('water freezes at celsius', '0 degrees celsius'), ('water boils at celsius', '100 degrees celsius at sea level'),
    ('how many days in a week', '7'), ('how many months in a year', '12'),
    ('what does ai stand for', 'artificial intelligence'), ('what does cpu stand for', 'central processing unit'),
    ('what does html stand for', 'hypertext markup language'), ('what does css stand for', 'cascading style sheets'),
]

GD_LINES = [
    ('what is geometry dash', 'square jumps over triangle.'),
    ('geometry dash is hard', 'correct. cube suffering simulator'),
    ('i beat a geometry dash level', 'wait this actually cooks'),
    ('i made a geometry dash level', 'wait this actually cooks'),
    ('i beat a demon', 'wait this actually cooks'),
    ('deadlocked', 'cube suffering but with lasers'),
    ('stereo madness', 'the square begins its journey'),
]

SUBJECTS = ['platformer', 'clicker game', 'geometry dash level', 'website', 'chatbot', 'game engine', 'editor', 'menu', 'save system', 'physics engine', 'ui', 'tool system']
ISSUES = ['doesnt work', 'is broken', 'keeps crashing', 'looks weird', 'has a bug', 'is way too slow', 'does nothing']

SEARCH_TOPICS = [
    'geometry dash update', 'geometry dash patch notes', 'minecraft update', 'python release',
    'javascript browser support', 'github status', 'current weather', 'nasa news',
    'latest browser release', 'current technology news', 'recent game update'
]


def paraphrase_fact(subject):
    return random.choice([
        f'what is the {subject}', f'whats the {subject}', f'tell me the {subject}',
        f'do you know the {subject}', subject,
    ])


def make_rows():
    rows = []

    # 28k casual + identity. Normal conversation vastly outnumbers tool phrasing.
    all_normal = CASUAL + IDENTITY + GD_LINES
    for _ in range(28_000):
        u, a = random.choice(all_normal)
        if random.random() < 0.22 and not u.endswith('?'):
            u += '?'
        rows.append({'user': u, 'answer': a})

    # 18k stable factual questions with paraphrases, including Vatican City.
    for _ in range(18_000):
        subject, answer = random.choice(STATIC_FACTS)
        rows.append({'user': paraphrase_fact(subject), 'answer': answer})

    # 16k coding / creation behavior.
    for _ in range(16_000):
        subject = random.choice(SUBJECTS)
        if random.random() < 0.56:
            rows.append({'user': f'my {subject} {random.choice(ISSUES)}', 'answer': random.choice([
                'read the error message', 'find the smallest broken part', 'check what changed right before it broke',
                'reproduce the bug with the smallest possible test'
            ])})
        else:
            rows.append({'user': random.choice([f'i made a {subject}', f'im making a {subject}', f'new idea: {subject}']), 'answer': random.choice([
                'wait this actually cooks', 'make it anyway', 'add one deeply unnecessary feature', 'the vibes have passed inspection'
            ])})

    # 14k calculator calls. Exact arithmetic should route deterministically at runtime too.
    for _ in range(14_000):
        op = random.choice(['+', '-', '*', '/'])
        a = random.randint(1, 99_999)
        b = random.randint(1, 999)
        if op == '/':
            a = b * random.randint(1, 500)
        expr = f'{a} {op} {b}'
        value = a + b if op == '+' else a - b if op == '-' else a * b if op == '*' else a / b
        result = str(int(value) if float(value).is_integer() else round(value, 8))
        prompt = random.choice([expr, f'what is {expr}', f'calculate {expr}', f'whats {expr}'])
        rows.append({'user': prompt, 'tool': 'calc', 'tool_query': expr, 'tool_result': result, 'answer': result})

    # 12k grounded search examples. Answers contain concrete facts from the tool result,
    # rather than generic phrases like "i checked" that contaminated Cool v0.5.
    for _ in range(12_000):
        topic = random.choice(SEARCH_TOPICS)
        marker = f'{random.choice(["raven", "banana", "pixel", "cube", "orbit"])}-{random.randint(1000, 9999)}'
        detail = random.choice([
            f'the newest source reports verification marker {marker}',
            f'the dated result contains reference {marker}',
            f'the current result identifies update marker {marker}',
        ])
        user = random.choice([
            f'research the latest {topic}', f'look up {topic}', f'search for {topic}',
            f'browse for current {topic}', f'find recent info about {topic}'
        ])
        result = f'Search results for {topic}. {detail}. Use this result as evidence.'
        answer = random.choice([
            f'the newest result says {detail}.',
            f'according to the search result, {detail}.',
            f'the current source says {detail}.',
        ])
        rows.append({'user': user, 'tool': 'search', 'tool_query': topic, 'tool_result': result, 'answer': answer})

    # 10k explicit tool-result copying drills with random markers. This makes memorizing the
    # answer impossible and rewards actually reading the injected result.
    for _ in range(10_000):
        marker = f'{random.choice(["kiwi", "crab", "dash", "toast", "frog"])}-{random.randint(10000, 99999)}'
        user = random.choice(['research this and tell me the code', 'look this up and report the marker', 'search and give me the reference'])
        result = f'Tool evidence: the requested reference is {marker}.'
        rows.append({'user': user, 'tool': 'search', 'tool_query': 'test reference', 'tool_result': result, 'answer': f'the reference is {marker}'})

    # 12k longer conversational / instruction-following examples.
    longer = [
        ('im making a game and the jump feels floaty. what should i change', 'try adjusting gravity and jump velocity separately so you can tell which one feels wrong'),
        ('my code worked yesterday and now it crashes', 'check the last change first. then reduce it to the smallest reproducible bug'),
        ('explain gravity simply', 'mass attracts mass. earth is huge, so it pulls you toward the ground'),
        ('explain a variable in programming', 'a variable is a named place to store a value so your code can use or change it later'),
        ('what should i do if a search result disagrees with another one', 'check the dates and prefer direct or primary sources when possible'),
        ('dont search. just say hi', 'sup'),
        ('answer without using tools: what are you', 'rogervib. a tiny language model with tools'),
        ('do not calculate anything. who made you', 'roger made me'),
    ]
    for _ in range(12_000):
        u, a = random.choice(longer)
        rows.append({'user': u, 'answer': a})

    # 10k short/noisy inputs so the model does not collapse on tiny messages.
    noise = ['nice', 'cool', 'awesome', 'okay', 'ok', 'real', 'true', 'what', 'why', 'cheese', 'crepe', 'what now', 'huh', 'bro', 'yooo']
    replies = ['okay', 'lmao', 'bru', 'thats wild', 'crepe', 'what now', 'real', 'nice']
    for _ in range(10_000):
        rows.append({'user': random.choice(noise), 'answer': random.choice(replies)})

    assert len(rows) == TRAINING_EXAMPLES, len(rows)
    random.shuffle(rows)
    return rows


def build_vocab(rows):
    # Same compact tokenizer family as Cool, but use the extra vocabulary on whole words and
    # longer common pieces so gaming/search language is less fragmented.
    wc, ng, cc = Counter(), Counter(), Counter()
    for row in rows:
        for text in base.text_fields(row):
            for part in base.basic_parts(text):
                if part.isalnum():
                    wc[part] += 1
                    cc.update(part)
                    for n in (2, 3, 4, 5, 6):
                        for i in range(len(part) - n + 1):
                            ng[part[i:i+n]] += 1
                else:
                    cc[part] += 1
    vocab = list(base.SPECIAL)
    vocab += ['▁' + word for word, _ in wc.most_common(1350) if '▁' + word not in vocab]
    for piece, count in ng.most_common():
        if piece not in vocab and count >= 4 and len(vocab) < 1900:
            vocab.append(piece)
    for piece, _ in cc.most_common():
        if piece not in vocab and len(vocab) < VOCAB_SIZE:
            vocab.append(piece)
    while len(vocab) < VOCAB_SIZE:
        vocab.append(f'<unused{len(vocab)}>')
    return vocab[:VOCAB_SIZE]


def main():
    rows = make_rows()
    vocab = build_vocab(rows)
    tok = base.Tokenizer(vocab)
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
            loss_mask = [0] * (len(prefix) - 1) + [1] * len(call) + [0] * len(result) + [1] * len(answer)
        else:
            answer = tok.encode(row['answer']) + [EOS]
            seq = (prefix + answer)[:CONTEXT + 1]
            loss_mask = [0] * (len(prefix) - 1) + [1] * len(answer)
        encoded_rows.append((seq, loss_mask[:max(0, len(seq)-1)]))

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

    loader = DataLoader(base.Rows(encoded_rows), batch_size=40, shuffle=True, collate_fn=collate, num_workers=0)
    model = base.Cool()
    params = sum(p.numel() for p in model.parameters())
    print('Smarter parameters:', params)
    print('training examples:', TRAINING_EXAMPLES, 'context:', CONTEXT, 'vocab:', VOCAB_SIZE)
    opt = torch.optim.AdamW(model.parameters(), lr=9e-4, weight_decay=0.01)

    for epoch in range(EPOCHS):
        if epoch == 1:
            for group in opt.param_groups: group['lr'] = 3e-4
        elif epoch == 2:
            for group in opt.param_groups: group['lr'] = 1.5e-4
        model.train(); losses = []
        for step, (x, y) in enumerate(loader):
            opt.zero_grad(set_to_none=True)
            logits = model(x)
            loss = F.cross_entropy(logits.reshape(-1, VOCAB_SIZE), y.reshape(-1), ignore_index=-100)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); losses.append(float(loss.detach()))
            if step % 300 == 0:
                print('epoch', epoch + 1, 'step', step, 'loss', round(float(loss.detach()), 4))
        print('epoch', epoch + 1, 'avg loss', sum(losses) / len(losses))

    tensors, chunks, offset = {}, [], 0
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
        'version': '0.6.0',
        'architecture': '10-layer subword decoder-only transformer with RoPE, 512-token context, and tools',
        'params': params,
        'trainingExamples': TRAINING_EXAMPLES,
        'vocab': vocab,
        'dModel': D_MODEL, 'heads': HEADS, 'ff': FF, 'layers': LAYERS, 'context': CONTEXT,
        'tensors': tensors
    }
    with open('cool-v1-config.js', 'w', encoding='utf-8') as f:
        f.write('window.COOL_V1_CONFIG=' + json.dumps(config, separators=(',', ':')) + ';\n')

    encoded = base64.b64encode(blob).decode('ascii')
    chunk_chars = 196_000 - (196_000 % 4)
    parts = [encoded[i:i+chunk_chars] for i in range(0, len(encoded), chunk_chars)]
    for old in [x for x in os.listdir('.') if re.match(r'cool-v1-part\d+\.js$', x)]:
        os.remove(old)
    for i, part in enumerate(parts):
        with open(f'cool-v1-part{i}.js', 'w', encoding='utf-8') as f:
            f.write(f'window.COOL_V1_PARTS=(window.COOL_V1_PARTS||[]);window.COOL_V1_PARTS[{i}]={json.dumps(part)};\n')
    with open('cool-v1-manifest.json', 'w') as f:
        json.dump({'parts': len(parts), 'params': params, 'bytes': len(blob), 'trainingExamples': TRAINING_EXAMPLES, 'version': '0.6.0'}, f)
    print('wrote', len(parts), 'parts,', len(blob), 'quantized bytes')


if __name__ == '__main__':
    main()
