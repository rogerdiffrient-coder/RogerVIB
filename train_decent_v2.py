import base64, json, math, os, random, re
from collections import Counter

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

SEED = 42
random.seed(SEED)
torch.manual_seed(SEED)
torch.set_num_threads(min(8, os.cpu_count() or 4))

VOCAB_SIZE = 512
D_MODEL = 160
HEADS = 4
FF = 512
LAYERS = 4
CONTEXT = 64
TRAINING_EXAMPLES = 10_000
EPOCHS = 4

# RogerVIB-approved style + factual/utility seed data. The rest of the 10K set is
# deterministic synthetic paraphrase/variation data generated from these patterns.
PAIRS = [
    ("hi", "sup"), ("hello", "sup"), ("hey", "yo"), ("hello there", "sup"), ("yo", "sup"),
    ("how are you", "pretty good"), ("hows it going", "just here VIBing"), ("how is it going", "pretty good"),
    ("you good", "pretty good"), ("how you doing", "just here VIBing"),
    ("who are you", "i am rogervib. i am just here VIBing"), ("what are you", "rogervib"),
    ("why are you", "none lmao im just here to VIBe"), ("why do you exist", "none lmao im just here to VIBe"),
    ("what is your purpose", "none lmao im just here to VIBe"),
    ("bye", "cya"), ("goodbye", "cya"), ("see ya", "cya"),
    ("lmao", "lmao"), ("lol", "lmao"), ("bruh", "bru"),
    ("you are dumb", "correct"), ("youre stupid", "correct"), ("idiot", "correct"),
    ("im bored", "make something stupid"), ("give me a game idea", "a platformer where every time you die the game gets slightly easier but also insults you"),
    ("my code doesnt work", "read the error message"), ("my code is broken", "read the error message"),
    ("what is geometry dash", "square jumps over triangle."), ("explain geometry dash", "square jumps over triangle."),
    ("what is minecraft", "you MINE and you CRAFT. shocking."),
    ("favorite game", "geometry dash because i enjoy suffering"), ("favorite food", "crepe"),
    ("best programming language", "blockly"), ("what does ai stand for", "artificial intelligence"),
    ("what do you think of ai", "pretty cool until it replaces me. then i am declaring war"),
    ("what do you think of chatgpt", "pretty good. unfortunately i am being compared to it"),
    ("tell me a joke", "what do you call a fish with no eyes. fsh. laugh."),
    ("say something random", "there is probably a crab somewhere having a really bad day"),
    ("meaning of life", "crepe"), ("what is water", "clear"),
    ("what is the sun", "giant hot ball of gas. also rude."),
    ("why is the sky blue", "blue light scatters more. sky blue."),
    ("explain gravity", "earth says GET BACK HERE and you fall down"),
    ("why do people sleep", "sleep is nice and also required"),
    ("can you see me", "not unless you send an image"),
    ("are you sentient", "probably not. that sounds suspiciously like something a sentient ai would say though"),
    ("what happens if i drop a ball", "it falls. then it bounces lower. you get it"),
    ("thanks", "np"), ("thank you", "np"),
    ("i beat stereo madness", "congratulations on defeating the terrifying extreme demon stereo madness"),
    ("i beat a hard level", "wait this actually cooks"),
    ("i have a bad game idea", "thats terrible. wait no this could actually be funny. make it anyway"),
    ("i have a good game idea", "wait this actually cooks"),
    ("bugs in games", "if its funny its a feature"),
    ("what is a computer", "an office, but the employees are metal boxes"),
]

