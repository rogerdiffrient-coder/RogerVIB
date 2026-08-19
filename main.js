// RogerVIB shared app/UI layer.
// AI responses are provided by a local Ollama server.

(() => {
  const STORAGE_KEY = 'rogervib_chats_v1';
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
  const OLLAMA_BASE_URL = 'http://localhost:11434';

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
    const sendButton = document.getElementById('sendButton');

    let availableModels = [];
    let copyFeedbackTimer = null;
    let isSending = false;

    function makeId() {
      if (window.crypto?.randomUUID) return window.crypto.randomUUID();
      return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function createChatObject(model = '') {
      return { id: makeId(), title: 'New conversation', model, messages: [] };
    }

    function loadChats() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed.map(chat => ({
          id: chat.id || makeId(),
          title: chat.title || 'New conversation',
          model: typeof chat.model === 'string' ? chat.model : '',
          messages: Array.isArray(chat.messages) ? chat.messages : []
        }));
      } catch {
        return [];
      }
    }

    let chats = loadChats();
    let activeChatId = localStorage.getItem(ACTIVE_CHAT_KEY);

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

    function currentModel() {
      const chat = activeChat();
      if (chat?.model && availableModels.includes(chat.model)) return chat.model;
      return modelPicker.value || availableModels[0] || '';
    }

    function setConnectionMessage(text) {
      modelDescription.textContent = text;
    }

    async function loadOllamaModels() {
      modelPicker.disabled = true;
      modelPicker.innerHTML = '<option>Connecting to Ollama…</option>';
      setConnectionMessage(`Connecting to Ollama at ${OLLAMA_BASE_URL}…`);

      try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
        if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);

        const data = await response.json();
        availableModels = Array.isArray(data.models)
          ? data.models.map(item => item.name || item.model).filter(Boolean)
          : [];

        modelPicker.innerHTML = '';

        if (!availableModels.length) {
          const option = document.createElement('option');
          option.textContent = 'No Ollama models installed';
          option.value = '';
          modelPicker.appendChild(option);
          setConnectionMessage('Ollama is running, but there are no installed models yet.');
          return;
        }

        for (const modelName of availableModels) {
          const option = document.createElement('option');
          option.value = modelName;
          option.textContent = modelName;
          modelPicker.appendChild(option);
        }

        const chat = activeChat();
        if (!chat.model || !availableModels.includes(chat.model)) chat.model = availableModels[0];
        modelPicker.value = chat.model;
        modelPicker.disabled = false;
        setConnectionMessage(`Connected to Ollama • ${availableModels.length} model${availableModels.length === 1 ? '' : 's'} available`);
        saveChats();
      } catch (error) {
        console.error('Could not connect to Ollama:', error);
        availableModels = [];
        modelPicker.innerHTML = '<option value="">Ollama unavailable</option>';
        modelPicker.disabled = true;
        setConnectionMessage('Could not reach Ollama on localhost:11434. Make sure Ollama is running and this page origin is allowed by Ollama.');
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

    function renderConversation() {
      conversation.querySelectorAll('.message-row').forEach(node => node.remove());
      const chat = activeChat();
      if (!chat) return;

      if (availableModels.length) {
        if (!availableModels.includes(chat.model)) chat.model = availableModels[0];
        modelPicker.value = chat.model;
      }

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
        const replacement = createChatObject(availableModels[0] || '');
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
      const chat = createChatObject(currentModel());
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

    function ollamaMessages(chat) {
      return chat.messages.map(message => ({
        role: message.role === 'bot' ? 'assistant' : 'user',
        content: String(message.text)
      }));
    }

    async function askOllama(chat, model) {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: ollamaMessages(chat),
          stream: false
        })
      });

      if (!response.ok) {
        let detail = '';
        try {
          const errorBody = await response.json();
          detail = errorBody?.error ? `: ${errorBody.error}` : '';
        } catch {}
        throw new Error(`Ollama returned HTTP ${response.status}${detail}`);
      }

      const data = await response.json();
      const text = data?.message?.content;
      if (typeof text !== 'string' || !text.trim()) throw new Error('Ollama returned an empty response');
      return text;
    }

    async function sendMessage() {
      const text = messageInput.value.trim();
      const chat = activeChat();
      const model = currentModel();
      if (!text || !chat || isSending) return;

      if (!model) {
        setConnectionMessage('No Ollama model is available. Start Ollama and install a model first.');
        return;
      }

      const targetChatId = chat.id;
      chat.model = model;
      chat.messages.push({ role: 'user', text });
      if (chat.title === 'New conversation') chat.title = text.length > 28 ? `${text.slice(0, 28)}…` : text;

      saveChats();
      renderChatList();
      renderConversation();
      messageInput.value = '';
      resizeInput();

      isSending = true;
      sendButton.disabled = true;
      modelPicker.disabled = true;
      setConnectionMessage(`Thinking with ${model}…`);

      try {
        const target = chats.find(item => item.id === targetChatId);
        if (!target) return;
        const reply = await askOllama(target, model);
        target.messages.push({ role: 'bot', text: reply });
        saveChats();
      } catch (error) {
        console.error('Ollama chat failed:', error);
        const target = chats.find(item => item.id === targetChatId);
        if (target) {
          target.messages.push({
            role: 'bot',
            text: `Ollama error: ${error.message}. Make sure Ollama is running and this page is allowed to connect to localhost:11434.`
          });
          saveChats();
        }
      } finally {
        isSending = false;
        sendButton.disabled = false;
        modelPicker.disabled = !availableModels.length;
        setConnectionMessage(availableModels.length
          ? `Connected to Ollama • using ${currentModel()}`
          : 'Ollama is unavailable.');
        if (activeChatId === targetChatId) renderConversation();
        renderChatList();
        messageInput.focus();
      }
    }

    renderChatList();
    renderConversation();
    loadOllamaModels().then(() => {
      renderConversation();
      renderChatList();
    });

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
      if (!chat || !modelPicker.value) return;
      chat.model = modelPicker.value;
      saveChats();
      setConnectionMessage(`Connected to Ollama • using ${chat.model}`);
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
