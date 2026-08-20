// Keep the Wordle board beside the most recent scored guess/result turn.
(() => {
  const WIDGET_KEY = 'rogervib_widgets_v1';
  const GAME_KEY = 'rogervib_games_v1';
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
  let scheduled = false;

  const chatId = () => localStorage.getItem(ACTIVE_CHAT_KEY) || 'default';
  const read = (key, fallback = {}) => {
    try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; }
    catch { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  function latestScoredGuess() {
    const games = read(GAME_KEY, {});
    const wordle = games?.[chatId()]?.wordle;
    const last = wordle?.rows?.at?.(-1);
    return typeof last?.text === 'string' ? last.text.toLowerCase() : null;
  }

  function reanchor() {
    scheduled = false;
    const conversation = document.getElementById('conversation');
    if (!conversation) return;

    const scored = latestScoredGuess();
    if (!scored) return;

    const userRows = [...conversation.querySelectorAll('.message-row.user')];
    const botRows = [...conversation.querySelectorAll('.message-row.bot')];
    if (!userRows.length || !botRows.length) return;

    const latestUser = userRows.at(-1);
    const raw = latestUser?.querySelector('.message-bubble')?.textContent?.trim() || '';
    // Only bare alphabetic guesses count. "Roger?" or other chat must not move/score Wordle.
    if (!/^[A-Za-z]{5}$/.test(raw) || raw.toLowerCase() !== scored) return;

    const index = botRows.length - 1;
    const all = read(WIDGET_KEY, {});
    const list = Array.isArray(all[chatId()]) ? all[chatId()] : [];
    const widget = [...list].reverse().find(item => item?.type === 'game' && item?.data?.game === 'wordle' && !item?.closed);
    if (!widget) return;

    if (widget.anchorBotIndex !== index) {
      widget.anchorBotIndex = index;
      widget.updatedAt = Date.now();
      all[chatId()] = list;
      write(WIDGET_KEY, all);
    }

    const row = conversation.querySelector(`.rogervib-widget-row[data-widget-id="${CSS.escape(String(widget.id))}"]`);
    const anchor = botRows[index];
    if (row && anchor && row.nextElementSibling !== anchor) conversation.insertBefore(row, anchor);
    window.RogerVIBPlaceToolUI?.();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => setTimeout(reanchor, 0));
  }

  window.addEventListener('DOMContentLoaded', () => {
    const conversation = document.getElementById('conversation');
    if (conversation) new MutationObserver(schedule).observe(conversation, {childList:true, subtree:true});
    schedule();
  });
  window.addEventListener('rogervib:wordle-updated', schedule);
})();
