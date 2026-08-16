// RogerVIB shared app/UI layer.
// Models live in /models and register themselves with RogerVIB.registerModel().

(() => {
  const STORAGE_KEY = 'rogervib_chats_v1';
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
  const DEFAULT_MODEL = 'cool';
  const models = new Map();

  function normalize(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function simpleMath(input) {
    const cleaned = String(input).trim().replace(/[×x]/gi, '*').replace(/÷/g, '/');
    const match = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*([+\-*\/])\s*(-?\d+(?:\.\d+)?)\??$/);
    if (!match) return null;
    const a = Number(match[1]);
    const b = Number(match[3]);
    let result;
    if (match[2] === '+') result = a + b;
    if (match[2] === '-') result = a - b;
    if (match[2] === '*') result = a * b;
    if (match[2] === '/') {
      if (b === 0) return 'no. you cannot divide by zero and escape the consequences';
      result = a / b;
    }
    if (!Number.isFinite(result)) return null;
    return String(Number.isInteger(result) ? result : Number(result.toFixed(8)));
  }

  function registerModel(model) {
    if (!model?.id || typeof model.reply !== 'function') throw new Error('Invalid RogerVIB model');
    models.set(model.id, model);
  }

  function getModel(id) {
    return models.get(id) || models.get(DEFAULT_MODEL) || [...models.values()][0];
  }

  window.RogerVIB = {
    registerModel,
    getModel,
    models,
    normalize,
    simpleMath,
    random(list) { return list[Math.floor(Math.random() * list.length)]; }
  };

  window.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chatForm');
    const messageInput = document.getElementById('messageInput');
    const conversation = document.getElementById('conversation');
    const emptyState = document.getElementById('emptyState');
    const modelDescription = document.getElementById('modelDescription');
    const newChatButton = document.getElementById('newChatButton');
    const copyChatButton = document.getElementById('copyChatButton');
    const collapseButton = document.getElementById('collapseButton');
    const mobileSidebarButton = document.getElementById('mobileSidebarButton');
    const sidebar = document.querySelector('.sidebar');
    const chatList = document.getElementById('chatList');
    const modelPicker = document.getElementById('modelPicker');

    function makeId() {
      if (window.crypto?.randomUUID) return window.crypto.randomUUID();
      return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function validModel(id) {
      return models.has(id) ? id : (models.has(DEFAULT_MODEL) ? DEFAULT_MODEL : [...models.keys()][0]);
    }

    function createChatObject(model = DEFAULT_MODEL) {
      return { id: makeId(), title: 'New conversation', model: validModel(model), messages: [] };
    }

    function loadChats() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed.map(chat => ({
          id: chat.id || makeId(),
          title: chat.title || 'New conversation',
          model: validModel(chat.model),
          messages: Array.isArray(chat.messages) ? chat.messages : []
        }));
      } catch {
        return [];
      }
    }

    let chats = loadChats();
    let activeChatId = localStorage.getItem(ACTIVE_CHAT_KEY);
    let copyFeedbackTimer = null;

    if (!chats.length) {
      const first = createChatObject();
      chats.push(first);
      activeChatId = first.id;
    }
    if (!chats.some(chat => chat.id === activeChatId)) activeChatId = chats[0].id;

    function saveChats() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
      localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
    }

    function activeChat() {
      return chats.find(chat => chat.id === activeChatId);
    }

    function buildModelPicker() {
      modelPicker.innerHTML = '';
      const ordered = [...models.values()].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
      for (const model of ordered) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        modelPicker.appendChild(option);
      }
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
      const model = getModel(modelPicker.value);
      modelDescription.textContent = model?.description || '';
    }

    function renderConversation() {
      conversation.querySelectorAll('.message-row').forEach(node => node.remove());
      const chat = activeChat();
      if (!chat) return;
      chat.model = validModel(chat.model);
      modelPicker.value = chat.model;
      updateModelDescription();
      emptyState.classList.toggle('hidden', chat.messages.length > 0);
      copyChatButton.disabled = chat.messages.length === 0;
      for (const message of chat.messages) renderMessage(message.text, message.role);
      requestAnimationFrame(() => { conversation.scrollTop = conversation.scrollHeight; });
    }

    function renderChatList() {
      chatList.innerHTML = '';
      for (const chat of chats) {
        const entry = document.createElement('div');
        entry.className = `chat-entry${chat.id === activeChatId ? ' active' : ''}`;

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
        const replacement = createChatObject();
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
      const chat = createChatObject();
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

    function transcriptFor(chat) {
      return chat.messages.map(message => {
        const speaker = message.role === 'user' ? 'User' : 'Bot';
        return `${speaker}:  ${String(message.text)}`;
      }).join('\n');
    }

    async function writeClipboard(text) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const fallback = document.createElement('textarea');
      fallback.value = text;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      fallback.select();
      const copied = document.execCommand('copy');
      fallback.remove();
      if (!copied) throw new Error('Clipboard copy failed');
    }

    function showCopyFeedback(label) {
      window.clearTimeout(copyFeedbackTimer);
      copyChatButton.textContent = label;
      copyFeedbackTimer = window.setTimeout(() => {
        copyChatButton.textContent = 'Copy Chat';
      }, 1400);
    }

    async function copyCurrentChat() {
      const chat = activeChat();
      if (!chat?.messages.length) {
        showCopyFeedback('Nothing to copy');
        return;
      }
      try {
        await writeClipboard(transcriptFor(chat));
        showCopyFeedback('Copied!');
      } catch (error) {
        console.error('Copy chat failed:', error);
        showCopyFeedback('Copy failed');
      }
    }

    async function sendMessage() {
      const text = messageInput.value.trim();
      const chat = activeChat();
      if (!text || !chat) return;

      const targetChatId = chat.id;
      const modelAtSend = chat.model;
      chat.messages.push({ role: 'user', text });
      if (chat.title === 'New conversation') chat.title = text.length > 28 ? `${text.slice(0, 28)}…` : text;
      saveChats();
      renderChatList();
      renderConversation();
      messageInput.value = '';
      resizeInput();

      window.setTimeout(async () => {
        const target = chats.find(item => item.id === targetChatId);
        if (!target) return;
        const model = getModel(modelAtSend);
        let reply = 'model missing. incredible.';
        try {
          reply = await model.reply(text, { chat: target, chats });
        } catch (error) {
          console.error(error);
          reply = 'my brain did a thing it was not supposed to do';
        }
        target.messages.push({ role: 'bot', text: String(reply) });
        saveChats();
        if (activeChatId === targetChatId) renderConversation();
        renderChatList();
      }, 250);
    }

    buildModelPicker();
    saveChats();
    renderChatList();
    renderConversation();

    chatForm.addEventListener('submit', event => { event.preventDefault(); sendMessage(); });
    messageInput.addEventListener('input', resizeInput);
    messageInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
    newChatButton.addEventListener('click', createNewChat);
    copyChatButton.addEventListener('click', copyCurrentChat);
    modelPicker.addEventListener('change', () => {
      const chat = activeChat();
      if (!chat) return;
      chat.model = validModel(modelPicker.value);
      saveChats();
      updateModelDescription();
      messageInput.focus();
    });
    collapseButton.addEventListener('click', () => {
      if (window.innerWidth <= 760) sidebar.classList.remove('mobile-open');
      else sidebar.classList.toggle('collapsed');
    });
    mobileSidebarButton.addEventListener('click', () => sidebar.classList.toggle('mobile-open'));

    messageInput.focus();
    resizeInput();
  });
})();
