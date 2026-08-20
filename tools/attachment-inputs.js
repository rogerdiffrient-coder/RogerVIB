// Extra attachment inputs: drag/drop + clipboard paste.
(() => {
  async function addFiles(files) {
    const images = [...(files || [])].filter(file => file?.type?.startsWith('image/'));
    if (!images.length) return;
    if (window.RogerVIBAttachments?.addFiles) {
      await window.RogerVIBAttachments.addFiles(images);
      return;
    }

    // Fallback for older cached attachment layer.
    const picker = document.getElementById('imageAttachmentPicker');
    if (!picker) return;
    const dt = new DataTransfer();
    images.forEach(file => dt.items.add(file));
    try {
      picker.files = dt.files;
      picker.dispatchEvent(new Event('change', { bubbles:true }));
    } catch (error) {
      console.warn('couldnt hand dropped/pasted images to the attachment picker', error);
    }
  }

  function setup() {
    const composer = document.querySelector('.composer-wrap');
    const input = document.getElementById('messageInput');
    if (!composer || !input) return;

    let dragDepth = 0;
    const overlay = document.createElement('div');
    overlay.className = 'attachment-drop-overlay';
    overlay.textContent = 'drop image here';
    composer.appendChild(overlay);

    const hasImage = event => [...(event.dataTransfer?.items || [])].some(item => item.kind === 'file' && item.type.startsWith('image/'));

    composer.addEventListener('dragenter', event => {
      if (!hasImage(event)) return;
      event.preventDefault();
      dragDepth++;
      composer.classList.add('attachment-dragging');
    });
    composer.addEventListener('dragover', event => {
      if (!hasImage(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    composer.addEventListener('dragleave', event => {
      if (!hasImage(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) composer.classList.remove('attachment-dragging');
    });
    composer.addEventListener('drop', event => {
      event.preventDefault();
      dragDepth = 0;
      composer.classList.remove('attachment-dragging');
      addFiles(event.dataTransfer?.files || []);
    });

    input.addEventListener('paste', event => {
      const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'));
      if (!files.length) return;
      event.preventDefault();
      addFiles(files);
    });

    // main.js sends directly on Enter instead of dispatching a form submit.
    // Give image-only Enter sends a text body so they actually leave the composer;
    // attachments.js then binds the image bytes to the final Ollama payload.
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      if (!window.RogerVIBAttachments?.hasPending?.()) return;
      if (!input.value.trim()) input.value = 'what is in this image?';
    }, true);
  }

  window.addEventListener('DOMContentLoaded', setup);
})();