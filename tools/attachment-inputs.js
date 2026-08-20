// Extra attachment inputs: drag/drop + clipboard paste.
(() => {
  async function addFiles(files) {
    const picker = document.getElementById('imageAttachmentPicker');
    if (!picker || !files?.length) return;
    const dt = new DataTransfer();
    [...files].filter(file => file?.type?.startsWith('image/')).forEach(file => dt.items.add(file));
    if (!dt.files.length) return;
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
      addFiles([...event.dataTransfer.files]);
    });

    input.addEventListener('paste', event => {
      const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'));
      if (!files.length) return;
      event.preventDefault();
      addFiles(files);
    });
  }

  window.addEventListener('DOMContentLoaded', setup);
})();