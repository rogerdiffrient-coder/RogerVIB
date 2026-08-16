// RogerVIB v0.5 Cool
// ~7M-parameter, 8-layer subword decoder-only Transformer with RoPE + tool use.
(() => {
  const M = window.COOL_V1_CONFIG;
  const parts = window.COOL_V1_PARTS || [];
  if (!M || !parts.length) {
    console.error('Cool weights/config are missing');
    return;
  }

  const D = M.dModel, H = M.heads, HD = D / H, HALF = HD / 2, CTX = M.context;
  const vocab = M.vocab;
  const stoi = new Map(vocab.map((token, i) => [token, i]));
  const BOS = stoi.get('<bos>'), EOS = stoi.get('<eos>'), USER = stoi.get('<user>'), ASSISTANT = stoi.get('<assistant>');
  const UNK = stoi.get('<unk>'), WORD_START = stoi.get('▁');
  const TOOL_SEARCH = stoi.get('<tool_search>'), TOOL_CALC = stoi.get('<tool_calc>'), TOOL_END = stoi.get('<tool_end>'), TOOL_RESULT = stoi.get('<tool_result>');

  const encoded = parts.join('');
  const binary = atob(encoded);
  const raw = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) raw[i] = binary.charCodeAt(i);
  delete window.COOL_V1_PARTS;

  const decoded = new Map();
  function tensor(name) {
    if (decoded.has(name)) return decoded.get(name);
    const spec = M.tensors[name];
    if (!spec) throw new Error(`Missing Cool tensor: ${name}`);
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
    const g = tensor(weightName).data, b = tensor(biasName).data;
    let mean = 0;
    for (let i = 0; i < input.length; i++) mean += input[i];
    mean /= input.length;
    let variance = 0;
    for (let i = 0; i < input.length; i++) { const d = input[i] - mean; variance += d * d; }
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

  function embedding(row) {
    const table = tensor('tok.weight');
    const out = new Float32Array(D), base = row * D;
    for (let i = 0; i < D; i++) out[i] = table.data[base + i];
    return out;
  }

  function add(a, b) {
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
    return out;
  }
  function gelu(x) { return 0.5 * x * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x * x * x))); }

  const subwordCandidates = new Map();
  for (const token of vocab) {
    if (!token || token.startsWith('<') || token.startsWith('▁')) continue;
    if (!subwordCandidates.has(token[0])) subwordCandidates.set(token[0], []);
    subwordCandidates.get(token[0]).push(token);
  }
  for (const list of subwordCandidates.values()) list.sort((a, b) => b.length - a.length);

  function encode(text) {
    const pieces = String(text).toLowerCase().match(/[a-z0-9]+|[^\s]/g) || [];
    const ids = [];
    for (const piece of pieces) {
      const whole = `▁${piece}`;
      if (stoi.has(whole)) { ids.push(stoi.get(whole)); continue; }
      if (/^[a-z0-9]+$/.test(piece)) {
        ids.push(WORD_START);
        let cursor = 0;
        while (cursor < piece.length) {
          const candidates = subwordCandidates.get(piece[cursor]) || [];
          let found = null;
          for (const token of candidates) if (piece.startsWith(token, cursor)) { found = token; break; }
          if (found) { ids.push(stoi.get(found)); cursor += found.length; }
          else { ids.push(stoi.get(piece[cursor]) ?? UNK); cursor += 1; }
        }
      } else ids.push(stoi.get(piece) ?? UNK);
    }
    return ids;
  }

  function decode(ids, keepSpecial = false) {
    let text = '';
    for (const id of ids) {
      const token = vocab[id];
      if (!token) continue;
      if (token.startsWith('<')) {
        if (keepSpecial) text += `${text ? ' ' : ''}${token}`;
        continue;
      }
      if (token.startsWith('▁')) {
        const word = token.slice(1);
        if (word) text += `${text ? ' ' : ''}${word}`;
      } else text += token;
    }
    return text.trim();
  }

  function makeCaches() {
    return Array.from({ length: M.layers }, () => ({ k: new Float32Array(CTX * D), v: new Float32Array(CTX * D) }));
  }

  function applyRope(vec, position) {
    const out = new Float32Array(vec);
    for (let head = 0; head < H; head++) {
      const base = head * HD;
      for (let i = 0; i < HALF; i++) {
        const freq = Math.exp(-Math.log(10000) * i / HALF);
        const angle = position * freq, c = Math.cos(angle), s = Math.sin(angle);
        const a = vec[base + i], b = vec[base + HALF + i];
        out[base + i] = a * c - b * s;
        out[base + HALF + i] = a * s + b * c;
      }
    }
    return out;
  }

  function step(tokenId, position, caches) {
    let x = embedding(tokenId);
    const attnScale = 1 / Math.sqrt(HD);
    for (let layer = 0; layer < M.layers; layer++) {
      const prefix = `blocks.${layer}`;
      const n1 = layerNorm(x, `${prefix}.l1.weight`, `${prefix}.l1.bias`);
      const qkv = linear(n1, `${prefix}.qkv.weight`, `${prefix}.qkv.bias`);
      const q = applyRope(qkv.subarray(0, D), position);
      const k = applyRope(qkv.subarray(D, D * 2), position);
      const v = qkv.subarray(D * 2, D * 3);
      const cache = caches[layer];
      cache.k.set(k, position * D); cache.v.set(v, position * D);

      const merged = new Float32Array(D);
      for (let head = 0; head < H; head++) {
        const headOffset = head * HD;
        const scores = new Float32Array(position + 1);
        let max = -Infinity;
        for (let past = 0; past <= position; past++) {
          const cacheBase = past * D + headOffset;
          let score = 0;
          for (let d = 0; d < HD; d++) score += q[headOffset + d] * cache.k[cacheBase + d];
          score *= attnScale; scores[past] = score; if (score > max) max = score;
        }
        let total = 0;
        for (let past = 0; past <= position; past++) { scores[past] = Math.exp(scores[past] - max); total += scores[past]; }
        for (let past = 0; past <= position; past++) {
          const p = scores[past] / total, cacheBase = past * D + headOffset;
          for (let d = 0; d < HD; d++) merged[headOffset + d] += p * cache.v[cacheBase + d];
        }
      }
      x = add(x, linear(merged, `${prefix}.proj.weight`, `${prefix}.proj.bias`));
      const n2 = layerNorm(x, `${prefix}.l2.weight`, `${prefix}.l2.bias`);
      const hidden = linear(n2, `${prefix}.f1.weight`, `${prefix}.f1.bias`);
      for (let i = 0; i < hidden.length; i++) hidden[i] = gelu(hidden[i]);
      x = add(x, linear(hidden, `${prefix}.f2.weight`, `${prefix}.f2.bias`));
    }
    return linear(layerNorm(x, 'lf.weight', 'lf.bias'), 'head.weight');
  }

  function argmax(logits) {
    let best = 0, value = -Infinity;
    for (let i = 0; i < logits.length; i++) if (logits[i] > value) { value = logits[i]; best = i; }
    return best;
  }

  function generateIds(prompt, maxNew = 64) {
    prompt = prompt.slice(-Math.max(1, CTX - maxNew));
    const caches = makeCaches();
    let logits = null, position = 0;
    for (const id of prompt) { logits = step(id, position++, caches); if (position >= CTX) break; }
    const output = [];
    for (let i = 0; i < maxNew && position < CTX; i++) {
      const next = argmax(logits);
      if (next === EOS || next === BOS || next === USER) break;
      output.push(next);
      logits = step(next, position++, caches);
      if (next === TOOL_END) break;
    }
    return output;
  }

  // Build a real rolling token window instead of keeping a fixed number of turns.
  // This automatically scales when a later model raises M.context (e.g. 256 -> 512).
  function historyPrompt(input, context, generationReserve = 80) {
    const promptBudget = Math.max(8, CTX - generationReserve);
    const currentTokens = encode(input);
    const currentRoom = Math.max(1, promptBudget - 3); // BOS + USER + ASSISTANT
    const current = [USER, ...currentTokens.slice(-currentRoom), ASSISTANT];

    let remaining = promptBudget - 1 - current.length; // reserve BOS
    const selected = [];
    const messages = context?.chat?.messages || [];
    const prior = messages.length && messages[messages.length - 1]?.role === 'user'
      ? messages.slice(0, -1)
      : messages;

    // Walk newest -> oldest. Recent complete turns win. Once an older turn no longer
    // fits, stop; if it is the nearest oversized turn, keep its newest token tail.
    for (let i = prior.length - 1; i >= 0 && remaining > 1; i--) {
      const message = prior[i];
      const roleToken = message.role === 'bot' ? ASSISTANT : USER;
      const body = encode(message.text);
      const turn = [roleToken, ...body];
      if (turn.length <= remaining) {
        selected.unshift(turn);
        remaining -= turn.length;
        continue;
      }
      if (selected.length === 0 && remaining > 1) {
        selected.unshift([roleToken, ...body.slice(-(remaining - 1))]);
      }
      break;
    }

    return [BOS, ...selected.flat(), ...current];
  }

  function parseTool(output) {
    if (!output.length) return null;
    const first = output[0];
    if (first !== TOOL_SEARCH && first !== TOOL_CALC) return null;
    const end = output.indexOf(TOOL_END);
    if (end < 0) return null;
    return { name: first === TOOL_SEARCH ? 'web_search' : 'calculator', token: first, query: decode(output.slice(1, end)), ids: output.slice(0, end + 1) };
  }

  function formatToolResult(result) {
    if (!result?.ok) return `tool error: ${result?.error || 'unknown error'}`;
    if (result.name === 'calculator') return String(result.result);
    const data = result.result || {};
    const rows = data.results || [];
    const text = rows.slice(0, 4).map((row, i) => `${i + 1}. ${row.title}. ${row.snippet}`).join(' ');
    return `${data.mode || 'search'} results: ${text || 'no useful results'}`;
  }

  async function runToolAndAnswer(input, context, basePrompt, tool) {
    const tools = window.RogerVIBTools;
    if (!tools) return 'tools are missing. impressive.';
    const args = tool.name === 'calculator' ? { expression: tool.query } : { query: tool.query };
    const result = await tools.run(tool.name, args);

    // Calculator output is already exact. Do not let the language model rewrite it.
    if (tool.name === 'calculator' && result?.ok) return String(result.result);

    // Search text is useful, but it must not evict the whole conversation or leave
    // zero room for the answer. Budgets scale automatically with the model context.
    const answerReserve = Math.min(112, Math.max(64, Math.floor(CTX * 0.22)));
    const resultBudget = Math.min(192, Math.max(64, Math.floor(CTX * 0.38)));
    const resultIds = encode(formatToolResult(result)).slice(0, resultBudget);
    const suffix = [...tool.ids, TOOL_RESULT, ...resultIds, ASSISTANT];
    const promptBudget = Math.max(8, CTX - answerReserve);
    const bodyBudget = Math.max(1, promptBudget - 1);
    const combined = [...basePrompt.slice(1), ...suffix];
    const prompt = [BOS, ...combined.slice(-bodyBudget)];
    const answer = decode(generateIds(prompt, answerReserve));
    if (tool.name === 'web_search' && (!answer || answer.length < 8 || !/[a-z]/i.test(answer))) return formatToolResult(result);
    return answer;
  }

  function obviousSearch(input) { return /\b(latest|current|today|recent|search|research|browse|look up|lookup|find online|news|update|patch notes)\b/i.test(input); }
  function obviousMath(input) { return /^\s*(?:what(?:'s| is)?\s+|calculate\s+)?[0-9().%\s+\-*/]+\??\s*$/i.test(input); }

  function looksBroken(text) {
    if (!text || text.length > 320) return true;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 10 && new Set(words).size / words.length < 0.35) return true;
    return false;
  }

  RogerVIB.registerModel({
    id: 'cool', name: 'Cool', order: 50,
    description: `RogerVIB v0.5 Cool — ${M.params.toLocaleString()}-parameter, ${M.layers}-layer Transformer with tools, RoPE, and ${M.context}-token context.`,
    async reply(input, context) {
      try {
        const prompt = historyPrompt(input, context);
        const first = generateIds(prompt, 64);
        let tool = parseTool(first);
        if (tool?.name === 'web_search' && !obviousSearch(input)) tool = null;
        if (tool?.name === 'calculator' && !obviousMath(input)) tool = null;

        // Safety/reliability router: obvious utility requests may use a tool even if
        // the tiny model forgets the special token.
        if (obviousMath(input)) tool = { name: 'calculator', token: TOOL_CALC, query: input.replace(/^(what(?:'s| is)?|calculate)\s+/i, '').replace(/\?$/, ''), ids: [TOOL_CALC, ...encode(input), TOOL_END] };
        if (obviousSearch(input)) tool = { name: 'web_search', token: TOOL_SEARCH, query: input, ids: [TOOL_SEARCH, ...encode(input), TOOL_END] };

        if (tool) {
          const answer = await runToolAndAnswer(input, context, prompt, tool);
          if (!looksBroken(answer)) return answer;
        }

        const normal = decode(first);
        if (!looksBroken(normal)) return normal;
      } catch (error) {
        console.error('Cool inference failed:', error);
      }
      const decent = RogerVIB.getModel('decent');
      return decent ? decent.reply(input, context) : 'my cool brain fell down';
    }
  });
})();