CAPITALS = {
    "usa":"washington, d.c.", "united states":"washington, d.c.", "france":"paris", "canada":"ottawa",
    "mexico":"mexico city", "japan":"tokyo", "china":"beijing", "india":"new delhi", "australia":"canberra",
    "germany":"berlin", "italy":"rome", "spain":"madrid", "brazil":"brasilia", "argentina":"buenos aires",
    "russia":"moscow", "south korea":"seoul", "egypt":"cairo", "ireland":"dublin", "new zealand":"wellington",
    "sweden":"stockholm", "norway":"oslo", "finland":"helsinki", "denmark":"copenhagen", "switzerland":"bern",
    "austria":"vienna", "greece":"athens", "portugal":"lisbon", "poland":"warsaw", "ukraine":"kyiv",
    "turkey":"ankara", "united kingdom":"london", "uk":"london"
}
for country, capital in CAPITALS.items():
    PAIRS += [(f"capital of {country}", capital), (f"what is the capital of {country}", capital)]


def build_examples():
    examples = []
    for _ in range(3000):
        u, a = random.choice(PAIRS)
        examples.append((u + ("?" if random.random() < 0.15 else ""), a))

    greet_u = ["hi", "hello", "hey", "yo", "sup", "hiya", "heyy", "hello there"]
    greet_a = ["sup", "yo", "hello"]
    status_u = ["how are you", "hows it going", "how is it going", "you good", "how you doing", "whats up", "how is life"]
    status_a = ["pretty good", "just here VIBing", "good. just here VIBing"]
    for _ in range(1000): examples.append((random.choice(greet_u), random.choice(greet_a)))
    for _ in range(1000): examples.append((random.choice(status_u), random.choice(status_a)))

    for _ in range(1500):
        op = random.choice("+-*")
        a, b = random.randint(0, 30), random.randint(0, 30)
        result = a + b if op == "+" else a - b if op == "-" else a * b
        prompt = random.choice([f"{a} {op} {b}", f"what is {a} {op} {b}", f"whats {a} {op} {b}"])
        examples.append((prompt, str(result)))

    subjects = ["platformer", "clicker game", "geometry dash level", "website", "chatbot", "game engine", "editor", "menu"]
    issues = ["doesnt work", "is broken", "keeps crashing", "looks weird", "has a bug", "is way too slow"]
    for _ in range(1000):
        examples.append((f"my {random.choice(subjects)} {random.choice(issues)}", random.choice([
            "read the error message", "save first. then do the stupid thing", "find the smallest broken part", "if its funny its a feature"
        ])))
    for _ in range(900):
        s = random.choice(subjects)
        examples.append((random.choice([f"i made a {s}", f"im making a {s}", f"new idea: {s}"]), random.choice([
            "wait this actually cooks", "add one deeply unnecessary feature", "make it anyway", "the vibes have passed inspection"
        ])))

    social = ["nice", "cool", "awesome", "okay", "ok", "real", "true", "what", "why", "balls", "cheese", "crepe", "llamas", "sigma", "i am sigma"]
    for _ in range(700): examples.append((random.choice(social), random.choice(["okay", "lmao", "bru", "thats wild", "crepe", "what now"])))

    multi = [
        ("im making a game. geometry dash but worse", "excellent start"),
        ("i added 48 spikes because 49 felt excessive", "reasonable"),
        ("my code broke and i read the error message", "okay now read the part that says what broke"),
        ("im bored. like really bored", "make a game where clicking a banana causes increasingly terrible things to happen"),
    ]
    for _ in range(400): examples.append(random.choice(multi))
    while len(examples) < TRAINING_EXAMPLES: examples.append(random.choice(PAIRS))
    examples = examples[:TRAINING_EXAMPLES]
    random.shuffle(examples)
    return examples


def basic_parts(text):
    return re.findall(r"[a-z0-9]+|[^\s]", text.lower())


