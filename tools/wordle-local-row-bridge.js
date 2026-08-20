// Preserve deterministic local Wordle turns without letting main.js's stale
// in-memory chat array wipe them on the next normal AI message.
(() => {
  const GAME_KEY = 'rogervib_games_v1';
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
  let protectUntil = 0;
  let sequence = 0;
  let placing = false;

  const chatId = () => localStorage.getItem(ACTIVE_CHAT_KEY) || 'default';

  function activeWordle() {
    try {
      const all = JSON.parse(localStorage.getItem(GAME_KEY) || '{}');
      const state = all?.[chatId()]?.wordle;
      return state && !state.done ? state : null;
    } catch { return null; }
  }

  function isLocalWordleSubmit(text) {
    if (/\b(play|start|lets play|let's play)\b.*\bwordle\b/i.test(text) || /^wordle$/i.test(text)) return true;
    const state = activeWordle();
    if (!state) return false;
    const length = state.secret?.length || 5;
    return new RegExp(`^[A-Za-z]{${length}}$`).test(text);
  }

  function protectRow(row) {
    if (!row?.classList?.contains('message-row')) return;
    if (performance.now() > protectUntil) return;
    const conversation = document.getElementById('conversation');
    if (!conversation) return;

    // Count only main.js-owned rows that existed before this local game row.
    const mainRows = [...conversation.querySelectorAll(':scope > .message-row')];
    const index = Math.max(0, mainRows.indexOf(row));

    row.classList.remove('message-row');
    row.classList.add('wordle-local-row');
    row.dataset.chatId = chatId();
    row.dataset.mainIndex = String(index);
    row.dataset.localSequence = String(sequence++);
  }

  function placeRows() {
    if (placing) return;
    const conversation = document.getElementById('conversation');
    if (!conversation) return;
    placing = true;
    try {
      const currentChat = chatId();
      const locals = [...conversation.querySelectorAll(':scope > .wordle-local-row')];
      for (const row of locals) {
        if (row.dataset.chatId !== currentChat) row.remove();
      }

      const rows = [...conversation.querySelectorAll(':scope > .wordle-local-row')]
        .sort((a,b) => Number(a.dataset.mainIndex || 0) - Number(b.dataset.mainIndex || 0) || Number(a.dataset.localSequence || 0) - Number(b.dataset.localSequence || 0));
      const grouped = new Map();
      for (const row of rows) {
        const index = Number(row.dataset.mainIndex || 0);
        if (!grouped.has(index)) grouped.set(index, []);
        grouped.get(index).push(row);
      }

      // Recompute main rows after cleanup. Insert local rows before the first
      // later main row, or at the end if the game happened after all saved chat.
      const mainRows = [...conversation.querySelectorAll(':scope > .message-row')];
      for (const [index, group] of [...grouped.entries()].sort((a,b) => a[0]-b[0])) {
        const anchor = mainRows[index] || null;
        for (const row of group) {
          if (anchor) conversation.insertBefore(row, anchor);
          else conversation.appendChild(row);
        }
      }
    } finally {
      placing = false;
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('chatForm');
    const input = document.getElementById('messageInput');
    const conversation = document.getElementById('conversation');
    if (!form || !input || !conversation) return;

    // Mark the tiny window in which widgets-v2 appends its deterministic game rows.
    form.addEventListener('submit', () => {
      if (!isLocalWordleSubmit(input.value.trim())) return;
      protectUntil = performance.now() + 150;
    }, true);

    new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('message-row')) protectRow(node);
        }
      }
      requestAnimationFrame(placeRows);
    }).observe(conversation, {childList:true,subtree:false});

    placeRows();
  });
})();