// Keep tool-created UI beside the bot turn that actually created it.
(() => {
  if (!window.RogerVIBTools) return;
  const WIDGET_KEY = 'rogervib_widgets_v1';
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
  const CODING_ANCHOR_KEY = 'rogervib_coding_anchor_v1';
  const originalRun = window.RogerVIBTools.run.bind(window.RogerVIBTools);

  const chatId = () => localStorage.getItem(ACTIVE_CHAT_KEY) || 'default';
  const botRows = () => [...document.querySelectorAll('#conversation .message-row.bot')];
  const currentBotIndex = () => Math.max(0, botRows().length - 1);

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; }
    catch { return fallback; }
  }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function rememberWidgetAnchor(widgetId, index) {
    if (!widgetId) return;
    const all = read(WIDGET_KEY, {});
    const id = chatId();
    const list = Array.isArray(all[id]) ? all[id] : [];
    const widget = list.find(item => item?.id === widgetId);
    if (!widget) return;
    widget.anchorBotIndex = index;
    all[id] = list;
    write(WIDGET_KEY, all);
  }

  function rememberCodingAnchor(index) {
    const all = read(CODING_ANCHOR_KEY, {});
    all[chatId()] = index;
    write(CODING_ANCHOR_KEY, all);
  }

  function placeEverything() {
    const conversation = document.getElementById('conversation');
    if (!conversation) return;
    const rows = botRows();

    const allWidgets = read(WIDGET_KEY, {});
    const widgets = Array.isArray(allWidgets[chatId()]) ? allWidgets[chatId()] : [];
    for (const spec of widgets) {
      if (!Number.isInteger(spec?.anchorBotIndex)) continue;
      const ui = conversation.querySelector(`.rogervib-widget-row[data-widget-id="${CSS.escape(String(spec.id))}"]`);
      const anchor = rows[spec.anchorBotIndex];
      if (ui && anchor && ui.nextElementSibling !== anchor) conversation.insertBefore(ui, anchor);
    }

    const codingAnchors = read(CODING_ANCHOR_KEY, {});
    const codingIndex = codingAnchors[chatId()];
    const codingCard = conversation.querySelector('.coding-project-card-row');
    const codingAnchor = Number.isInteger(codingIndex) ? rows[codingIndex] : null;
    if (codingCard && codingAnchor && codingCard.nextElementSibling !== codingAnchor) conversation.insertBefore(codingCard, codingAnchor);
  }

  window.RogerVIBTools.run = async function(name, args = {}) {
    const index = currentBotIndex();
    const result = await originalRun(name, args);
    const widgetId = result?.result?.widget_id;
    if (widgetId) rememberWidgetAnchor(widgetId, index);
    if (name === 'coding_workspace' && ['write','delete','rename','preview','open'].includes(String(args?.action || ''))) {
      rememberCodingAnchor(index);
    }
    requestAnimationFrame(placeEverything);
    setTimeout(placeEverything, 30);
    return result;
  };

  window.addEventListener('DOMContentLoaded', () => {
    const conversation = document.getElementById('conversation');
    if (conversation) new MutationObserver(() => setTimeout(placeEverything, 0)).observe(conversation, { childList:true, subtree:false });
    placeEverything();
  });
  window.addEventListener('storage', placeEverything);
  window.RogerVIBPlaceToolUI = placeEverything;
})();