// Re-render both normal chat and Markdown widgets with the same shared renderer.
(() => {
  const CHAT_KEY = 'rogervib_chats_v1';
  const WIDGET_KEY = 'rogervib_widgets_v1';
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
  let scheduled = false;
  let rendering = false;

  const activeChatId = () => localStorage.getItem(ACTIVE_CHAT_KEY) || 'default';
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; }
    catch { return fallback; }
  }

  function renderIfChanged(element, source) {
    if (!element || element.classList.contains('live-message')) return;
    const text = String(source ?? '');
    if (element.dataset.rvMarkdownSource === text) return;
    window.RogerVIBMarkdown?.renderInto?.(element, text);
    element.dataset.rvMarkdownSource = text;
  }

  function renderChatRows() {
    const conversation = document.getElementById('conversation');
    if (!window.RogerVIBMarkdown || !conversation) return;

    const chats = read(CHAT_KEY, []);
    const chat = Array.isArray(chats) ? chats.find(item => item?.id === activeChatId()) : null;
    if (!chat || !Array.isArray(chat.messages)) return;

    const rows = [...conversation.querySelectorAll(':scope > .message-row')];
    let rowIndex = 0;
    for (const message of chat.messages) {
      const row = rows[rowIndex++];
      if (!row) break;
      const stack = row.querySelector('.message-stack');
      if (!stack) continue;

      if (message.role === 'user') {
        renderIfChanged(stack.querySelector('.message-bubble'), message.text || '');
        continue;
      }

      const segments = Array.isArray(message.segments)
        ? message.segments.filter(part => part?.type === 'text')
        : (message.text ? [{type:'text', text:String(message.text)}] : []);
      const bubbles = [...stack.querySelectorAll(':scope > .message-bubble')];
      segments.forEach((part, index) => renderIfChanged(bubbles[index], part.text || ''));
    }
  }

  function renderMarkdownWidgets() {
    const conversation = document.getElementById('conversation');
    if (!window.RogerVIBMarkdown || !conversation) return;

    const all = read(WIDGET_KEY, {});
    const widgets = Array.isArray(all[activeChatId()]) ? all[activeChatId()] : [];
    for (const spec of widgets) {
      if (spec?.closed || spec?.type !== 'markdown') continue;
      const row = conversation.querySelector(`.rogervib-widget-row[data-widget-id="${CSS.escape(String(spec.id))}"]`);
      renderIfChanged(row?.querySelector('.rv2-markdown'), spec.data?.content || '');
    }
  }

  function scan() {
    scheduled = false;
    if (rendering) return;
    rendering = true;
    try {
      renderChatRows();
      renderMarkdownWidgets();
    } finally {
      rendering = false;
    }
  }

  function schedule() {
    if (scheduled || rendering) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  window.addEventListener('DOMContentLoaded', () => {
    const conversation = document.getElementById('conversation');
    if (conversation) {
      new MutationObserver(schedule).observe(conversation, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      });
    }
    schedule();
  });
  window.addEventListener('storage', schedule);
  window.RogerVIBRefreshMarkdown = schedule;
})();