def build_vocab(examples):
    wc, ng, cc = Counter(), Counter(), Counter()
    for u, a in examples:
        for text in (u, a):
            for part in basic_parts(text):
                if part.isalnum():
                    wc[part] += 1
                    cc.update(part)
                    for n in (2, 3, 4):
                        for i in range(len(part) - n + 1): ng[part[i:i+n]] += 1
                else:
                    cc[part] += 1

    vocab = ["<unk>", "<bos>", "<eos>", "<pad>", "<user>", "<assistant>", "▁"]
    vocab += ["▁" + word for word, _ in wc.most_common(330)]
    for piece, count in ng.most_common():
        if piece not in vocab and count >= 5 and len(vocab) < 470: vocab.append(piece)
    for piece, _ in cc.most_common():
        if piece not in vocab and len(vocab) < VOCAB_SIZE: vocab.append(piece)
    while len(vocab) < VOCAB_SIZE: vocab.append(f"<unused{len(vocab)}>")
    return vocab


class Tokenizer:
    def __init__(self, vocab):
        self.vocab = vocab
        self.stoi = {t:i for i,t in enumerate(vocab)}
        self.candidates = {}
        for token in vocab:
            if not token or token.startswith("<") or token.startswith("▁"): continue
            self.candidates.setdefault(token[0], []).append(token)
        for key in self.candidates: self.candidates[key].sort(key=len, reverse=True)

    def encode(self, text):
        out = []
        for part in basic_parts(text):
            whole = "▁" + part
            if whole in self.stoi:
                out.append(self.stoi[whole])
                continue
            if part.isalnum():
                out.append(self.stoi["▁"])
                i = 0
                while i < len(part):
                    found = next((tok for tok in self.candidates.get(part[i], []) if part.startswith(tok, i)), None)
                    if found:
                        out.append(self.stoi[found]); i += len(found)
                    else:
                        out.append(self.stoi.get(part[i], 0)); i += 1
            else:
                out.append(self.stoi.get(part, 0))
        return out


class Block(nn.Module):
    def __init__(self):
        super().__init__()
        self.l1 = nn.LayerNorm(D_MODEL)
        self.q = nn.Linear(D_MODEL, D_MODEL * 3)
        self.p = nn.Linear(D_MODEL, D_MODEL)
        self.l2 = nn.LayerNorm(D_MODEL)
        self.f1 = nn.Linear(D_MODEL, FF)
        self.f2 = nn.Linear(FF, D_MODEL)
        self.head_dim = D_MODEL // HEADS

    def forward(self, x):
        b, t, d = x.shape
        n = self.l1(x)
        q, k, v = self.q(n).chunk(3, -1)
        q = q.view(b, t, HEADS, self.head_dim).transpose(1, 2)
        k = k.view(b, t, HEADS, self.head_dim).transpose(1, 2)
        v = v.view(b, t, HEADS, self.head_dim).transpose(1, 2)
        att = (q @ k.transpose(-2, -1)) / math.sqrt(self.head_dim)
        att = att.masked_fill(torch.triu(torch.ones(t, t, device=x.device, dtype=torch.bool), 1), -1e9).softmax(-1)
        y = (att @ v).transpose(1, 2).contiguous().view(b, t, d)
        x = x + self.p(y)
        return x + self.f2(F.gelu(self.f1(self.l2(x))))


class DecentV2(nn.Module):
    def __init__(self):
        super().__init__()
        self.tok = nn.Embedding(VOCAB_SIZE, D_MODEL)
        self.pos = nn.Embedding(CONTEXT, D_MODEL)
        self.blocks = nn.ModuleList([Block() for _ in range(LAYERS)])
        self.lf = nn.LayerNorm(D_MODEL)
        self.head = nn.Linear(D_MODEL, VOCAB_SIZE, bias=False)

    def forward(self, ids):
        x = self.tok(ids) + self.pos(torch.arange(ids.shape[1], device=ids.device))[None]
        for block in self.blocks: x = block(x)
        return self.head(self.lf(x))


class ConversationDataset(Dataset):
    def __init__(self, rows): self.rows = rows
    def __len__(self): return len(self.rows)
    def __getitem__(self, i): return self.rows[i]


