// One Markdown renderer shared by RogerVIB chat and Markdown widgets.
(() => {
  function fallbackEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
    })[ch]);
  }

  function render(source) {
    const text = String(source ?? '');
    if (!window.marked || !window.DOMPurify) {
      return fallbackEscape(text).replace(/\n/g, '<br>');
    }

    const raw = window.marked.parse(text, {
      gfm: true,
      breaks: true
    });

    return window.DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true }
    });
  }

  function renderInto(element, source) {
    if (!element) return;
    element.classList.add('markdown');
    element.innerHTML = render(source);
    element.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (!/^(https?:|mailto:)/i.test(href)) {
        link.replaceWith(document.createTextNode(link.textContent || href));
        return;
      }
      if (!href.toLowerCase().startsWith('mailto:')) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
    });
  }

  window.RogerVIBMarkdown = { render, renderInto };
})();
