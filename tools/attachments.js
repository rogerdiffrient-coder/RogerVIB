// RogerVIB image attachment layer for Ollama vision-capable models.
// Keep image bytes lightweight and attach them only to the turn that sends them.
(() => {
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
  const CHATS_KEY = 'rogervib_chats_v1';
  const SESSION_KEY = 'rogervib_image_attachment_previews_v3';
  const MAX_IMAGES = 4;
  const MAX_DIMENSION = 1024;
  const MAX_FILE_BYTES = 12 * 1024 * 1024;

  let pending = [];
  let inFlight = [];

  const activeChatId = () => localStorage.getItem(ACTIVE_CHAT_KEY) || 'default';
  const readSession = () => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}') || {}; }
    catch { return {}; }
  };
  const writeSession = value => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); }
    catch (error) { console.warn('attachment previews could not be persisted:', error); }
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

  async function loadImage(file) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(file); } catch {}
    }
    const sourceUrl = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('could not read that image'));
        img.src = sourceUrl;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(sourceUrl), 0);
    }
  }

  async function resizeImage(file) {
    if (!file?.type?.startsWith('image/')) throw new Error('only image attachments are supported right now');
    if (file.size > MAX_FILE_BYTES) throw new Error('that image is too large. keep images under 12 MB');

    const image = await loadImage(file);
    const naturalWidth = image.width || image.naturalWidth || 1;
    const naturalHeight = image.height || image.naturalHeight || 1;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha:false });
    if (!ctx) throw new Error('image processing is unavailable in this browser');
    ctx.drawImage(image, 0, 0, width, height);
    image.close?.();

    // Always use JPEG for the model payload. This is dramatically smaller than
    // re-sending full PNG screenshots and avoids freezing the main thread.
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);

    // Tiny preview only; never persist model-sized base64 in sessionStorage.
    const previewCanvas = document.createElement('canvas');
    const previewScale = Math.min(1, 256 / Math.max(width, height));
    previewCanvas.width = Math.max(1, Math.round(width * previewScale));
    previewCanvas.height = Math.max(1, Math.round(height * previewScale));
    previewCanvas.getContext('2d')?.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
    const previewUrl = previewCanvas.toDataURL('image/jpeg', 0.68);

    return {
      name:String(file.name || 'image').slice(0,120),
      type:'image/jpeg',
      previewUrl,
      base64:dataUrlToBase64(dataUrl),
      width,
      height
    };
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
    pending.forEach((attachment,index) => {
      const chip = document.createElement('div');
      chip.className = 'attachment-preview';
      const img = document.createElement('img');
      img.src = attachment.previewUrl;
      img.alt = attachment.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'attachment-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label',`remove ${attachment.name}`);
      remove.addEventListener('click',() => { pending.splice(index,1); renderPending(); });
      chip.append(img,remove);
      strip.appendChild(chip);
    });
  }

  function storeSentPreviews(chatId,userIndex,attachments) {
    if (!attachments?.length) return;
    const store = readSession();
    if (!Array.isArray(store[chatId])) store[chatId] = [];
    store[chatId] = store[chatId].filter(item => item?.userIndex !== userIndex);
    store[chatId].push({
      userIndex,
      attachments:attachments.map(item => ({name:item.name,type:item.type,previewUrl:item.previewUrl}))
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
      if (!row || !record.attachments?.length) continue;
      const stack = row.querySelector('.message-stack') || row;
      const strip = document.createElement('div');
      strip.className = 'sent-attachment-strip';
      for (const attachment of record.attachments) {
        const img = document.createElement('img');
        img.src = attachment.previewUrl;
        img.alt = attachment.name || 'attached image';
        img.loading = 'lazy';
        strip.appendChild(img);
      }
      stack.insertBefore(strip,stack.firstChild);
    }
  }

  function applyToPayload(payload) {
    if (!payload || !Array.isArray(payload.messages)) return payload;
    const users = payload.messages.filter(message => message?.role === 'user');
    const lastUser = users.at(-1);
    const immediate = inFlight.length ? inFlight : pending;

    // IMPORTANT: only attach current images to the current user turn.
    // Older image bytes are NOT re-injected into every follow-up request.
    if (lastUser && immediate.length) {
      lastUser.images = immediate.map(item => item.base64).filter(Boolean);
      const userIndex = Math.max(0,users.length - 1);
      storeSentPreviews(activeChatId(),userIndex,immediate);
      inFlight = [];
      pending = [];
      setTimeout(() => { renderPending(); renderSentAttachments(); },0);
    }
    return payload;
  }

  async function addFiles(files) {
    const accepted = [...(files || [])]
      .filter(file => file?.type?.startsWith('image/'))
      .slice(0,Math.max(0,MAX_IMAGES - pending.length));
    for (const file of accepted) {
      try {
        // Yield before heavy image work so drag/paste UI can paint first.
        await new Promise(resolve => requestAnimationFrame(resolve));
        pending.push(await resizeImage(file));
      } catch (error) { window.alert(error.message || String(error)); }
    }
    renderPending();
    document.getElementById('messageInput')?.focus();
    return pending.length;
  }

  function prepareForSend() {
    const input = document.getElementById('messageInput');
    if (!pending.length) return false;
    if (input && !input.value.trim()) input.value = 'what is in this image?';
    inFlight = pending.map(item => ({...item}));
    pending = [];
    renderPending();
    return true;
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

    plus.title = 'attach image';
    plus.setAttribute('aria-label','attach image');
    plus.addEventListener('click',() => picker.click());
    picker.addEventListener('change',async () => {
      const files = [...picker.files];
      picker.value = '';
      await addFiles(files);
    });

    // Still support normal form submits, but main.js can also call prepareForSend()
    // directly for Enter-key sends.
    form.addEventListener('submit',prepareForSend,true);

    const conversation = document.getElementById('conversation');
    if (conversation) new MutationObserver(renderSentAttachments).observe(conversation,{childList:true,subtree:true});
    renderPending();
    renderSentAttachments();
  }

  window.RogerVIBAttachments = {
    applyToPayload,
    renderSentAttachments,
    addFiles,
    prepareForSend,
    getPendingCount:() => pending.length,
    hasPending:() => pending.length > 0 || inFlight.length > 0
  };

  window.addEventListener('DOMContentLoaded',setupDom);
})();