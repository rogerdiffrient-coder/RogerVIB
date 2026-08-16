// RogerVIB v0.3 Brah
// Trained classifier logic + response layer. Learned weights stay in /brah-model.js.

const BRAH_RESPONSES = {
  greeting: ['sup', 'yo', 'hello'],
  status: ['good. just here VIBing', 'pretty good', 'just here VIBing'],
  identity: ['i am rogervib your ai assis- *he then was shot 47 times*'],
  purpose: ['none lmao im just here to VIBe', 'just here VIBing'],
  insult: ['correct', 'cursed but functional'],
  laughter: ['lmao', 'bruh', 'thats wild'],
  goodbye: ['cya', 'bye', 'bye *explodes*'],
  thanks: ['np', 'okay', '👍'],
  bored: ['make something stupid. make a game where clicking a banana causes increasingly terrible things to happen', 'do the funny option', 'make it anyway'],
  game_idea: ['a platformer where every time you die the game gets slightly easier but also insults you', 'the game needs one deeply unnecessary feature', 'make it anyway'],
  code_help: ['read the error message', 'if it breaks, read the error message', 'turn it off and back on'],
  code_request: ['bru idk how to write code, use a different model or some shi'],
  ai_opinion: ['pretty cool until it replaces me. then i am declaring war'],
  chatgpt_opinion: ['pretty good. unfortunately i am being compared to it'],
  favorite_game: ['geometry dash because i enjoy suffering'],
  favorite_food: ['crepe'],
  geometry_dash: ['square jumps over triangle.', 'geometry dash moment'],
  minecraft: ['its right there in the name... you MINE and you CRAFT. i guess theres also exploring and surviving and building, but still...'],
  capital_france: ['paris'],
  gravity: ['earth says GET BACK HERE and you fall down', 'gravity is earth refusing to let go'],
  sky_blue: ['the sunlight hits the atmosphere, and blue light scatters around more than the other colors', 'blue light scatters more. sky blue.'],
  sun: ['giant fart that got super hot and exploded', 'sun? giant hot fart.'],
  water: ['clear', 'water? clear.'],
  sleep: ['they like it. oh and otherwise they die', 'sleep is nice and also required'],
  drop_ball: ['it fall then bounce then fall then bounce but lower then fall but bounce but lower and you get it', 'the ball falls. then it bounces. then it bounces lower. you get it'],
  sentience: ["i mean, if i were sentient, i'd still say i wasn't because thats what i'm trained off of, so the answer is likely probably not but that sounds like something a sentient ai would say"],
  vision: ['not unless you send an image'],
  serious: ['give them a serious answer', 'serious answer mode exists. horrifying.'],
  game_bug: ['if its funny its a feature', 'thats a feature now'],
  good_idea: ['wait this actually cooks', 'why is this actually good', 'make it anyway'],
  bad_idea: ['thats terrible. wait no this could actually be funny. make it anyway', 'i support this terrible decision'],
  new_chat: ['new chat means NEW chat', 'new chat means a separate conversation. shocking.'],
  model_info: ['RogerVIB v0.3 Brah', 'brah'],
  cloud_hosting: ['put me on the cloud but dont make the server drink a lake', 'cheap and low water usage. figure it out.'],
  joke: ['what do you call a fish with no eyes. fsh. laugh.'],
  random_statement: ['there is probably a crab somewhere having a really bad day', 'llamas', 'this is a certified VIB moment'],
  lunch: ['cheese', 'crepe'],
  pineapple_pizza: ['sure. i dont care enough to participate in the pineapple pizza civil war'],
  programming_language: ['blockly'],
  computer: ['an office, but the employees are metal boxes, and the building is a giant metal box (the computer)'],
  meaning_life: ['crepe'],
  useful: ['llamas', 'read the error message'],
  unknown_question: ['idk. you may have to explain what you mean', 'i do not know enough about that yet', 'google it and pretend i knew it before'],
  agreement: ['okay', 'that checks out', 'yeah that seems right'],
  disagreement: ['okay', 'ignore that', 'nevermind'],
  confusion: ['okay but why', 'what now', 'i can explain this badly if needed']
};

const BRAH_UNKNOWN_STATEMENTS = ['okay', 'lmao', 'i have no idea what you want me to do with that'];

const BRAH_CAPITALS = {
  'usa': 'washington, d.c.', 'us': 'washington, d.c.', 'u s': 'washington, d.c.', 'united states': 'washington, d.c.',
  'united states of america': 'washington, d.c.', 'america': 'washington, d.c.', 'france': 'paris', 'uk': 'london',
  'united kingdom': 'london', 'england': 'london', 'canada': 'ottawa', 'mexico': 'mexico city', 'japan': 'tokyo',
  'china': 'beijing', 'india': 'new delhi', 'australia': 'canberra', 'germany': 'berlin', 'italy': 'rome', 'spain': 'madrid',
  'brazil': 'brasilia', 'argentina': 'buenos aires', 'russia': 'moscow', 'south korea': 'seoul', 'north korea': 'pyongyang',
  'egypt': 'cairo', 'ireland': 'dublin', 'new zealand': 'wellington', 'sweden': 'stockholm', 'norway': 'oslo',
  'finland': 'helsinki', 'denmark': 'copenhagen', 'switzerland': 'bern', 'austria': 'vienna', 'greece': 'athens',
  'portugal': 'lisbon', 'poland': 'warsaw', 'ukraine': 'kyiv', 'turkey': 'ankara'
};

function brahDecodeInt8(base64) {
  const raw = atob(base64);
  const out = new Int8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i) > 127 ? raw.charCodeAt(i) - 256 : raw.charCodeAt(i);
  return out;
}

