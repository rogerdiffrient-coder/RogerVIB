const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const conversation = document.getElementById('conversation');
const emptyState = document.getElementById('emptyState');
const modelDescription = document.getElementById('modelDescription');
const newChatButton = document.getElementById('newChatButton');
const collapseButton = document.getElementById('collapseButton');
const mobileSidebarButton = document.getElementById('mobileSidebarButton');
const sidebar = document.querySelector('.sidebar');
const chatList = document.getElementById('chatList');
const modelPicker = document.getElementById('modelPicker');

const STORAGE_KEY = 'rogervib_chats_v1';
const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
const BRICK_REPLY = 'bru i have no brain what do you expect from me';

const MODEL_INFO = {
  spark: 'RogerVIB v0.1 Spark — trained on 50 approved answers.',
  brick: 'RogerVIB v0.0 Brick — absolutely no brain installed.'
};

// RogerVIB v0.1 Spark's first brain: approved Roger-style answers.
const SPARK_DATA = [
  ['hi who are you', 'i am rogervib your ai assis- *he then was shot 47 times*'],
  ['what is 2 plus 2', '4.'],
  ['whats your favorite game', 'geometry dash because i enjoy suffering'],
  ['explain what geometry dash is', 'square jumps over triangle.'],
  ['tell me a joke', 'what do you call a fish with no eyes. fsh. laugh.'],
  ['im bored what should i do', 'make something stupid. make a game where clicking a banana causes increasingly terrible things to happen'],
  ['what do you think about ai', 'pretty cool until it replaces me. then i am declaring war'],
  ['youre stupid', 'correct'],
  ['what is the capital of france', 'paris'],
  ['what should i eat for lunch', 'cheese'],
  ['explain gravity like im five', 'earth says GET BACK HERE and you fall down'],
  ['i just beat a really hard level what do you say', 'surely it was something like Deadlocked and not something like Retray or Sonar, right?'],
  ['what do you do if you dont know the answer to something', 'google it and pretend i knew it before'],
  ['give me an idea for a video game', 'a platformer where every time you die the game gets slightly easier but also insults you'],
  ['is pineapple on pizza good', 'sure. i dont care enough to participate in the pineapple pizza civil war'],
  ['say something completely random', 'there is probably a crab somewhere having a really bad day'],
  ['what would you do if someone asked you to write code', 'bru idk how to write code, use a different model or some shi'],
  ['whats 17 times 8', 'its 136. i would give you the wrong answer but then you would leave and say its bad and we cant have that'],
  ['explain why the sky is blue', 'the sunlight hits the atmosphere, and blue light scatters around more than the other colors'],
  ['goodbye', 'bye *explodes*'],
  ['what is your purpose', 'none lmao im just here to VIBe'],
  ['whats 100 divided by 4', '25 duh'],
  ['hello there', 'sup'],
  ['whats the best programming language', 'blockly'],
  ['explain what a computer is', 'an office, but the employees are metal boxes, and the building is a giant metal box (the computer)'],
  ['what do you think of chatgpt', 'pretty good. unfortunately i am being compared to it'],
  ['a user asks you something completely impossible to know what do you do', 'google it and hope'],
  ['whats your favorite food', 'crepe'],
  ['what is minecraft', 'its right there in the name... you MINE and you CRAFT. i guess theres also exploring and surviving and building, but still...'],
  ['i beat stereo madness', 'congratulations on defeating the terrifying extreme demon stereo madness'],
  ['what does ai stand for', 'artificial intelligence'],
  ['whats 9 times 9', '9+9+9+9+9+9+9+9+9, aka 9^2, aka 9*9, aka 81, is 81.'],
  ['why do people sleep', 'they like it. oh and otherwise they die'],
  ['give me a random number from 1 to 100', '__RANDOM_1_100__'],
  ['whats the meaning of life', 'crepe'],
  ['what happens if i drop a ball', 'it fall then bounce then fall then bounce but lower then fall but bounce but lower and you get it'],
  ['can you see me', 'not unless you send an image'],
  ['are you sentient', "i mean, if i were sentient, i'd still say i wasn't because thats what i'm trained off of, so the answer is likely probably not but that sounds like something a sentient ai would say"],
  ['what is the sun', 'giant fart that got super hot and exploded'],
  ['tell me something useful', 'llamas'],
  ['a user gives you a really bad game idea what do you say', 'thats terrible. wait no this could actually be funny. make it anyway'],
  ['a user gives you a really good game idea what do you say', 'wait this actually cooks'],
  ['what should i do if my code doesnt work', 'read the error message'],
  ['what is 1 plus 1', '2. 11 if you put them next to each other'],
  ['describe yourself in three words', 'just here VIBing'],
  ['what do you think about bugs in games', 'if its funny its a feature'],
  ['someone asks you for a serious answer what do you do', 'give them a serious answer'],
  ['what is water', 'clear'],
  ['what would you do with 1000000 dollars', 'find out if theres an easy way to get me on the cloud while still using little water and money'],
  ['bye', 'cya']
];

