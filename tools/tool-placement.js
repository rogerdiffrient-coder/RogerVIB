// Keep tool-created UI beside the bot turn that actually created it.
// Unanchored legacy UI is hidden instead of falling to the bottom of the chat.
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

    // Widgets: if they have an anchor, put them immediately BEFORE that bot row.
    // If they predate turn anchoring, do not dump them at the bottom.
    const allWidgets = read(WIDGET_KEY, {});
    const widgets = Array.isArray(allWidgets[chatId()]) ? allWidgets[chatId()] : [];
    for (const spec of widgets) {
      const ui = conversation.querySelector(`.rogervib-widget-row[data-widget-id="${CSS.escape(String(spec.id))}"]`);
      if (!ui) continue;
      const index = Number.isInteger(spec?.anchorBotIndex) ? spec.anchorBotIndex : null;
      const anchor = index !== null ? rows[index] : null;
      if (!anchor) {
        ui.style.display = 'none';
        continue;
      }
      ui.style.display = '';
      if (ui.nextElementSibling !== anchor) conversation.insertBefore(ui, anchor);
    }

    // Coding recovery card is chat-specific. Never show a project's card in a
    // different/new chat just because the project exists in localStorage.
    const codingAnchors = read(CODING_ANCHOR_KEY, {});
    const codingIndex = codingAnchors[chatId()];
    const codingCard = conversation.querySelector('.coding-project-card-row');
    if (codingCard) {
      const codingAnchor = Number.isInteger(codingIndex) ? rows[codingIndex] : null;
      if (!codingAnchor) codingCard.style.display = 'none';
      else {
        codingCard.style.display = '';
        if (codingCard.nextElementSibling !== codingAnchor) conversation.insertBefore(codingCard, codingAnchor);
      }
    }
  }

  window.RogerVIBTools.run = async function(name, args = {}) {
    const index = currentBotIndex();
    window.RogerVIBCurrentToolAnchor = { chatId: chatId(), botIndex: index, tool: name };
    const result = await originalRun(name, args);
    const widgetId = result?.result?.widget_id;
    if (widgetId) rememberWidgetAnchor(widgetId, index);
    if (name === 'coding_workspace' && ['write','delete','rename','preview','open'].includes(String(args?.action || ''))) {
      rememberCodingAnchor(index);
    }
    window.RogerVIBCurrentToolAnchor = null;
    placeEverything();
    requestAnimationFrame(placeEverything);
    setTimeout(placeEverything, 0);
    setTimeout(placeEverything, 40);
    setTimeout(placeEverything, 150);
    return result;
  };

  window.addEventListener('DOMContentLoaded', () => {
    const conversation = document.getElementById('conversation');
    if (conversation) {
      new MutationObserver(() => requestAnimationFrame(placeEverything))
        .observe(conversation, { childList:true, subtree:false });
    }
    placeEverything();
  });
  window.addEventListener('storage', placeEverything);
  window.addEventListener('rogervib:coding-updated', placeEverything);
  window.RogerVIBPlaceToolUI = placeEverything;
})();