// Tiny slash shortcuts for common RogerVIB actions.
(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('messageInput');
    const form = document.getElementById('chatForm');
    const newChat = document.getElementById('newChatButton');
    if (!input || !form) return;

    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      const raw = input.value.trim();
      if (!raw.startsWith('/')) return;

      const [commandRaw, ...rest] = raw.split(/\s+/);
      const command = commandRaw.toLowerCase();
      const args = rest.join(' ').trim();

      if (command === '/calc') {
        if (!args) return;
        event.preventDefault(); event.stopImmediatePropagation();
        input.value = `calculate ${args}`;
        input.dispatchEvent(new Event('input',{bubbles:true}));
        form.requestSubmit();
        return;
      }

      if (command === '/wordle') {
        event.preventDefault(); event.stopImmediatePropagation();
        input.value = 'wordle';
        input.dispatchEvent(new Event('input',{bubbles:true}));
        form.requestSubmit();
        return;
      }

      if (command === '/code') {
        event.preventDefault(); event.stopImmediatePropagation();
        input.value = '';
        input.dispatchEvent(new Event('input',{bubbles:true}));
        window.RogerVIBCoding?.openWorkspace?.({title:'Coding'});
        return;
      }

      if (command === '/clear' || command === '/new') {
        event.preventDefault(); event.stopImmediatePropagation();
        input.value = '';
        input.dispatchEvent(new Event('input',{bubbles:true}));
        newChat?.click();
      }
    }, true);
  });
})();