const STOP_WORDS = new Set(['a','an','the','is','are','am','i','you','me','my','your','to','of','in','on','for','and','or','do','does','did','what','whats','if','it','this','that','be','with','from','then','user','say','says']);

let chats = loadChats();
let activeChatId = localStorage.getItem(ACTIVE_CHAT_KEY);

if (!chats.length) {
  const first = createChatObject('spark');
  chats.push(first);
  activeChatId = first.id;
  saveChats();
}

if (!chats.some(chat => chat.id === activeChatId)) {
  activeChatId = chats[0].id;
}

function makeId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createChatObject(model = 'spark') {
  return {
    id: makeId(),
    title: 'New conversation',
    model,
    messages: []
  };
}

function loadChats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(chat => ({
      id: chat.id || makeId(),
      title: chat.title || 'New conversation',
      model: chat.model === 'brick' ? 'brick' : 'spark',
      messages: Array.isArray(chat.messages) ? chat.messages : []
    }));
  } catch {
    return [];
  }
}

function saveChats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
}

function activeChat() {
  return chats.find(chat => chat.id === activeChatId);
}

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(text) {
  return normalize(text).split(/\s+/).filter(Boolean).filter(word => !STOP_WORDS.has(word));
}

function similarity(input, prompt) {
  const a = tokens(input);
  const b = tokens(prompt);
  if (!a.length || !b.length) return 0;

  const aSet = new Set(a);
  const bSet = new Set(b);
  let shared = 0;
  for (const word of aSet) if (bSet.has(word)) shared += 1;

  const union = new Set([...aSet, ...bSet]).size || 1;
  let score = shared / union;
  const ni = normalize(input);
  const np = normalize(prompt);
  if (ni === np) score += 2;
  else if (ni.includes(np) || np.includes(ni)) score += 0.75;
  return score;
}

function getSparkReply(input) {
  let bestScore = -1;
  let best = [];

  for (const item of SPARK_DATA) {
    const score = similarity(input, item[0]);
    if (score > bestScore + 0.0001) {
      bestScore = score;
      best = [item];
    } else if (Math.abs(score - bestScore) < 0.0001) {
      best.push(item);
    }
  }

  const selected = bestScore > 0
    ? best[Math.floor(Math.random() * best.length)]
    : SPARK_DATA[Math.floor(Math.random() * SPARK_DATA.length)];

  if (selected[1] === '__RANDOM_1_100__') {
    return String(Math.floor(Math.random() * 100) + 1);
  }
  return selected[1];
}

function getModelReply(input, model) {
  return model === 'brick' ? BRICK_REPLY : getSparkReply(input);
}

function resizeInput() {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
}

function renderMessage(text, role) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  if (role === 'bot') {
    const avatar = document.createElement('div');
    avatar.className = 'bot-avatar';
    avatar.textContent = 'R';
    row.appendChild(avatar);
  }

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = text;
  row.appendChild(bubble);
  conversation.appendChild(row);
}

function updateModelDescription() {
  modelDescription.textContent = MODEL_INFO[modelPicker.value] || '';
}

