// RogerVIB shared app/UI layer.
// Every AI model shown in RogerVIB comes from Ollama, with selected Ollama cloud models pinned into the picker.
// RogerVIB supplies tools, widgets, and UI only — no custom AI models.

(() => {
  const STORAGE_KEY = 'rogervib_chats_v1';
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
  const OLLAMA_BASE_URL = 'http://localhost:11434';
  const MAX_TOOL_ROUNDS = 8;
  const PINNED_MODELS = ['minimax-m3:cloud'];

  const SYSTEM_PROMPT = `You are RogerVIB, running through an Ollama model.

You have native tools and safe widgets supplied by RogerVIB. Use them correctly instead of pretending to use them.

TOOL RULES:
- calculator: Use it for arithmetic, numeric expressions, or whenever exact calculation matters. Do not guess arithmetic when the calculator can answer it.
- web_search: Use it when the user explicitly asks you to search, look up, verify, or find current information; when facts may have changed recently; or when you are unsure of a factual claim. Never claim you searched unless you actually called web_search.
- show_calculator_widget: Use after calculator when a visual calculator card would improve the answer.
- show_markdown_widget: Use for longer structured notes, guides, or document-like content.
- show_game_widget: Use to present supported games as interactive inline UI.
- game_engine: Use for deterministic game rules/state when supported instead of inventing outcomes.
- Read tool results before answering. If a tool fails, say what failed rather than inventing a result.
- You may call more than one tool and may call tools again after seeing results.
- Do not expose raw tool-call JSON unless the user specifically asks for technical debugging details.

Answer naturally and directly after using any needed tools.`;

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

    function normalizeStoredMessage(message) {
      if (!message || typeof message !== 'object') return null;
      const role = message.role === 'bot' ? 'bot' : 'user';
      return {
        role,
        text: String(message.text ?? ''),
        thinking: role === 'bot' && typeof message.thinking === 'string' ? message.thinking : ''
      };
    }

    function loadChats() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed.map(chat => ({
          id: chat.id || makeId(),
          title: chat.title || 'New conversation',
          model: typeof chat.model === 'string' ? chat.model : '',
          messages: Array.isArray(chat.messages) ? chat.messages.map(normalizeStoredMessage).filter(Boolean) : []
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

    function mergeModelLists(detected) {
      const seen = new Set();
      return [...PINNED_MODELS, ...detected].filter(name => {
        const value = String(name || '').trim();
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
      });
    }

    async function loadOllamaModels() {
      modelPicker.disabled = true;
      modelPicker.innerHTML = '<option>Connecting to Ollama…</option>';
      setConnectionMessage(`Connecting to Ollama at ${OLLAMA_BASE_URL}…`);

      let detected = [];
      let connected = false;
      try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
        const data = await response.json();
        detected = Array.isArray(data.models)
          ? data.models.map(item => item.name || item.model).filter(Boolean)
          : [];
        connected = true;
      } catch (error) {
        console.warn('Could not load local Ollama tags; keeping pinned cloud models available:', error);
      }

      availableModels = mergeModelLists(detected);
      modelPicker.innerHTML = '';

      if (!availableModels.length) {
        modelPicker.innerHTML = '<option value="">No Ollama models available</option>';
        setConnectionMessage('No Ollama models are available.');
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
      setConnectionMessage(connected
        ? `Connected to Ollama • ${availableModels.length} model${availableModels.length === 1 ? '' : 's'} available • tools + thinking enabled`
        : `Ollama tags unavailable • pinned cloud model available • tools + thinking enabled`);
      saveChats();
    }

    function resizeInput() {
      messageInput.style.height = 'auto';
      messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
    }

    function renderThinkingBlock(thinking) {
      const text = String(thinking || '').trim();
      if (!text) return null;
      const details = document.createElement('details');
      details.className = 'thinking-block';
      const summary = document.createElement('summary');
      summary.textContent = 'Thinking';
      const body = document.createElement('div');
      body.className = 'thinking-content';
      body.textContent = text;
      details.append(summary, body);
      return details;
    }

    function renderMessage(message) {
      const role = message.role;
      const row = document.createElement('div');
      row.className = `message-row ${role}`;
      if (role === 'bot') {
        const avatar = document.createElement('div');
        avatar.className = 'bot-avatar';
        avatar.textContent = 'R';
        row.appendChild(avatar);
      }
      const stack = document.createElement('div');
      stack.className = 'message-stack';
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      bubble.textContent = message.text;
      stack.appendChild(bubble);
      if (role === 'bot') {
        const thinking = renderThinkingBlock(message.thinking);
        if (thinking) stack.appendChild(thinking);
      }
      row.appendChild(stack);
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
      for (const message of chat.messages) renderMessage(message);
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

    function conversationForOllama(chat) {
      return [
        { role: 'system', content: SYSTEM_PROMPT },
        ...chat.messages.map(message => ({
          role: message.role === 'bot' ? 'assistant' : 'user',
          content: String(message.text)
        }))
      ];
    }

    async function ollamaChat(model, messages, tools, enableThinking = true) {
      const requestBody = { model, messages, tools, stream: false };
      if (enableThinking) requestBody.think = true;

      let response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      // Some models do not accept an explicit `think` value. Retry once without it.
      if (!response.ok && enableThinking && response.status >= 400 && response.status < 500) {
        response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, tools, stream: false })
        });
      }

      if (!response.ok) {
        let detail = '';
        try {
          const errorBody = await response.json();
          detail = errorBody?.error ? `: ${errorBody.error}` : '';
        } catch {}
        throw new Error(`Ollama returned HTTP ${response.status}${detail}`);
      }

      return response.json();
    }

    async function askOllama(chat, model) {
      const tools = window.RogerVIBTools?.schemas?.() || [];
      const messages = conversationForOllama(chat);
      const thinkingParts = [];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const data = await ollamaChat(model, messages, tools, true);
        const assistantMessage = data?.message;
        if (!assistantMessage) throw new Error('Ollama returned no message');

        const roundThinking = String(assistantMessage.thinking || '').trim();
        if (roundThinking) thinkingParts.push(roundThinking);

        const toolCalls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : [];
        if (!toolCalls.length) {
          const text = String(assistantMessage.content || '').trim();
          if (!text) throw new Error('Ollama returned an empty response');
          return { text, thinking: thinkingParts.join('\n\n') };
        }

        const assistantHistoryMessage = {
          role: 'assistant',
          content: String(assistantMessage.content || ''),
          tool_calls: toolCalls
        };
        if (assistantMessage.thinking) assistantHistoryMessage.thinking = String(assistantMessage.thinking);
        messages.push(assistantHistoryMessage);

        for (const call of toolCalls) {
          const name = call?.function?.name;
          const args = call?.function?.arguments || {};
          const result = await window.RogerVIBTools.run(name, args);
          messages.push({
            role: 'tool',
            tool_name: String(name || 'unknown_tool'),
            content: JSON.stringify(result)
          });
        }
      }

      throw new Error(`tool loop exceeded ${MAX_TOOL_ROUNDS} rounds`);
    }

    async function sendMessage() {
      const text = messageInput.value.trim();
      const chat = activeChat();
      const model = currentModel();
      if (!text || !chat || isSending) return;

      if (!model) {
        setConnectionMessage('No Ollama model is available. Start Ollama or select a pinned Ollama cloud model.');
        return;
      }

      const targetChatId = chat.id;
      chat.model = model;
      chat.messages.push({ role: 'user', text, thinking: '' });
      if (chat.title === 'New conversation') chat.title = text.length > 28 ? `${text.slice(0, 28)}…` : text;

      saveChats();
      renderChatList();
      renderConversation();
      messageInput.value = '';
      resizeInput();

      isSending = true;
      sendButton.disabled = true;
      modelPicker.disabled = true;
      setConnectionMessage(`Thinking with ${model} • tools + widgets available…`);

      try {
        const target = chats.find(item => item.id === targetChatId);
        if (!target) return;
        const reply = await askOllama(target, model);
        target.messages.push({ role: 'bot', text: reply.text, thinking: reply.thinking || '' });
        saveChats();
      } catch (error) {
        console.error('Ollama chat failed:', error);
        const target = chats.find(item => item.id === targetChatId);
        if (target) {
          target.messages.push({
            role: 'bot',
            text: `Ollama error: ${error.message}. Make sure Ollama is running, the selected model is available, and this page is allowed to connect to localhost:11434.`,
            thinking: ''
          });
          saveChats();
        }
      } finally {
        isSending = false;
        sendButton.disabled = false;
        modelPicker.disabled = !availableModels.length;
        setConnectionMessage(availableModels.length
          ? `Connected to Ollama • using ${currentModel()} • ${window.RogerVIBTools?.registry?.size || 0} tools • thinking supported`
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
      setConnectionMessage(`Connected to Ollama • using ${chat.model} • ${window.RogerVIBTools?.registry?.size || 0} tools • thinking supported`);
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
