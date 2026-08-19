// RogerVIB image attachment layer for Ollama vision-capable models.
// Images are resized in-browser, previewed in chat, and injected into the
// matching user message as Ollama REST `images` base64 data.
(() => {
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
  const CHATS_KEY = 'rogervib_chats_v1';
  const SESSION_KEY = 'rogervib_image_attachments_v1';
  const MAX_IMAGES = 4;
  const MAX_DIMENSION = 1600;
  const MAX_FILE_BYTES = 12 * 1024 * 1024;

  let pending = [];
  let activeSend = null;
  const nativeFetch = window.fetch.bind(window);

  const activeChatId = () => localStorage.getItem(ACTIVE_CHAT_KEY) || 'default';
  const readSession = () => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}') || {}; }
    catch { return {}; }
  };
  const writeSession = value => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); }
    catch (error) { console.warn('Attachment history could not be persisted for this session:', error); }
  };

  function currentUserCount() {
    try {
      const chats = JSON.parse(localStorage.getItem(CHATS_KEY) || '[]');
      const chat = Array.isArray(chats) ? chats.find(item => item?.id === activeChatId()) : null;
      return Array.isArray(chat?.messages) ? chat.messages.filter(message => message?.role === 'user').length : 0;
    } catch { return 0; }
  }

  function dataUrlToBase64(dataUrl) {
    const comma = String(dataUrl || '').indexOf(',');
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }

  async function resizeImage(file) {
    if (!file?.type?.startsWith('image/')) throw new Error('Only image attachments are supported right now.');
    if (file.size > MAX_FILE_BYTES) throw new Error('That image is too large. Keep images under 12 MB.');

    const sourceUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not read that image.'));
        img.src = sourceUrl;
      });

      const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Image processing is unavailable in this browser.');
      ctx.drawImage(image, 0, 0, width, height);

      const preservePng = file.type === 'image/png';
      const mime = preservePng ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(mime, preservePng ? undefined : 0.9);
      return {
        name: String(file.name || 'image').slice(0, 120),
        type: mime,
        dataUrl,
        base64: dataUrlToBase64(dataUrl),
        width,
        height
      };
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  function ensurePendingStrip() {
    let strip = document.getElementById('attachmentPreviewStrip');
    if (strip) return strip;
    const composer = document.getElementById('chatForm');
    if (!composer) return null;
    strip = document.createElement('div');
    strip.id = 'attachmentPreviewStrip';
    strip.className = 'attachment-preview-strip';
    composer.insertBefore(strip, composer.firstChild);
    return strip;
  }

  function renderPending() {
    const strip = ensurePendingStrip();
    if (!strip) return;
    strip.innerHTML = '';
    strip.classList.toggle('has-attachments', pending.length > 0);
    pending.forEach((attachment, index) => {
      const chip = document.createElement('div');
      chip.className = 'attachment-preview';
      const img = document.createElement('img');
      img.src = attachment.dataUrl;
      img.alt = attachment.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'attachment-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${attachment.name}`);
      remove.addEventListener('click', () => {
        pending.splice(index, 1);
        renderPending();
      });
      chip.append(img, remove);
      strip.appendChild(chip);
    });
  }

  function storeSentAttachments(chatId, userIndex, attachments) {
    const store = readSession();
    if (!Array.isArray(store[chatId])) store[chatId] = [];
    store[chatId] = store[chatId].filter(item => item?.userIndex !== userIndex);
    store[chatId].push({
      userIndex,
      attachments: attachments.map(item => ({ name:item.name, type:item.type, dataUrl:item.dataUrl }))
    });
    store[chatId] = store[chatId].slice(-12);
    writeSession(store);
  }

  function renderSentAttachments() {
    const conversation = document.getElementById('conversation');
    if (!conversation) return;
    conversation.querySelectorAll('.sent-attachment-strip').forEach(node => node.remove());
    const store = readSession();
    const records = Array.isArray(store[activeChatId()]) ? store[activeChatId()] : [];
    const userRows = [...conversation.querySelectorAll('.message-row.user')];
    for (const record of records) {
      const row = userRows[record.userIndex];
      if (!row || !Array.isArray(record.attachments) || !record.attachments.length) continue;
      const stack = row.querySelector('.message-stack') || row;
      const strip = document.createElement('div');
      strip.className = 'sent-attachment-strip';
      for (const attachment of record.attachments) {
        const img = document.createElement('img');
        img.src = attachment.dataUrl;
        img.alt = attachment.name || 'Attached image';
        img.loading = 'lazy';
        strip.appendChild(img);
      }
      stack.insertBefore(strip, stack.firstChild);
    }
  }

  function setupDom() {
    const plus = document.querySelector('.plus-button');
    const form = document.getElementById('chatForm');
    const input = document.getElementById('messageInput');
    if (!plus || !form || !input) return;

    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.multiple = true;
    picker.hidden = true;
    picker.id = 'imageAttachmentPicker';
    document.body.appendChild(picker);

    plus.title = 'Attach image';
    plus.setAttribute('aria-label', 'Attach image');
    plus.addEventListener('click', () => picker.click());

    picker.addEventListener('change', async () => {
      const files = [...picker.files].slice(0, Math.max(0, MAX_IMAGES - pending.length));
      picker.value = '';
      for (const file of files) {
        try { pending.push(await resizeImage(file)); }
        catch (error) { window.alert(error.message || String(error)); }
      }
      renderPending();
      input.focus();
    });

    // Capture runs before RogerVIB's normal submit handler.
    form.addEventListener('submit', () => {
      if (!pending.length) return;
      if (!input.value.trim()) input.value = 'What is in this image?';
      const chatId = activeChatId();
      const userIndex = currentUserCount();
      const attachments = pending.map(item => ({ ...item }));
      activeSend = {
        chatId,
        userIndex,
        expectedUserCount: userIndex + 1,
        attachments
      };
      storeSentAttachments(chatId, userIndex, attachments);
      pending = [];
      renderPending();
      setTimeout(renderSentAttachments, 30);
    }, true);

    const observer = new MutationObserver(() => renderSentAttachments());
    const conversation = document.getElementById('conversation');
    if (conversation) observer.observe(conversation, { childList:true, subtree:true });
    renderPending();
    renderSentAttachments();
  }

  window.fetch = async function RogerVIBAttachmentFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!activeSend || !url.includes('localhost:11434/api/chat') || typeof init?.body !== 'string') {
      return nativeFetch(input, init);
    }

    try {
      const payload = JSON.parse(init.body);
      if (!Array.isArray(payload.messages)) return nativeFetch(input, init);
      const users = payload.messages.filter(message => message?.role === 'user');
      const latest = users.at(-1);
      if (latest && users.length === activeSend.expectedUserCount) {
        latest.images = activeSend.attachments.map(item => item.base64);
      }
      return nativeFetch(input, { ...init, body: JSON.stringify(payload) });
    } catch {
      return nativeFetch(input, init);
    }
  };

  window.addEventListener('DOMContentLoaded', setupDom);
})();