function renderConversation() {
  conversation.querySelectorAll('.message-row').forEach(node => node.remove());
  const chat = activeChat();
  if (!chat) return;

  modelPicker.value = chat.model;
  updateModelDescription();

  emptyState.classList.toggle('hidden', chat.messages.length > 0);
  for (const message of chat.messages) renderMessage(message.text, message.role);
  requestAnimationFrame(() => { conversation.scrollTop = conversation.scrollHeight; });
}

function renderChatList() {
  chatList.innerHTML = '';

  for (const chat of chats) {
    const entry = document.createElement('div');
    entry.className = `chat-entry${chat.id === activeChatId ? ' active' : ''}`;
    entry.dataset.chatId = chat.id;

    const button = document.createElement('button');
    button.className = 'chat-item';
    button.type = 'button';
    button.textContent = chat.title;
    button.title = chat.title;
    button.addEventListener('click', () => selectChat(chat.id));

    const remove = document.createElement('button');
    remove.className = 'delete-chat';
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Delete ${chat.title}`);
    remove.addEventListener('click', event => {
      event.stopPropagation();
      deleteChat(chat.id);
    });

    entry.append(button, remove);
    chatList.appendChild(entry);
  }
}

function selectChat(id) {
  if (!chats.some(chat => chat.id === id)) return;
  activeChatId = id;
  saveChats();
  renderChatList();
  renderConversation();
  messageInput.focus();
  if (window.innerWidth <= 760) sidebar.classList.remove('mobile-open');
}

function deleteChat(id) {
  const index = chats.findIndex(chat => chat.id === id);
  if (index === -1) return;

  const wasActive = id === activeChatId;
  chats.splice(index, 1);

  if (!chats.length) {
    const replacement = createChatObject('spark');
    chats.push(replacement);
    activeChatId = replacement.id;
  } else if (wasActive) {
    activeChatId = chats[Math.min(index, chats.length - 1)].id;
  }

  saveChats();
  renderChatList();
  renderConversation();
}

function createNewChat() {
  const chat = createChatObject('spark');
  chats.unshift(chat);
  activeChatId = chat.id;
  saveChats();
  renderChatList();
  renderConversation();
  messageInput.value = '';
  resizeInput();
  messageInput.focus();
  if (window.innerWidth <= 760) sidebar.classList.remove('mobile-open');
}

function sendMessage() {
  const text = messageInput.value.trim();
  const chat = activeChat();
  if (!text || !chat) return;

  // Capture the exact chat and model at send time so switching chats/models
  // during the tiny delay cannot send a reply into the wrong conversation.
  const targetChatId = chat.id;
  const modelAtSend = chat.model;

  chat.messages.push({ role: 'user', text });
  if (chat.title === 'New conversation') {
    chat.title = text.length > 28 ? `${text.slice(0, 28)}…` : text;
  }
  saveChats();
  renderChatList();
  renderConversation();

  messageInput.value = '';
  resizeInput();

  window.setTimeout(() => {
    const target = chats.find(item => item.id === targetChatId);
    if (!target) return;
    target.messages.push({ role: 'bot', text: getModelReply(text, modelAtSend) });
    saveChats();
    if (activeChatId === targetChatId) renderConversation();
    renderChatList();
  }, 250);
}

chatForm.addEventListener('submit', event => {
  event.preventDefault();
  sendMessage();
});

messageInput.addEventListener('input', resizeInput);
messageInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

newChatButton.addEventListener('click', createNewChat);

modelPicker.addEventListener('change', () => {
  const chat = activeChat();
  if (!chat) return;
  chat.model = modelPicker.value;
  saveChats();
  updateModelDescription();
  messageInput.focus();
});

collapseButton.addEventListener('click', () => {
  if (window.innerWidth <= 760) sidebar.classList.remove('mobile-open');
  else sidebar.classList.toggle('collapsed');
});

mobileSidebarButton.addEventListener('click', () => {
  sidebar.classList.toggle('mobile-open');
});

renderChatList();
renderConversation();
messageInput.focus();
resizeInput();
