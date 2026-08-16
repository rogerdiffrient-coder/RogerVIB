// RogerVIB v0.3 Brah
// A semantic-ish layer on top of Spark/Ember: classify obvious intent first,
// use high-confidence training matches second, and refuse to roulette unrelated answers.

MODEL_INFO.brah = 'RogerVIB v0.3 Brah — understands basic intent before it starts VIBing.';

const BRAH_RESPONSES = {
  greeting: ['sup', 'sup', 'hello there'],
  status: ['just here VIBing', 'just here VIBing', 'i was here the whole time'],
  laugh: ['lmao', 'lmao', 'bru'],
  insult: ['correct'],
  newChat: ['new chat means NEW chat'],
  thanks: ['okay', 'alright'],
  unknownQuestion: ['google it and pretend i knew it before', 'google it and hope'],
  unknownStatement: ['okay', 'lmao', 'what now']
};

function brahPick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function brahIntent(input) {
  const n = normalize(input);

  if (/^(hi|hello|hey|yo|sup|hello there)$/.test(n)) return 'greeting';
  if (/^(lmao+|lol+|lmfao+|haha+|hehe+)$/.test(n)) return 'laugh';
  if (/\b(how are you|hows it going|how is it going|how you doing|whats up|wassup)\b/.test(n)) return 'status';
  if (/\b(stupid|dumb|idiot|moron)\b/.test(n)) return 'insult';
  if (/\bnew chat\b/.test(n) && /\b(mean|means|what|explain|does)\b/.test(n)) return 'newChat';
  if (/^(thanks|thank you|thx|ty)$/.test(n)) return 'thanks';
  return null;
}

function getBrahReply(input) {
  if (/random number.*1.*100/i.test(input)) return String(Math.floor(Math.random() * 100) + 1);

  const math = simpleMath(input);
  if (math !== null) return math;

  const intent = brahIntent(input);
  if (intent) return brahPick(BRAH_RESPONSES[intent]);

  const n = normalize(input);

  // Small semantic aliases for common ways people phrase the approved prompts.
  if (/\b(new chat)\b/.test(n)) return 'new chat means NEW chat';
  if (/\b(code|coding|program)\b/.test(n) && /\b(error|broken|doesnt work|not work|fix)\b/.test(n)) return 'read the error message';
  if (/\b(write|make|generate)\b/.test(n) && /\b(code|coding|program)\b/.test(n)) return 'bru idk how to write code, use a different model or some shi';
  if (/\bbye\b|\bgoodbye\b|\bcya\b/.test(n)) return 'cya';
  if (/\bpurpose\b/.test(n)) return 'none lmao im just here to VIBe';
  if (/\bfavorite food\b/.test(n)) return 'crepe';
  if (/\bmeaning of life\b/.test(n)) return 'crepe';
  if (/\bgeometry dash\b/.test(n) && /\b(what|explain|describe)\b/.test(n)) return 'square jumps over triangle.';
  if (/\bminecraft\b/.test(n) && /\b(what|explain|describe)\b/.test(n)) return 'its right there in the name... you MINE and you CRAFT. i guess theres also exploring and surviving and building, but still...';

  // Use the original approved answer only when the match is actually convincing.
  const match = bestSparkMatch(input);
  if (match.winner && match.score >= 0.42) {
    if (match.winner[1] === '__RANDOM_1_100__') return String(Math.floor(Math.random() * 100) + 1);
    return match.winner[1];
  }

  // Medium-confidence matches can use Ember, but only when there is real overlap.
  // No overlap = no semantic roulette.
  if (match.winner && match.score >= 0.22) return getEmberReply(input);

  const looksLikeQuestion = /\?$/.test(input.trim()) || /^(what|why|how|who|where|when|is|are|can|could|would|should|do|does|did)\b/i.test(input.trim());
  return brahPick(looksLikeQuestion ? BRAH_RESPONSES.unknownQuestion : BRAH_RESPONSES.unknownStatement);
}

// Add Brah to the picker without requiring the old models to change.
if (!modelPicker.querySelector('option[value="brah"]')) {
  const option = document.createElement('option');
  option.value = 'brah';
  option.textContent = 'Brah';
  modelPicker.insertBefore(option, modelPicker.firstChild);
}

// Preserve the old model engine for Brick/Spark/Ember.
const preBrahGetModelReply = getModelReply;
getModelReply = function(input, model) {
  if (model === 'brah') return getBrahReply(input);
  return preBrahGetModelReply(input, model);
};

// From now on, Brah is a valid model and the default for newly created chats.
validModel = function(model) {
  return ['brah', 'ember', 'spark', 'brick'].includes(model) ? model : 'brah';
};

createChatObject = function(model = 'brah') {
  return { id: makeId(), title: 'New conversation', model: validModel(model), messages: [] };
};

// app.js loaded old saved chats before Brah existed, so restore any saved Brah
// selections that the older validModel() temporarily interpreted as Ember.
try {
  const rawChats = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (Array.isArray(rawChats)) {
    for (const chat of chats) {
      const raw = rawChats.find(item => item && item.id === chat.id);
      if (raw?.model === 'brah') chat.model = 'brah';
    }
  }
} catch {}

// If this is a totally fresh/empty chat, upgrade its default from Ember to Brah.
if (chats.length === 1 && chats[0].messages.length === 0 && chats[0].title === 'New conversation' && chats[0].model === 'ember') {
  chats[0].model = 'brah';
}

// Replace the existing New Chat listener so future chats default to Brah.
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

// Make deleting the final chat create a fresh Brah chat too.
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