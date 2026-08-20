// RogerVIB image attachment layer for Ollama vision-capable models.
// Images are resized in-browser, previewed, stored for the current session,
// and explicitly attached to the matching Ollama user message.
(() => {
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
  const CHATS_KEY = 'rogervib_chats_v1';
  const SESSION_KEY = 'rogervib_image_attachments_v2';
  const MAX_IMAGES = 4;
  const MAX_DIMENSION = 1600;
  const MAX_FILE_BYTES = 12 * 1024 * 1024;

  let pending = [];

  const activeChatId = () => localStorage.getItem(ACTIVE_CHAT_KEY) || 'default';
  const readSession = () => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}') || {}; }
    catch { return {}; }
  };
  const writeSession = value => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); }
    catch (error) { console.warn('Attachment history could not be persisted:', error); }
  };

  function currentUserCount() {
    try {
      const chats = JSON.parse(localStorage.getItem(CHATS_KEY) || '[]');
      const chat = Array.isArray(chats) ? chats.find(item => item?.id === activeChatId()) : null;
      return Array.isArray(chat?.messages) ? chat.messages.filter(message => message?.role === 'user').length : 0;
    } catch { return 0; }
  }

  function dataUrlToBase64(dataUrl) {
    const text = String(dataUrl || '');
    const comma = text.indexOf(',');
    return comma >= 0 ? text.slice(comma + 1) : text;
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

      const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(mime, mime === 'image/jpeg' ? 0.9 : undefined);
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
      attachments: attachments.map(item => ({
        name:item.name,
        type:item.type,
        dataUrl:item.dataUrl,
        base64:item.base64
      }))
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

  function applyToPayload(payload) {
    if (!payload || !Array.isArray(payload.messages)) return payload;
    const users = payload.messages.filter(message => message?.role === 'user');
    const store = readSession();
    const records = Array.isArray(store[activeChatId()]) ? store[activeChatId()] : [];

    for (const record of records) {
      const target = users[record.userIndex];
      if (!target || !Array.isArray(record.attachments) || !record.attachments.length) continue;
      const images = record.attachments
        .map(item => item.base64 || dataUrlToBase64(item.dataUrl))
        .filter(Boolean);
      if (images.length) target.images = images;
    }
    return payload;
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

    // Capture before RogerVIB's own submit handler adds the user message.
    form.addEventListener('submit', () => {
      if (!pending.length) return;
      if (!input.value.trim()) input.value = 'What is in this image?';
      const chatId = activeChatId();
      const userIndex = currentUserCount();
      storeSentAttachments(chatId, userIndex, pending.map(item => ({...item})));
      pending = [];
      renderPending();
      setTimeout(renderSentAttachments, 30);
    }, true);

    const conversation = document.getElementById('conversation');
    if (conversation) new MutationObserver(renderSentAttachments).observe(conversation, {childList:true,subtree:true});
    renderPending();
    renderSentAttachments();
  }

  window.RogerVIBAttachments = {
    applyToPayload,
    renderSentAttachments,
    getPendingCount: () => pending.length
  };

  window.addEventListener('DOMContentLoaded', setupDom);
})();
