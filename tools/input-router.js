// Route every Enter-key send through the real form submit path.
// This keeps attachments, Wordle, and normal chat on one consistent path.
(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('messageInput');
    const form = document.getElementById('chatForm');
    if (!input || !form) return;

    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      form.requestSubmit();
    }, true);
  });
})();