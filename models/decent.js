// RogerVIB v0.4 Decent v2
// 1.25M-parameter, 4-layer subword decoder-only Transformer.
// Trained from random weights on 10,000 RogerVIB examples and quantized to int8.
(() => {
  const M = window.DECENT_V2_CONFIG;
  const parts = window.DECENT_V2_PARTS || [];
  if (!M || !parts.length) {
    console.error('Decent v2 weights/config are missing');
    return;
  }

  const D = M.dModel;
  const H = M.heads;
  const HD = D / H;
  const CTX = M.context;
  const vocab = M.vocab;
  const stoi = new Map(vocab.map((token, i) => [token, i]));
  const BOS = stoi.get('<bos>');
  const EOS = stoi.get('<eos>');
  const USER = stoi.get('<user>');
  const ASSISTANT = stoi.get('<assistant>');
  const UNK = stoi.get('<unk>');
  const WORD_START = stoi.get('▁');

  // The generated chunks contain only base64, split on valid base64 boundaries.
  const encoded = parts.join('');
  const binary = atob(encoded);
  const raw = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) raw[i] = binary.charCodeAt(i);
  delete window.DECENT_V2_PARTS;

  const decoded = new Map();
  function tensor(name) {
    if (decoded.has(name)) return decoded.get(name);
    const spec = M.tensors[name];
    if (!spec) throw new Error(`Missing Decent tensor: ${name}`);
    const out = new Float32Array(spec.length);
    for (let i = 0; i < spec.length; i++) {
      const byte = raw[spec.offset + i];
      out[i] = (byte > 127 ? byte - 256 : byte) * spec.scale;
    }
    const value = { data: out, shape: spec.shape };
    decoded.set(name, value);
    return value;
  }

  function layerNorm(input, weightName, biasName) {
    const g = tensor(weightName).data;
    const b = tensor(biasName).data;
    let mean = 0;
    for (let i = 0; i < input.length; i++) mean += input[i];
    mean /= input.length;
    let variance = 0;
    for (let i = 0; i < input.length; i++) {
      const delta = input[i] - mean;
      variance += delta * delta;
    }
    variance /= input.length;
    const inv = 1 / Math.sqrt(variance + 1e-5);
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = (input[i] - mean) * inv * g[i] + b[i];
    return out;
  }

  function linear(input, weightName, biasName = null) {
    const weight = tensor(weightName);
    const [rows, cols] = weight.shape;
    const bias = biasName ? tensor(biasName).data : null;
    const out = new Float32Array(rows);
    for (let row = 0; row < rows; row++) {
      let sum = bias ? bias[row] : 0;
      const base = row * cols;
      for (let col = 0; col < cols; col++) sum += weight.data[base + col] * input[col];
      out[row] = sum;
    }
    return out;
  }

  function embedding(name, row) {
    const table = tensor(name);
    const width = table.shape[1];
    const out = new Float32Array(width);
    const base = row * width;
    for (let i = 0; i < width; i++) out[i] = table.data[base + i];
    return out;
  }

  function add(a, b) {
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
    return out;
  }

  function gelu(x) {
    // Standard fast GELU approximation; close to PyTorch's exact GELU at this scale.
    return 0.5 * x * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x * x * x)));
  }

  const subwordCandidates = new Map();
  for (const token of vocab) {
    if (!token || token.startsWith('<') || token.startsWith('▁')) continue;
    const first = token[0];
    if (!subwordCandidates.has(first)) subwordCandidates.set(first, []);
    subwordCandidates.get(first).push(token);
  }
  for (const list of subwordCandidates.values()) list.sort((a, b) => b.length - a.length);

  function encode(text) {
    const pieces = String(text).toLowerCase().match(/[a-z0-9]+|[^\s]/g) || [];
    const ids = [];
    for (const piece of pieces) {
      const whole = `▁${piece}`;
      if (stoi.has(whole)) {
        ids.push(stoi.get(whole));
        continue;
      }
      if (/^[a-z0-9]+$/.test(piece)) {
        ids.push(WORD_START);
        let cursor = 0;
        while (cursor < piece.length) {
          const candidates = subwordCandidates.get(piece[cursor]) || [];
          let found = null;
          for (const token of candidates) {
            if (piece.startsWith(token, cursor)) {
              found = token;
              break;
            }
          }
          if (found) {
            ids.push(stoi.get(found));
            cursor += found.length;
          } else {
            ids.push(stoi.get(piece[cursor]) ?? UNK);
            cursor += 1;
          }
        }
      } else {
        ids.push(stoi.get(piece) ?? UNK);
      }
    }
    return ids;
  }

  function decode(ids) {
    let text = '';
    for (const id of ids) {
      const token = vocab[id];
      if (!token || token.startsWith('<')) continue;
      if (token.startsWith('▁')) {
        const word = token.slice(1);
        if (word) text += `${text ? ' ' : ''}${word}`;
      } else {
        text += token;
      }
    }
    return text.trim();
  }

  function makeCaches() {
    return Array.from({ length: M.layers }, () => ({
      k: new Float32Array(CTX * D),
      v: new Float32Array(CTX * D)
    }));
  }

  // One autoregressive token step with a KV cache. Prompt tokens are prefetched once;
  // generated tokens then reuse all prior keys/values instead of rerunning the model.
  function step(tokenId, position, caches) {
    let x = add(embedding('tok.weight', tokenId), embedding('pos.weight', position));
    const attnScale = 1 / Math.sqrt(HD);

    for (let layer = 0; layer < M.layers; layer++) {
      const prefix = `blocks.${layer}`;
      const n1 = layerNorm(x, `${prefix}.l1.weight`, `${prefix}.l1.bias`);
      const qkv = linear(n1, `${prefix}.q.weight`, `${prefix}.q.bias`);
      const q = qkv.subarray(0, D);
      const k = qkv.subarray(D, D * 2);
      const v = qkv.subarray(D * 2, D * 3);
      const cache = caches[layer];
      cache.k.set(k, position * D);
      cache.v.set(v, position * D);

      const merged = new Float32Array(D);
      for (let head = 0; head < H; head++) {
        const headOffset = head * HD;
        const scores = new Float32Array(position + 1);
        let max = -Infinity;
        for (let past = 0; past <= position; past++) {
          const cacheBase = past * D + headOffset;
          let score = 0;
          for (let d = 0; d < HD; d++) score += q[headOffset + d] * cache.k[cacheBase + d];
          score *= attnScale;
          scores[past] = score;
          if (score > max) max = score;
        }
        let total = 0;
        for (let past = 0; past <= position; past++) {
          scores[past] = Math.exp(scores[past] - max);
          total += scores[past];
        }
        for (let past = 0; past <= position; past++) {
          const probability = scores[past] / total;
          const cacheBase = past * D + headOffset;
          for (let d = 0; d < HD; d++) merged[headOffset + d] += probability * cache.v[cacheBase + d];
        }
      }

      x = add(x, linear(merged, `${prefix}.p.weight`, `${prefix}.p.bias`));
      const n2 = layerNorm(x, `${prefix}.l2.weight`, `${prefix}.l2.bias`);
      const hidden = linear(n2, `${prefix}.f1.weight`, `${prefix}.f1.bias`);
      for (let i = 0; i < hidden.length; i++) hidden[i] = gelu(hidden[i]);
      x = add(x, linear(hidden, `${prefix}.f2.weight`, `${prefix}.f2.bias`));
    }

    const final = layerNorm(x, 'lf.weight', 'lf.bias');
    return linear(final, 'head.weight');
  }

  function argmax(logits) {
    let best = 0;
    let value = -Infinity;
    for (let i = 0; i < logits.length; i++) {
      if (logits[i] > value) {
        value = logits[i];
        best = i;
      }
    }
    return best;
  }

  function generate(input) {
    let prompt = [BOS, USER, ...encode(input), ASSISTANT];
    // Keep BOS/USER and the newest prompt tokens when a weirdly long input exceeds context.
    if (prompt.length > CTX - 2) prompt = [BOS, USER, ...prompt.slice(-(CTX - 4)), ASSISTANT];

    const caches = makeCaches();
    let logits = null;
    let position = 0;
    for (const id of prompt) {
      logits = step(id, position, caches);
      position += 1;
      if (position >= CTX) break;
    }

    const output = [];
    const maxNew = Math.min(36, CTX - position);
    for (let i = 0; i < maxNew; i++) {
      const next = argmax(logits);
      if (next === EOS || next === BOS || next === USER || next === ASSISTANT) break;
      output.push(next);
      if (position >= CTX) break;
      logits = step(next, position, caches);
      position += 1;
    }
    return decode(output);
  }

  function looksBroken(text) {
    if (!text) return true;
    if (text.length > 180) return true;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 8 && new Set(words).size / words.length < 0.35) return true;
    return false;
  }

  RogerVIB.registerModel({
    id: 'decent',
    name: 'Decent',
    order: 40,
    description: `RogerVIB v0.4 Decent — ${M.params.toLocaleString()}-parameter, ${M.layers}-layer subword Transformer trained from scratch on ${M.trainingExamples.toLocaleString()} examples.`,
    async reply(input, context) {
      const math = RogerVIB.simpleMath(input);
      if (math !== null) return math;
      try {
        const generated = generate(input);
        if (!looksBroken(generated)) return generated;
      } catch (error) {
        console.error('Decent v2 inference failed:', error);
      }
      const brah = RogerVIB.getModel('brah');
      return brah ? brah.reply(input, context) : 'my larger brain fell down';
    }
  });
})();
