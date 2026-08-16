// RogerVIB v0.3 Brah
// ACTUALLY TRAINED: 2,250 labeled examples -> hashed text features ->
// 24 tanh hidden units -> 48-way classifier. The learned weights live in
// brah-model.js. Rules below only handle deterministic tasks like arithmetic.

MODEL_INFO.brah = 'RogerVIB v0.3 Brah — genuinely trained on 2,250 labeled examples.';

const BRAH_RESPONSES = {
  greeting: ['sup', 'hello', 'yo', 'you rang'],
  status: ['just here VIBing', 'pretty good. unfortunately i am being compared to chatgpt', 'i was here the whole time', 'sup again'],
  identity: ['i am rogervib your ai assis- *he then was shot 47 times*'],
  purpose: ['none lmao im just here to VIBe', 'just here VIBing'],
  insult: ['correct', 'that sounds like a you problem', 'cursed but functional'],
  laughter: ['lmao', 'bruh', 'thats wild', 'okay'],
  goodbye: ['cya', 'bye', 'bye *explodes*'],
  thanks: ['okay', 'alright', 'you rang'],
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
  unknown_question: ['google it and pretend i knew it before', 'google it and hope'],
  agreement: ['okay', 'that checks out', 'yeah that seems right'],
  disagreement: ['okay', 'ignore that', 'nevermind'],
  confusion: ['okay but why', 'what now', 'i can explain this badly if needed']
};

function brahPick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

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
  const t = BRAH_MODEL.tensors;
  return {
    w1: brahDecodeInt8(t.w1.data), w1s: t.w1.scale,
    b1: brahDecodeInt8(t.b1.data), b1s: t.b1.scale,
    w2: brahDecodeInt8(t.w2.data), w2s: t.w2.scale,
    b2: brahDecodeInt8(t.b2.data), b2s: t.b2.scale
  };
})();

function brahPredict(input) {
  if (!window.BRAH_MODEL) return { intent: null, confidence: 0 };

  const x = brahFeatures(input);
  const hidden = new Float32Array(BRAH_MODEL.hiddenDim);
  const W = BRAH_WEIGHTS;

  for (let h = 0; h < hidden.length; h += 1) {
    let sum = W.b1[h] * W.b1s;
    const row = h * BRAH_MODEL.inputDim;
    for (let i = 0; i < x.length; i += 1) {
      if (x[i] !== 0) sum += x[i] * W.w1[row + i] * W.w1s;
    }
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
  let best = 0;
  let bestProb = -1;
  for (let i = 0; i < logits.length; i += 1) {
    const p = Math.exp(logits[i] - maxLogit);
    logits[i] = p;
    total += p;
  }
  for (let i = 0; i < logits.length; i += 1) {
    const p = logits[i] / total;
    if (p > bestProb) { bestProb = p; best = i; }
  }

  return { intent: BRAH_MODEL.labels[best], confidence: bestProb };
}

function getBrahReply(input) {
  // Deterministic tools stay deterministic instead of asking the classifier.
  if (/random number.*1.*100/i.test(input)) return String(Math.floor(Math.random() * 100) + 1);
  const math = simpleMath(input);
  if (math !== null) return math;

  const prediction = brahPredict(input);

  // Low confidence means "I genuinely don't know," not semantic roulette.
  if (!prediction.intent || prediction.confidence < 0.62) {
    const question = /\?$/.test(input.trim()) || /^(what|why|how|who|where|when|is|are|can|could|would|should|do|does|did)\b/i.test(input.trim());
    return brahPick(question ? BRAH_RESPONSES.unknown_question : ['okay', 'lmao', 'what now']);
  }

  if (prediction.intent === 'math_basic') {
    const fallbackMath = simpleMath(input);
    return fallbackMath !== null ? fallbackMath : 'numbers detected';
  }
  if (prediction.intent === 'random_number') return String(Math.floor(Math.random() * 100) + 1);

  const responses = BRAH_RESPONSES[prediction.intent];
  if (responses?.length) return brahPick(responses);

  return prediction.confidence >= 0.8 ? getEmberReply(input) : 'okay';
}

// Add Brah to the picker.
if (!modelPicker.querySelector('option[value="brah"]')) {
  const option = document.createElement('option');
  option.value = 'brah';
  option.textContent = 'Brah';
  modelPicker.insertBefore(option, modelPicker.firstChild);
}

const preBrahGetModelReply = getModelReply;
getModelReply = function(input, model) {
  if (model === 'brah') return getBrahReply(input);
  return preBrahGetModelReply(input, model);
};

validModel = function(model) {
  return ['brah', 'ember', 'spark', 'brick'].includes(model) ? model : 'brah';
};

createChatObject = function(model = 'brah') {
  return { id: makeId(), title: 'New conversation', model: validModel(model), messages: [] };
};

try {
  const rawChats = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (Array.isArray(rawChats)) {
    for (const chat of chats) {
      const raw = rawChats.find(item => item && item.id === chat.id);
      if (raw?.model === 'brah') chat.model = 'brah';
    }
  }
} catch {}

if (chats.length === 1 && chats[0].messages.length === 0 && chats[0].title === 'New conversation' && chats[0].model === 'ember') {
  chats[0].model = 'brah';
}

const preBrahCreateNewChat = createNewChat;
newChatButton.removeEventListener('click', preBrahCreateNewChat);
createNewChat = function() {
  const chat = createChatObject('brah');
  chats.unshift(chat);
  activeChatId = chat.id;
  saveChats();
  renderChatList();
  renderConversation();
  messageInput.value = '';
  resizeInput();
  messageInput.focus();
  if (window.innerWidth <= 760) sidebar.classList.remove('mobile-open');
};
newChatButton.addEventListener('click', createNewChat);

deleteChat = function(id) {
  const index = chats.findIndex(chat => chat.id === id);
  if (index === -1) return;
  const wasActive = id === activeChatId;
  chats.splice(index, 1);

  if (!chats.length) {
    const replacement = createChatObject('brah');
    chats.push(replacement);
    activeChatId = replacement.id;
  } else if (wasActive) {
    activeChatId = chats[Math.min(index, chats.length - 1)].id;
  }

  saveChats();
  renderChatList();
  renderConversation();
};

saveChats();
renderChatList();
renderConversation();
