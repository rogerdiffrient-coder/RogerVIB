// RogerVIB app/UI layer.
// Models come from Ollama. RogerVIB exposes exactly two tools: calculator + web_search.
(() => {
  const STORAGE_KEY = 'rogervib_chats_v1';
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
  const OLLAMA_BASE_URL = 'http://localhost:11434';
  const MAX_TOOL_ROUNDS = 8;
  const PINNED_MODELS = ['minimax-m3:cloud'];

  const SYSTEM_PROMPT = `You are RogerVIB, running through an Ollama model.

You have exactly two native tools:
- calculator: use for arithmetic, numeric expressions, or whenever exact calculation matters.
- web_search: use when the user explicitly asks you to search/look up/verify something, when information may be current, or when you are unsure of a factual claim. Never claim you searched unless you actually called web_search.

Read tool results before answering. If a tool fails, say what failed instead of inventing a result. You may call tools more than once if needed.

RogerVIB renders Markdown in normal chat, so use Markdown naturally when it improves readability. Do not output raw tool-call JSON unless the user explicitly asks for debugging details.`;

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

    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
    })[ch]);

    function inlineMarkdown(text) {
      return text
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
        .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');
    }

    function markdownToHtml(source) {
      const escaped = escapeHtml(source).replace(/\r\n?/g, '\n');
      const codeBlocks = [];
      const protectedText = escaped.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const token = `@@ROGERVIB_CODE_${codeBlocks.length}@@`;
        codeBlocks.push(`<pre><code${lang.trim() ? ` data-language="${lang.trim().replace(/[^a-zA-Z0-9_+.-]/g,'')}"` : ''}>${code.replace(/^\n|\n$/g,'')}</code></pre>`);
        return token;
      });

      const lines = protectedText.split('\n');
      const out = [];
      let listType = null;

      const closeList = () => {
        if (listType) {
          out.push(`</${listType}>`);
          listType = null;
        }
      };

      for (const rawLine of lines) {
        const line = rawLine;
        if (/^@@ROGERVIB_CODE_\d+@@$/.test(line.trim())) {
          closeList();
          out.push(line.trim());
          continue;
        }
        if (/^\s*---+\s*$/.test(line)) {
          closeList();
          out.push('<hr>');
          continue;
        }
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          closeList();
          const level = heading[1].length;
          out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
          continue;
        }
        const quote = line.match(/^>\s?(.*)$/);
        if (quote) {
          closeList();
          out.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
          continue;
        }
        const ul = line.match(/^\s*[-*]\s+(.+)$/);
        if (ul) {
          if (listType !== 'ul') { closeList(); listType = 'ul'; out.push('<ul>'); }
          out.push(`<li>${inlineMarkdown(ul[1])}</li>`);
          continue;
        }
        const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
        if (ol) {
          if (listType !== 'ol') { closeList(); listType = 'ol'; out.push('<ol>'); }
          out.push(`<li>${inlineMarkdown(ol[1])}</li>`);
          continue;
        }
        closeList();
        if (!line.trim()) out.push('');
        else out.push(`<p>${inlineMarkdown(line)}</p>`);
      }
      closeList();

      let html = out.join('\n');
      codeBlocks.forEach((block, i) => { html = html.replace(`@@ROGERVIB_CODE_${i}@@`, block); });
      return html;
    }

    function makeId() {
      if (window.crypto?.randomUUID) return window.crypto.randomUUID();
      return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function normalizeSegments(message, role) {
      if (role !== 'bot') return [];
      if (Array.isArray(message.segments)) {
        return message.segments
          .filter(part => part && (part.type === 'thinking' || part.type === 'text'))
          .map(part => ({ type:part.type, text:String(part.text || ''), round:Number(part.round) || 0 }))
          .filter(part => part.text);
      }
      const parts = [];
      if (typeof message.thinking === 'string' && message.thinking) parts.push({type:'thinking',text:message.thinking,round:0});
      if (typeof message.text === 'string' && message.text) parts.push({type:'text',text:message.text,round:0});
      return parts;
    }

    function normalizeStoredMessage(message) {
      if (!message || typeof message !== 'object') return null;
      const role = message.role === 'bot' ? 'bot' : 'user';
      return { role, text:String(message.text ?? ''), segments:normalizeSegments(message, role), streaming:false };
    }

    function createChatObject(model = '') { return { id:makeId(), title:'New conversation', model, messages:[] }; }

    function loadChats() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed.map(chat => ({
          id:chat.id || makeId(),
          title:chat.title || 'New conversation',
          model:typeof chat.model === 'string' ? chat.model : '',
          messages:Array.isArray(chat.messages) ? chat.messages.map(normalizeStoredMessage).filter(Boolean) : []
        }));
      } catch { return []; }
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
      const serializable = chats.map(chat => ({
        ...chat,
        messages:chat.messages.map(message => ({ role:message.role, text:message.text, segments:message.role === 'bot' ? message.segments : undefined }))
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
      localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
    }

    function activeChat() { return chats.find(chat => chat.id === activeChatId); }
    function currentModel() {
      const chat = activeChat();
      if (chat?.model && availableModels.includes(chat.model)) return chat.model;
      return modelPicker.value || availableModels[0] || '';
    }
    function setConnectionMessage(text) { modelDescription.textContent = text; }

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
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {cache:'no-store'});
        if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
        const data = await response.json();
        detected = Array.isArray(data.models) ? data.models.map(item => item.name || item.model).filter(Boolean) : [];
        connected = true;
      } catch (error) {
        console.warn('Could not load local Ollama tags; keeping pinned models available:', error);
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
      setConnectionMessage(connected ? `Connected to Ollama • 2 tools • live streaming + thinking` : 'Pinned Ollama model available • 2 tools');
      saveChats();
    }

    function resizeInput() {
      messageInput.style.height = 'auto';
      messageInput.style.height = `${Math.min(messageInput.scrollHeight,160)}px`;
    }

    function createThinkingBlock(text = '', live = false) {
      const details = document.createElement('details');
      details.className = 'thinking-block';
      if (live) { details.open = true; details.classList.add('thinking-live'); }
      const summary = document.createElement('summary');
      summary.textContent = live ? 'Thinking…' : 'Thinking';
      const body = document.createElement('div');
      body.className = 'thinking-content';
      body.textContent = text;
      details.append(summary, body);
      return {details,summary,body};
    }

    function setMarkdown(element, text) {
      element.classList.add('markdown');
      element.innerHTML = markdownToHtml(text);
    }

    function renderMessage(message) {
      const row = document.createElement('div');
      row.className = `message-row ${message.role}`;
      if (message.role === 'bot') {
        const avatar = document.createElement('div');
        avatar.className = 'bot-avatar';
        avatar.textContent = 'R';
        row.appendChild(avatar);
      }
      const stack = document.createElement('div');
      stack.className = 'message-stack';
      if (message.role === 'user') {
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        setMarkdown(bubble, message.text);
        stack.appendChild(bubble);
      } else {
        const parts = message.segments?.length ? message.segments : (message.text ? [{type:'text',text:message.text,round:0}] : []);
        for (const part of parts) {
          if (part.type === 'thinking') stack.appendChild(createThinkingBlock(part.text,false).details);
          else {
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            setMarkdown(bubble, part.text);
            stack.appendChild(bubble);
          }
        }
      }
      row.appendChild(stack);
      conversation.appendChild(row);
      return {row,stack};
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
        remove.addEventListener('click', event => { event.stopPropagation(); deleteChat(chat.id); });
        entry.append(button,remove);
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
      chats.splice(index,1);
      if (!chats.length) {
        const replacement = createChatObject(availableModels[0] || '');
        chats.push(replacement);
        activeChatId = replacement.id;
      } else if (wasActive) activeChatId = chats[Math.min(index,chats.length-1)].id;
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
      return chat.messages.map(message => `${message.role === 'user' ? 'User' : 'Bot'}:  ${String(message.text || '')}`).join('\n');
    }

    async function writeClipboard(text) {
      if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
      const fallback = document.createElement('textarea');
      fallback.value = text;
      fallback.setAttribute('readonly','');
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
      copyFeedbackTimer = window.setTimeout(() => { copyChatButton.textContent = 'Copy Chat'; },1400);
    }

    async function copyCurrentChat() {
      const chat = activeChat();
      if (!chat?.messages.length) return showCopyFeedback('Nothing to copy');
      try { await writeClipboard(transcriptFor(chat)); showCopyFeedback('Copied!'); }
      catch (error) { console.error(error); showCopyFeedback('Copy failed'); }
    }

    function conversationForOllama(chat) {
      return [
        {role:'system',content:SYSTEM_PROMPT},
        ...chat.messages.filter(message => !message.streaming).map(message => ({
          role:message.role === 'bot' ? 'assistant' : 'user',
          content:String(message.text || '')
        }))
      ];
    }

    function appendSegment(message, liveUi, type, delta, round) {
      if (!delta) return;
      let part = message.segments.at(-1);
      let node = liveUi.parts.at(-1);
      if (!part || part.type !== type || part.round !== round) {
        part = {type,text:'',round};
        message.segments.push(part);
        if (type === 'thinking') {
          const thinking = createThinkingBlock('',true);
          liveUi.stack.appendChild(thinking.details);
          node = {type,root:thinking.details,summary:thinking.summary,body:thinking.body,round};
        } else {
          const bubble = document.createElement('div');
          bubble.className = 'message-bubble live-message';
          liveUi.stack.appendChild(bubble);
          node = {type,root:bubble,body:bubble,round};
        }
        liveUi.parts.push(node);
      }
      part.text += delta;
      if (type === 'thinking') node.body.textContent = part.text;
      else setMarkdown(node.body,part.text);
      requestAnimationFrame(() => { conversation.scrollTop = conversation.scrollHeight; });
    }

    function finishLiveUi(liveUi) {
      for (const node of liveUi.parts) {
        if (node.type === 'thinking') {
          node.root.classList.remove('thinking-live');
          node.summary.textContent = 'Thinking';
          node.root.open = false;
        } else node.root.classList.remove('live-message');
      }
    }

    async function fetchOllamaStream(model,messages,tools,includeThink=true) {
      const body = {model,messages,tools,stream:true};
      if (includeThink) body.think = true;
      return fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
      });
    }

    async function streamRound(model,messages,tools,onDelta) {
      let response = await fetchOllamaStream(model,messages,tools,true);
      if (!response.ok && response.status >= 400 && response.status < 500) response = await fetchOllamaStream(model,messages,tools,false);
      if (!response.ok) {
        let detail = '';
        try { const body = await response.json(); detail = body?.error ? `: ${body.error}` : ''; } catch {}
        throw new Error(`Ollama returned HTTP ${response.status}${detail}`);
      }
      if (!response.body) throw new Error('Ollama returned no streaming body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const aggregate = {content:'',thinking:'',tool_calls:[]};
      const consumeLine = line => {
        if (!line.trim()) return;
        const data = JSON.parse(line);
        const message = data?.message || {};
        if (message.thinking) { aggregate.thinking += String(message.thinking); onDelta('thinking',String(message.thinking)); }
        if (message.content) { aggregate.content += String(message.content); onDelta('text',String(message.content)); }
        if (Array.isArray(message.tool_calls) && message.tool_calls.length) aggregate.tool_calls.push(...message.tool_calls);
      };

      while (true) {
        const {value,done} = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(),{stream:!done});
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) consumeLine(line);
        if (done) break;
      }
      if (buffer.trim()) consumeLine(buffer);
      return aggregate;
    }

    async function askOllama(chat,model,botMessage,liveUi) {
      const tools = window.RogerVIBTools?.schemas?.() || [];
      const messages = conversationForOllama(chat);
      for (let round=0;round<MAX_TOOL_ROUNDS;round++) {
        const assistantMessage = await streamRound(model,messages,tools,(type,delta) => appendSegment(botMessage,liveUi,type,delta,round));
        const toolCalls = assistantMessage.tool_calls;
        if (!toolCalls.length) {
          botMessage.text = botMessage.segments.filter(part => part.type === 'text').map(part => part.text).join('');
          if (!botMessage.text.trim() && !botMessage.segments.some(part => part.type === 'thinking')) throw new Error('Ollama returned an empty response');
          return;
        }

        const historyMessage = {role:'assistant',content:assistantMessage.content || '',tool_calls:toolCalls};
        if (assistantMessage.thinking) historyMessage.thinking = assistantMessage.thinking;
        messages.push(historyMessage);
        for (const call of toolCalls) {
          const name = call?.function?.name;
          const args = call?.function?.arguments || {};
          const result = await window.RogerVIBTools.run(name,args);
          messages.push({role:'tool',tool_name:String(name || 'unknown_tool'),content:JSON.stringify(result)});
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
        setConnectionMessage('No Ollama model is available. Start Ollama or select a pinned model.');
        return;
      }

      const targetChatId = chat.id;
      chat.model = model;
      chat.messages.push({role:'user',text,segments:[],streaming:false});
      if (chat.title === 'New conversation') chat.title = text.length > 28 ? `${text.slice(0,28)}…` : text;
      saveChats();
      renderChatList();
      renderConversation();
      messageInput.value = '';
      resizeInput();

      isSending = true;
      sendButton.disabled = true;
      modelPicker.disabled = true;
      setConnectionMessage(`Streaming ${model} • 2 tools • live thinking…`);

      const botMessage = {role:'bot',text:'',segments:[],streaming:true};
      chat.messages.push(botMessage);
      const rendered = renderMessage(botMessage);
      const liveUi = {...rendered,parts:[]};
      emptyState.classList.add('hidden');

      try {
        await askOllama(chat,model,botMessage,liveUi);
      } catch (error) {
        console.error('Ollama chat failed:',error);
        appendSegment(botMessage,liveUi,'text',`Ollama error: ${error.message}. Make sure Ollama is running, the selected model is available, and this page is allowed to connect to localhost:11434.`,999);
        botMessage.text = botMessage.segments.filter(part => part.type === 'text').map(part => part.text).join('');
      } finally {
        botMessage.streaming = false;
        finishLiveUi(liveUi);
        saveChats();
        isSending = false;
        sendButton.disabled = false;
        modelPicker.disabled = !availableModels.length;
        setConnectionMessage(`Connected to Ollama • using ${currentModel()} • 2 tools • live thinking`);
        renderChatList();
        messageInput.focus();
      }
    }

    renderChatList();
    renderConversation();
    loadOllamaModels().then(() => { renderConversation(); renderChatList(); });

    chatForm.addEventListener('submit',event => { event.preventDefault(); sendMessage(); });
    messageInput.addEventListener('input',resizeInput);
    messageInput.addEventListener('keydown',event => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
    });
    newChatButton.addEventListener('click',createNewChat);
    copyChatButton.addEventListener('click',copyCurrentChat);
    modelPicker.addEventListener('change',() => {
      const chat = activeChat();
      if (!chat || !modelPicker.value) return;
      chat.model = modelPicker.value;
      saveChats();
      setConnectionMessage(`Connected to Ollama • using ${chat.model} • 2 tools • live thinking`);
      messageInput.focus();
    });
    collapseButton.addEventListener('click',() => {
      if (window.innerWidth <= 760) sidebar.classList.remove('mobile-open');
      else sidebar.classList.toggle('collapsed');
    });
    mobileSidebarButton.addEventListener('click',() => sidebar.classList.toggle('mobile-open'));

    messageInput.focus();
    resizeInput();
  });
})();