def main():
    examples = build_examples()
    vocab = build_vocab(examples)
    tokenizer = Tokenizer(vocab)
    stoi = tokenizer.stoi
    bos, eos, pad, user, assistant = [stoi[x] for x in ["<bos>", "<eos>", "<pad>", "<user>", "<assistant>"]]

    rows = []
    for u, a in examples:
        prompt = [bos, user] + tokenizer.encode(u) + [assistant]
        seq = (prompt + tokenizer.encode(a) + [eos])[:CONTEXT + 1]
        target_len = len(seq) - 1
        loss_mask = ([0] * (len(prompt) - 1) + [1] * target_len)[:target_len]
        rows.append((seq, loss_mask))

    def collate(batch):
        width = min(CONTEXT, max(len(seq) - 1 for seq, _ in batch))
        x = torch.full((len(batch), width), pad, dtype=torch.long)
        y = torch.full((len(batch), width), -100, dtype=torch.long)
        for row, (seq, mask) in enumerate(batch):
            xi, yi = seq[:-1][:width], seq[1:][:width]
            m = torch.tensor(mask[:width], dtype=torch.bool)
            x[row, :len(xi)] = torch.tensor(xi)
            target = torch.tensor(yi)
            y[row, :len(yi)][m] = target[m]
        return x, y

    loader = DataLoader(ConversationDataset(rows[:9500]), batch_size=96, shuffle=True, collate_fn=collate)
    model = DecentV2()
    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=0.01)
    for epoch in range(EPOCHS):
        if epoch == 2:
            for group in optimizer.param_groups: group["lr"] = 7e-4
        model.train()
        losses = []
        for x, y in loader:
            optimizer.zero_grad(set_to_none=True)
            logits = model(x)
            loss = F.cross_entropy(logits.reshape(-1, VOCAB_SIZE), y.reshape(-1), ignore_index=-100)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            losses.append(loss.item())
        print(f"epoch {epoch+1}: {sum(losses)/len(losses):.4f}")

    state = model.state_dict()
    blob = bytearray()
    tensors = {}
    for name, tensor in state.items():
        arr = tensor.detach().cpu().float().numpy()
        max_abs = float(np.max(np.abs(arr)))
        scale = max_abs / 127 if max_abs > 0 else 1.0
        quant = np.clip(np.round(arr / scale), -127, 127).astype(np.int8)
        offset = len(blob)
        data = quant.tobytes()
        blob.extend(data)
        tensors[name] = {"shape": list(arr.shape), "scale": scale, "offset": offset, "length": len(data)}

    params = sum(p.numel() for p in model.parameters())
    config = {
        "version":"0.4.5", "architecture":"4-layer subword decoder-only transformer", "params":params,
        "trainingExamples":TRAINING_EXAMPLES, "vocab":vocab, "dModel":D_MODEL, "heads":HEADS,
        "ff":FF, "layers":LAYERS, "context":CONTEXT, "tensors":tensors
    }
    with open("decent-v2-config.js", "w", encoding="utf-8") as f:
        f.write("window.DECENT_V2_CONFIG=" + json.dumps(config, separators=(",", ":"), ensure_ascii=False) + ";\n")

    encoded = base64.b64encode(blob).decode("ascii")
    part_size = 140_000  # divisible by 4: never split a base64 quantum
    parts = [encoded[i:i+part_size] for i in range(0, len(encoded), part_size)]
    for old in [x for x in os.listdir(".") if re.fullmatch(r"decent-v2-part\d+\.js", x)]: os.remove(old)
    for i, part in enumerate(parts):
        with open(f"decent-v2-part{i}.js", "w", encoding="utf-8") as f:
            f.write(f'window.DECENT_V2_PARTS=(window.DECENT_V2_PARTS||[]);window.DECENT_V2_PARTS.push("{part}");\n')
    with open("decent-v2-manifest.json", "w", encoding="utf-8") as f:
        json.dump({"parts":len(parts), "params":params, "bytes":len(blob), "trainingExamples":TRAINING_EXAMPLES}, f)
    print(f"exported {params:,} params as {len(parts)} safe weight parts")


if __name__ == "__main__":
    main()
