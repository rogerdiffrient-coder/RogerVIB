// Completes RogerVIB's lightweight in-chat Markdown renderer without allowing raw HTML.
(() => {
  const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
  let scheduled = false;

  function replaceInline(node) {
    const text = node.nodeValue || '';
    const pattern = /(\[([^\]\n]+)\]\(([^)\s]+)\)|~~([^~\n]+)~~)/g;
    if (!pattern.test(text)) return;
    pattern.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > last) frag.append(document.createTextNode(text.slice(last, match.index)));
      if (match[2] !== undefined) {
        const label = match[2];
        const href = match[3];
        if (SAFE_LINK.test(href)) {
          const a = document.createElement('a');
          a.href = href;
          a.textContent = label;
          if (!href.toLowerCase().startsWith('mailto:')) {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
          }
          frag.append(a);
        } else {
          frag.append(document.createTextNode(match[0]));
        }
      } else {
        const del = document.createElement('del');
        del.textContent = match[4];
        frag.append(del);
      }
      last = match.index + match[0].length;
    }
    if (last < text.length) frag.append(document.createTextNode(text.slice(last)));
    node.replaceWith(frag);
  }

  function enhanceBubble(bubble) {
    // Fallback for blockquotes that arrived while the response was streaming.
    bubble.querySelectorAll(':scope > p').forEach(p => {
      const text = p.textContent || '';
      if (/^\s*>\s?/.test(text)) {
        const quote = document.createElement('blockquote');
        quote.textContent = text.replace(/^\s*>\s?/, '');
        p.replaceWith(quote);
      }
    });

    const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('pre, code, a, del')) return NodeFilter.FILTER_REJECT;
        return /\[[^\]]+\]\([^)]+\)|~~[^~]+~~/.test(node.nodeValue || '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(replaceInline);
  }

  function scan() {
    scheduled = false;
    document.querySelectorAll('.message-bubble.markdown').forEach(enhanceBubble);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  window.addEventListener('DOMContentLoaded', () => {
    const conversation = document.getElementById('conversation');
    if (conversation) new MutationObserver(schedule).observe(conversation, { childList:true, subtree:true, characterData:true });
    schedule();
  });
})();
