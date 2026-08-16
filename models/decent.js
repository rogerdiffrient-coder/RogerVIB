// RogerVIB v0.4 Decent
// First genuinely generative RogerVIB model: a tiny decoder-only Transformer
// trained from random weights on 10,000 RogerVIB conversation examples.

(async () => {
  const M = window.DECENT_MODEL || await window.DECENT_MODEL_READY;
  if (!M) {
    console.error('Decent weights failed to load:', window.DECENT_MODEL_LOAD_ERROR);
    return;
  }

  const W = {};
  const vocab = M.vocab;
  const stoi = new Map(vocab.map((ch, i) => [ch, i]));
  const D = M.dModel;
  const H = M.heads;
  const HD = D / H;

  function decodeTensor(name) {
    if (W[name]) return W[name];
    const spec = M.tensors[name];
    const raw = atob(spec.data);
    const out = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      const byte = raw.charCodeAt(i);
      const signed = byte > 127 ? byte - 256 : byte;
      out[i] = signed * spec.scale;
    }
    W[name] = { data: out, shape: spec.shape };
    return W[name];
  }

  function layerNorm(input, weightName, biasName) {
    const g = decodeTensor(weightName).data;
    const b = decodeTensor(biasName).data;
    const out = new Float32Array(input.length);
    let mean = 0;
    for (let i = 0; i < input.length; i++) mean += input[i];
    mean /= input.length;
    let variance = 0;
    for (let i = 0; i < input.length; i++) {
      const d = input[i] - mean;
      variance += d * d;
    }
    variance /= input.length;
    const inv = 1 / Math.sqrt(variance + 1e-5);
    for (let i = 0; i < input.length; i++) out[i] = (input[i] - mean) * inv * g[i] + b[i];
    return out;
  }

  function linear(input, weightName, biasName = null) {
    const weight = decodeTensor(weightName);
    const [rows, cols] = weight.shape;
    const bias = biasName ? decodeTensor(biasName).data : null;
    const out = new Float32Array(rows);
    for (let r = 0; r < rows; r++) {
      let sum = bias ? bias[r] : 0;
      const base = r * cols;
      for (let c = 0; c < cols; c++) sum += weight.data[base + c] * input[c];
      out[r] = sum;
    }
    return out;
  }

  function gelu(x) {
    return 0.5 * x * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x * x * x)));
  }

  function add(a, b) {
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
    return out;
  }

  function embeddingRow(tensorName, row) {
    const tensor = decodeTensor(tensorName);
    const cols = tensor.shape[1];
    const out = new Float32Array(cols);
    const base = row * cols;
    for (let i = 0; i < cols; i++) out[i] = tensor.data[base + i];
    return out;
  }

  function forwardLast(ids) {
    const seq = ids.slice(-M.context);
    const T = seq.length;
    let x = new Array(T);

    for (let t = 0; t < T; t++) {
      x[t] = add(embeddingRow('tok.weight', seq[t]), embeddingRow('pos.weight', t));
    }

    const norm1 = x.map(v => layerNorm(v, 'b.l1.weight', 'b.l1.bias'));
    const q = new Array(T), k = new Array(T), v = new Array(T);
    for (let t = 0; t < T; t++) {
      const qkv = linear(norm1[t], 'b.q.weight', 'b.q.bias');
      q[t] = qkv.slice(0, D);
      k[t] = qkv.slice(D, D * 2);
      v[t] = qkv.slice(D * 2, D * 3);
    }

    const attnOut = new Array(T);
    const scale = 1 / Math.sqrt(HD);
    for (let t = 0; t < T; t++) {
      const merged = new Float32Array(D);
      for (let h = 0; h < H; h++) {
        const offset = h * HD;
        const scores = new Float32Array(t + 1);
        let max = -Infinity;
        for (let j = 0; j <= t; j++) {
          let s = 0;
          for (let d = 0; d < HD; d++) s += q[t][offset + d] * k[j][offset + d];
          s *= scale;
          scores[j] = s;
          if (s > max) max = s;
        }
        let total = 0;
        for (let j = 0; j <= t; j++) {
          scores[j] = Math.exp(scores[j] - max);
          total += scores[j];
        }
        for (let j = 0; j <= t; j++) {
          const p = scores[j] / total;
          for (let d = 0; d < HD; d++) merged[offset + d] += p * v[j][offset + d];
        }
      }
      attnOut[t] = add(x[t], linear(merged, 'b.p.weight', 'b.p.bias'));
    }

    for (let t = 0; t < T; t++) {
      const n2 = layerNorm(attnOut[t], 'b.l2.weight', 'b.l2.bias');
      const hidden = linear(n2, 'b.f1.weight', 'b.f1.bias');
      for (let i = 0; i < hidden.length; i++) hidden[i] = gelu(hidden[i]);
      x[t] = add(attnOut[t], linear(hidden, 'b.f2.weight', 'b.f2.bias'));
    }

    const last = layerNorm(x[T - 1], 'lf.weight', 'lf.bias');
    return linear(last, 'head.weight');
  }

  function encodePrompt(input) {
    const text = `¤${String(input).toLowerCase()}§`;
    const ids = [];
    for (const ch of text) {
      if (stoi.has(ch)) ids.push(stoi.get(ch));
      else if (stoi.has(' ')) ids.push(stoi.get(' '));
    }
    return ids.slice(-M.context);
  }

  function generate(input) {
    const ids = encodePrompt(input);
    let output = '';
    for (let step = 0; step < 120; step++) {
      const logits = forwardLast(ids);
      let best = 1;
      let bestValue = -Infinity;
      for (let i = 1; i < logits.length; i++) {
        if (logits[i] > bestValue) {
          bestValue = logits[i];
          best = i;
        }
      }
      const ch = vocab[best];
      if (ch === '¶') break;
      if (ch === '¤' || ch === '§' || ch === '<pad>') break;
      output += ch;
      ids.push(best);
      if (ids.length > M.context) ids.shift();
    }
    return output.trim();
  }

  const CAPITALS = {
    'usa':'washington, d.c.','united states':'washington, d.c.','france':'paris','canada':'ottawa','mexico':'mexico city',
    'japan':'tokyo','china':'beijing','india':'new delhi','australia':'canberra','germany':'berlin','italy':'rome',
    'spain':'madrid','brazil':'brasilia','argentina':'buenos aires','russia':'moscow','south korea':'seoul','egypt':'cairo',
    'ireland':'dublin','new zealand':'wellington','sweden':'stockholm','norway':'oslo','finland':'helsinki','denmark':'copenhagen',
    'switzerland':'bern','austria':'vienna','greece':'athens','portugal':'lisbon','poland':'warsaw','ukraine':'kyiv','turkey':'ankara',
    'united kingdom':'london','uk':'london'
  };

  function factualTool(input) {
    const n = RogerVIB.normalize(input).replace(/^what is /,'').replace(/^whats /,'');
    const cap = n.match(/^capital of (?:the )?(.+)$/);
    if (cap) return CAPITALS[cap[1]] || 'idk that capital yet';
    return null;
  }

  function looksBad(text) {
    if (!text || text.length < 1) return true;
    if (text.length > 115) return true;
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length >= 6) {
      const unique = new Set(words).size;
      if (unique / words.length < 0.35) return true;
    }
    return false;
  }

  RogerVIB.registerModel({
    id: 'decent',
    name: 'Decent',
    order: 40,
    description: `RogerVIB v0.4 Decent — a ${M.params.toLocaleString()}-parameter decoder-only Transformer trained from scratch on ${M.trainingExamples.toLocaleString()} examples.`,
    async reply(input, context) {
      const math = RogerVIB.simpleMath(input);
      if (math !== null) return math;
      const fact = factualTool(input);
      if (fact !== null) return fact;

      const generated = generate(input);
      if (!looksBad(generated)) return generated;

      const brah = RogerVIB.getModel('brah');
      return brah ? brah.reply(input, context) : 'my language model fell down';
    }
  });

  window.dispatchEvent(new CustomEvent('rogervib:decent-ready'));
})();
