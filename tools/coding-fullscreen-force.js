// Always provide a visible fullscreen control for the Coding live preview.
(() => {
  function install() {
    const section = document.querySelector('.coding-preview-section');
    const bar = document.querySelector('.coding-preview-label');
    if (!section || !bar || bar.querySelector('.coding-fullscreen-button')) return false;

    let actions = bar.querySelector('.coding-preview-actions');
    if (!actions) {
      actions = document.createElement('span');
      actions.className = 'coding-preview-actions';
      const dot = bar.querySelector('.coding-live-dot');
      if (dot) actions.appendChild(dot);
      bar.appendChild(actions);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'coding-fullscreen-button';
    button.textContent = 'Fullscreen';
    button.title = 'Fullscreen preview';
    button.setAttribute('aria-label', 'Fullscreen preview');

    function syncLabel() {
      button.textContent = section.classList.contains('coding-preview-fullscreen') ? 'Exit fullscreen' : 'Fullscreen';
    }

    button.addEventListener('click', async () => {
      // Use the browser fullscreen API when available; fall back to a fixed overlay.
      if (document.fullscreenElement === section) {
        try { await document.exitFullscreen(); } catch {}
        section.classList.remove('coding-preview-fullscreen');
        syncLabel();
        return;
      }
      if (section.requestFullscreen) {
        try {
          await section.requestFullscreen();
          syncLabel();
          return;
        } catch {}
      }
      section.classList.toggle('coding-preview-fullscreen');
      syncLabel();
    });

    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement !== section) section.classList.remove('coding-preview-fullscreen');
      syncLabel();
    });

    actions.appendChild(button);
    return true;
  }

  window.addEventListener('DOMContentLoaded', () => {
    install();
    const observer = new MutationObserver(install);
    observer.observe(document.body, { childList:true, subtree:true });
    const timer = setInterval(() => {
      if (install() || document.querySelector('.coding-fullscreen-button')) clearInterval(timer);
    }, 100);
  });
})();