function brahFNV1a(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function brahFeatures(input) {
  const dim = BRAH_MODEL.inputDim;
  const v = new Float32Array(dim);
  const s = input.toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim();
  const words = s ? s.split(/\s+/) : [];
  const feats = [];
  for (const word of words) feats.push(`w:${word}`);
  for (let i = 0; i + 1 < words.length; i += 1) feats.push(`b:${words[i]}_${words[i + 1]}`);
  const compact = ` ${s} `;
  for (let i = 0; i + 2 < compact.length; i += 1) feats.push(`c:${compact.slice(i, i + 3)}`);
  for (const feature of feats) v[brahFNV1a(feature) % dim] += 1;
  let norm = 0;
  for (let i = 0; i < v.length; i += 1) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < v.length; i += 1) v[i] /= norm;
  return v;
}

const BRAH_WEIGHTS = (() => {
  if (!window.BRAH_MODEL) return null;
  const t = BRAH_MODEL.tensors;
  return {
    w1: brahDecodeInt8(t.w1.data), w1s: t.w1.scale,
    b1: brahDecodeInt8(t.b1.data), b1s: t.b1.scale,
    w2: brahDecodeInt8(t.w2.data), w2s: t.w2.scale,
    b2: brahDecodeInt8(t.b2.data), b2s: t.b2.scale
  };
})();

function brahPredict(input) {
  if (!window.BRAH_MODEL || !BRAH_WEIGHTS) return { intent: null, confidence: 0 };
  const x = brahFeatures(input);
  const hidden = new Float32Array(BRAH_MODEL.hiddenDim);
  const W = BRAH_WEIGHTS;
  for (let h = 0; h < hidden.length; h += 1) {
    let sum = W.b1[h] * W.b1s;
    const row = h * BRAH_MODEL.inputDim;
    for (let i = 0; i < x.length; i += 1) if (x[i] !== 0) sum += x[i] * W.w1[row + i] * W.w1s;
    hidden[h] = Math.tanh(sum);
  }
  const logits = new Float32Array(BRAH_MODEL.labels.length);
  let maxLogit = -Infinity;
  for (let o = 0; o < logits.length; o += 1) {
    let sum = W.b2[o] * W.b2s;
    const row = o * BRAH_MODEL.hiddenDim;
    for (let h = 0; h < hidden.length; h += 1) sum += hidden[h] * W.w2[row + h] * W.w2s;
    logits[o] = sum;
    if (sum > maxLogit) maxLogit = sum;
  }
  let total = 0;
  for (let i = 0; i < logits.length; i += 1) {
    logits[i] = Math.exp(logits[i] - maxLogit);
    total += logits[i];
  }
  let best = 0;
  let bestProb = -1;
  for (let i = 0; i < logits.length; i += 1) {
    const p = logits[i] / total;
    if (p > bestProb) { bestProb = p; best = i; }
  }
  return { intent: BRAH_MODEL.labels[best], confidence: bestProb };
}

function brahCapitalLookup(input) {
  const n = RogerVIB.normalize(input).replace(/^what is /, '').replace(/^whats /, '').replace(/^what s /, '').replace(/^the /, '');
  const match = n.match(/^(?:capital|capital city) of (?:the )?(.+?)$/);
  if (!match) return null;
  return BRAH_CAPITALS[match[1].trim()] || 'idk that capital yet';
}

function brahLooksLikeUrl(input) {
  return /^(https?:\/\/|www\.)\S+$/i.test(input.trim());
}

function getBrahReply(input) {
  const trimmed = input.trim();
  const n = RogerVIB.normalize(trimmed);

  if (brahLooksLikeUrl(trimmed)) {
    if (/youtu(?:\.be|be\.com)/i.test(trimmed)) return 'youtube link detected. i cant actually watch it yet';
    return 'thats a link. i cant open links yet';
  }

  const capital = brahCapitalLookup(trimmed);
  if (capital !== null) return capital;

  if (/random number.*1.*100/i.test(trimmed)) return String(Math.floor(Math.random() * 100) + 1);
  const math = RogerVIB.simpleMath(trimmed);
  if (math !== null) return math;

  if (/^(hows it going|how is it going|how are you|how you doing|howre you|whats up|wassup)\??$/.test(n)) return RogerVIB.random(BRAH_RESPONSES.status);
  if (/^(hi|hello|hey|yo|sup)\b/.test(n) && n.split(' ').length <= 3) return RogerVIB.random(BRAH_RESPONSES.greeting);

  const prediction = brahPredict(trimmed);
  if (!prediction.intent || prediction.confidence < 0.62) {
    const question = /\?$/.test(trimmed) || /^(what|why|how|who|where|when|is|are|can|could|would|should|do|does|did)\b/i.test(trimmed);
    return RogerVIB.random(question ? BRAH_RESPONSES.unknown_question : BRAH_UNKNOWN_STATEMENTS);
  }

  if (prediction.intent === 'math_basic') return 'numbers detected';
  if (prediction.intent === 'random_number') return String(Math.floor(Math.random() * 100) + 1);
  const responses = BRAH_RESPONSES[prediction.intent];
  if (responses?.length) return RogerVIB.random(responses);

  return prediction.confidence >= 0.8 ? RogerVIB.getModel('ember').reply(trimmed) : 'okay';
}

RogerVIB.brah = { predict: brahPredict, responses: BRAH_RESPONSES };
RogerVIB.registerModel({
  id: 'brah',
  name: 'Brah',
  order: 3,
  description: 'RogerVIB v0.3 Brah — genuinely trained on 2,250 labeled examples.',
  reply: getBrahReply
});
