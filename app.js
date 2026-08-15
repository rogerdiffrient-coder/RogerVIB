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
const SPARK_REPLY = 'bru i have no brain what do you expect from me';

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

function getModelReply() {
  if (modelPicker.value === 'brick') return BRICK_REPLY;
  return SPARK_REPLY;
}

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  addMessage(text, 'user');
  updateChatTitle(text);
  messageInput.value = '';
  resizeInput();

  window.setTimeout(() => addMessage(getModelReply(), 'bot'), 250);
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

messageInput.focus();
resizeInput();
