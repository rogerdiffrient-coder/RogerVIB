const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const conversation = document.getElementById('conversation');
const emptyState = document.getElementById('emptyState');
const newChatButton = document.getElementById('newChatButton');
const collapseButton = document.getElementById('collapseButton');
const mobileSidebarButton = document.getElementById('mobileSidebarButton');
const sidebar = document.querySelector('.sidebar');
const chatList = document.getElementById('chatList');
const modelPicker = document.getElementById('modelPicker');

const BRICK_REPLY = 'bru i have no brain what do you expect from me';

// RogerVIB v0.1 Spark's first brain: approved Roger-style answers.
// Spark is deliberately tiny right now. It matches a message to the closest
// training prompt and answers using only this response set.
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

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(text) {
  return normalize(text)
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word));
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

  // With only 50 examples, totally unfamiliar prompts are intentionally chaotic.
  const selected = bestScore > 0 ? best[Math.floor(Math.random() * best.length)] : SPARK_DATA[Math.floor(Math.random() * SPARK_DATA.length)];
  const response = selected[1];

  if (response === '__RANDOM_1_100__') {
    return String(Math.floor(Math.random() * 100) + 1);
  }
  return response;
}

function resizeInput() {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
}

function addMessage(text, role) {
  emptyState.classList.add('hidden');

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
  conversation.scrollTop = conversation.scrollHeight;
}

function updateChatTitle(message) {
  const active = chatList.querySelector('.chat-item.active');
  if (!active || active.dataset.named === 'true') return;
  active.textContent = message.length > 28 ? `${message.slice(0, 28)}…` : message;
  active.dataset.named = 'true';
}

function getModelReply(input) {
  if (modelPicker.value === 'brick') return BRICK_REPLY;
  return getSparkReply(input);
}

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  addMessage(text, 'user');
  updateChatTitle(text);
  messageInput.value = '';
  resizeInput();

  window.setTimeout(() => addMessage(getModelReply(text), 'bot'), 250);
}

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage();
});

messageInput.addEventListener('input', resizeInput);
messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

newChatButton.addEventListener('click', () => {
  conversation.querySelectorAll('.message-row').forEach((message) => message.remove());
  emptyState.classList.remove('hidden');
  messageInput.value = '';
  resizeInput();

  chatList.querySelectorAll('.chat-item').forEach((item) => item.classList.remove('active'));
  const item = document.createElement('button');
  item.className = 'chat-item active';
  item.textContent = 'New conversation';
  chatList.prepend(item);
  messageInput.focus();

  if (window.innerWidth <= 760) sidebar.classList.remove('mobile-open');
});

collapseButton.addEventListener('click', () => {
  if (window.innerWidth <= 760) {
    sidebar.classList.remove('mobile-open');
  } else {
    sidebar.classList.toggle('collapsed');
  }
});

mobileSidebarButton.addEventListener('click', () => {
  sidebar.classList.toggle('mobile-open');
});

modelPicker.addEventListener('change', () => messageInput.focus());
messageInput.focus();
resizeInput();
