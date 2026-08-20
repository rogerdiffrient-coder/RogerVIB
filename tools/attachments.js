// RogerVIB image attachment layer for Ollama vision-capable models.
// Full image bytes live only in memory. Sent history stores tiny previews only.
(() => {
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
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
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(sourceUrl); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(sourceUrl); reject(new Error('could not read that image')); };
      img.src = sourceUrl;
    });
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
    const ctx = canvas.getContext('2d', {alpha:false});
    if (!ctx) throw new Error('image processing is unavailable in this browser');
    ctx.drawImage(image, 0, 0, width, height);
    image.close?.();

    const modelDataUrl = canvas.toDataURL('image/jpeg', 0.76);

    const previewCanvas = document.createElement('canvas');
    const previewScale = Math.min(1, 220 / Math.max(width, height));
    previewCanvas.width = Math.max(1, Math.round(width * previewScale));
    previewCanvas.height = Math.max(1, Math.round(height * previewScale));
    previewCanvas.getContext('2d')?.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);

    return {
      name:String(file.name || 'image').slice(0,120),
      type:'image/jpeg',
      previewUrl:previewCanvas.toDataURL('image/jpeg', 0.62),
      base64:dataUrlToBase64(modelDataUrl),
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
    strip.replaceChildren();
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
      remove.addEventListener('click',() => {
        pending.splice(index,1);
        renderPending();
      });
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
      attachments:attachments.map(item => ({
        name:item.name,
        type:item.type,
        previewUrl:item.previewUrl
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

  function prepareForSend() {
    const input = document.getElementById('messageInput');
    if (!pending.length) return false;
    if (input && !input.value.trim()) input.value = 'what is in this image?';
    inFlight = pending;
    pending = [];
    renderPending();
    return true;
  }

  function applyToPayload(payload) {
    if (!payload || !Array.isArray(payload.messages)) return payload;
    const users = payload.messages.filter(message => message?.role === 'user');
    const lastUser = users.at(-1);
    if (!lastUser || !inFlight.length) return payload;

    // Attach ONLY the images owned by this send. No old base64 gets replayed.
    const sending = inFlight;
    lastUser.images = sending.map(item => item.base64).filter(Boolean);
    storeSentPreviews(activeChatId(), Math.max(0,users.length - 1), sending);
    inFlight = [];

    queueMicrotask(() => renderSentAttachments());
    return payload;
  }

  async function addFiles(files) {
    const accepted = [...(files || [])]
      .filter(file => file?.type?.startsWith('image/'))
      .slice(0,Math.max(0,MAX_IMAGES - pending.length));

    for (const file of accepted) {
      try {
        await new Promise(resolve => requestAnimationFrame(resolve));
        pending.push(await resizeImage(file));
      } catch (error) {
        window.alert(error.message || String(error));
      }
    }

    renderPending();
    document.getElementById('messageInput')?.focus();
    return pending.length;
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

    // This is the one attachment transition: pending -> inFlight.
    form.addEventListener('submit',prepareForSend,true);

    const conversation = document.getElementById('conversation');
    if (conversation) {
      // IMPORTANT: watch only direct message rows. Watching the full subtree caused
      // an infinite loop because rendering an image preview triggered itself again.
      new MutationObserver(() => renderSentAttachments()).observe(conversation,{childList:true});
    }

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