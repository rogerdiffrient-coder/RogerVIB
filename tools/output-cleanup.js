// Enforce RogerVIB's no-emoji chat style at the UI layer.
// Preserve code/pre content so generated source code is never modified.
(() => {
  const emojiPattern = /\p{Extended_Pictographic}|\uFE0F|\u200D/gu;

  function cleanNode(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('pre, code, .thinking-block')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const cleaned = node.nodeValue.replace(emojiPattern, '');
      if (cleaned !== node.nodeValue) node.nodeValue = cleaned.replace(/\s{2,}/g, ' ');
    }
  }

  function cleanAll() {
    document.querySelectorAll('#conversation .message-row.bot .message-bubble').forEach(cleanNode);
  }

  window.addEventListener('DOMContentLoaded', () => {
    const conversation = document.getElementById('conversation');
    if (!conversation) return;
    cleanAll();
    new MutationObserver(cleanAll).observe(conversation, {
      childList:true,
      subtree:true,
      characterData:true
    });
  });
})();