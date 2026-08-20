// Keep tool-created UI beside the bot turn that actually created it.
// Widgets created inside a tool are detected automatically, even if the tool
// does not explicitly return a widget_id (calculator does this).
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

  function widgetList(id = chatId()) {
    const all = read(WIDGET_KEY, {});
    return Array.isArray(all[id]) ? all[id] : [];
  }

  function widgetIds(id = chatId()) {
    return new Set(widgetList(id).map(item => String(item?.id || '')).filter(Boolean));
  }

  function rememberWidgetAnchor(widgetId, index) {
    if (!widgetId) return;
    const all = read(WIDGET_KEY, {});
    const id = chatId();
    const list = Array.isArray(all[id]) ? all[id] : [];
    const widget = list.find(item => String(item?.id) === String(widgetId));
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

  function isActiveWordle(spec) {
    return !spec?.closed && spec?.type === 'game' && String(spec?.data?.game || '').toLowerCase() === 'wordle' && !spec?.data?.done;
  }

  function placeEverything() {
    const conversation = document.getElementById('conversation');
    if (!conversation) return;
    const rows = botRows();

    const allWidgets = read(WIDGET_KEY, {});
    const widgets = Array.isArray(allWidgets[chatId()]) ? allWidgets[chatId()] : [];
    for (const spec of widgets) {
      const ui = conversation.querySelector(`.rogervib-widget-row[data-widget-id="${CSS.escape(String(spec.id))}"]`);
      if (!ui) continue;
      const index = Number.isInteger(spec?.anchorBotIndex) ? spec.anchorBotIndex : null;
      const anchor = index !== null ? rows[index] : null;

      if (!anchor) {
        // A live game should never visually vanish just because its old message
        // anchor disappeared during a chat rerender. Keep the existing state and
        // move the board to the current bottom instead.
        if (isActiveWordle(spec)) {
          ui.style.display = '';
          if (conversation.lastElementChild !== ui) conversation.appendChild(ui);
        } else {
          ui.style.display = 'none';
        }
        continue;
      }

      ui.style.display = '';
      if (ui.nextElementSibling !== anchor) conversation.insertBefore(ui, anchor);
    }

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
    const id = chatId();
    const index = currentBotIndex();
    const beforeIds = widgetIds(id);

    window.RogerVIBCurrentToolAnchor = { chatId:id, botIndex:index, tool:name };
    const result = await originalRun(name, args);

    // Explicit widget ids still work.
    const explicitWidgetId = result?.result?.widget_id;
    if (explicitWidgetId) rememberWidgetAnchor(explicitWidgetId, index);

    // More importantly: detect widgets that the tool created internally.
    // This catches calculator -> RogerVIBWidgets.saveWidget(...) even though
    // calculator's actual tool result is just a number/string.
    for (const spec of widgetList(id)) {
      const widgetId = String(spec?.id || '');
      if (widgetId && !beforeIds.has(widgetId)) rememberWidgetAnchor(widgetId, index);
    }

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