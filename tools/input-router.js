// Route Enter-key sends through the real form when local UI needs preprocessing.
(() => {
  const GAME_KEY = 'rogervib_games_v1';
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';

  function activeWordle() {
    try {
      const all = JSON.parse(localStorage.getItem(GAME_KEY) || '{}');
      const chat = localStorage.getItem(ACTIVE_CHAT_KEY) || 'default';
      const state = all?.[chat]?.wordle;
      return state && !state.done ? state : null;
    } catch { return null; }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('messageInput');
    const form = document.getElementById('chatForm');
    if (!input || !form) return;

    // Capture before main.js's keydown listener, which normally calls sendMessage()
    // directly and bypasses submit-time attachment/game handlers.
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      const text = input.value.trim();
      const hasImage = !!window.RogerVIBAttachments?.hasPending?.();
      const wordle = activeWordle();

      // Only a BARE all-letter word of the correct length is an implicit guess.
      // "Roger?" is normal chat because punctuation means it is not a guess.
      const isClearWordleGuess = !!wordle && new RegExp(`^[A-Za-z]{${wordle.secret?.length || 5}}$`).test(text);

      if (!hasImage && !isClearWordleGuess) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      form.requestSubmit();
    }, true);
  });
})();