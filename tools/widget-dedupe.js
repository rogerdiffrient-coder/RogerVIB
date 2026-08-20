// Deduplicate identical tool UI created in the same bot turn.
(() => {
  const WIDGET_KEY = 'rogervib_widgets_v1';
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';

  const chatId = () => localStorage.getItem(ACTIVE_CHAT_KEY) || 'default';
  function read() {
    try { return JSON.parse(localStorage.getItem(WIDGET_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function write(value) { localStorage.setItem(WIDGET_KEY, JSON.stringify(value)); }

  function keyFor(spec) {
    if (!spec || spec.closed) return null;
    const anchor = Number.isInteger(spec.anchorBotIndex) ? spec.anchorBotIndex : 'none';
    if (spec.type === 'calculator') {
      const expression = String(spec.data?.expression || '').replace(/\s+/g, '');
      const result = String(spec.data?.result || '').trim();
      return `calculator|${anchor}|${expression}|${result}`;
    }
    return null;
  }

  function dedupe() {
    const all = read();
    const id = chatId();
    const list = Array.isArray(all[id]) ? all[id] : [];
    const seen = new Map();
    let changed = false;

    for (const spec of list) {
      const key = keyFor(spec);
      if (!key) continue;
      if (!seen.has(key)) {
        seen.set(key, spec);
        continue;
      }
      // Keep the first card created for this exact tool result/turn.
      spec.closed = true;
      spec.deduped = true;
      changed = true;
    }

    if (changed) {
      all[id] = list;
      write(all);
      window.RogerVIBWidgets?.renderActiveWidgets?.();
      requestAnimationFrame(() => window.RogerVIBPlaceToolUI?.());
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    dedupe();
    const conversation = document.getElementById('conversation');
    if (conversation) {
      new MutationObserver(() => setTimeout(dedupe, 0))
        .observe(conversation, { childList:true, subtree:false });
    }
  });
  window.addEventListener('storage', dedupe);
  window.RogerVIBDedupeWidgets = dedupe;
})();
