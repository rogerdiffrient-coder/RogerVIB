// Extra Coding UX: true visible write animation + robust live preview + fullscreen preview.
(() => {
  const STORAGE_KEY = 'rogervib_coding_workspace_v2';
  if (!window.RogerVIBTools) return;

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch { return {}; }
  }

  function normalizePath(path) { return String(path || '').replace(/^\.\//,'').replace(/^\/+/, '').trim(); }
  function escScript(code) { return String(code).replace(/<\/script/gi, '<\\/script'); }
  function escStyle(code) { return String(code).replace(/<\/style/gi, '<\\/style'); }

  function buildPreview() {
    const state = readState();
    const files = state.files && typeof state.files === 'object' ? state.files : {};
    let html = String(files['index.html'] ?? '<!doctype html><html><body><h2>no index.html yet</h2></body></html>');
    html = html.replace(/<link\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi, (full, before, href) => {
      const path = normalizePath(href.split(/[?#]/)[0]);
      if (/^(?:https?:|data:|blob:|\/\/)/i.test(href) || typeof files[path] !== 'string') return full;
      return `<style data-rv-file="${path.replace(/"/g,'&quot;')}">${escStyle(files[path])}</style>`;
    });
    html = html.replace(/<script\b([^>]*?)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (full, before, src, after) => {
      const path = normalizePath(src.split(/[?#]/)[0]);
      if (/^(?:https?:|data:|blob:|\/\/)/i.test(src) || typeof files[path] !== 'string') return full;
      return `<script ${before || ''} ${after || ''} data-rv-file="${path.replace(/"/g,'&quot;')}">${escScript(files[path])}<\/script>`;
    });
    return html;
  }

  function refreshPreview() {
    const frame = document.getElementById('codingWorkspacePreview');
    if (!frame) return;
    const doc = buildPreview();
    // Force an actual navigation so browsers do not occasionally keep stale srcdoc.
    frame.removeAttribute('src');
    frame.srcdoc = '<!doctype html><html><body></body></html>';
    requestAnimationFrame(() => { frame.srcdoc = doc; });
  }

  function addFullscreenButton() {
    const bar = document.querySelector('.coding-preview-label');
    if (!bar || bar.querySelector('.coding-fullscreen-button')) return;
    const right = document.createElement('span');
    right.className = 'coding-preview-actions';
    const dot = bar.querySelector('.coding-live-dot');
    if (dot) right.appendChild(dot);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'coding-fullscreen-button';
    button.textContent = '⛶';
    button.title = 'Fullscreen preview';
    button.setAttribute('aria-label', 'Fullscreen preview');
    button.addEventListener('click', () => {
      const section = document.querySelector('.coding-preview-section');
      if (!section) return;
      section.classList.toggle('coding-preview-fullscreen');
      button.textContent = section.classList.contains('coding-preview-fullscreen') ? '×' : '⛶';
    });
    right.appendChild(button);
    bar.appendChild(right);
  }

  async function typeFile(path, content) {
    const target = normalizePath(path);
    const fileButton = [...document.querySelectorAll('.coding-file')].find(btn => btn.title === target || btn.textContent === target);
    fileButton?.click();
    const editor = document.getElementById('codingWorkspaceEditor');
    if (!editor) return;
    const final = String(content ?? '');
    const start = editor.value;
    if (start === final) { refreshPreview(); return; }

    // Show actual visible progress. Larger files use chunks so it stays fast.
    editor.value = '';
    editor.dispatchEvent(new Event('input', {bubbles:true}));
    const total = final.length;
    const chunks = Math.min(90, Math.max(18, Math.ceil(total / 80)));
    for (let i = 1; i <= chunks; i++) {
      const end = Math.round(total * i / chunks);
      editor.value = final.slice(0, end);
      editor.selectionStart = editor.selectionEnd = editor.value.length;
      editor.dispatchEvent(new Event('input', {bubbles:true}));
      editor.scrollTop = editor.scrollHeight;
      if (i % 2 === 0) refreshPreview();
      await new Promise(resolve => setTimeout(resolve, 14));
    }
    editor.value = final;
    editor.dispatchEvent(new Event('input', {bubbles:true}));
    refreshPreview();
  }

  const originalRun = window.RogerVIBTools.run.bind(window.RogerVIBTools);
  window.RogerVIBTools.run = async function(name, args = {}) {
    if (name !== 'coding_workspace') return originalRun(name, args);
    const action = String(args?.action || 'open');
    window.RogerVIBCoding?.setWorking?.(action === 'write' ? `writing ${normalizePath(args.path) || 'file'}...` : 'working...', true);
    const result = await originalRun(name, args);
    addFullscreenButton();
    if (action === 'write') await typeFile(args.path, args.content);
    else refreshPreview();
    window.RogerVIBCoding?.setWorking?.('ready', false);
    window.dispatchEvent(new CustomEvent('rogervib:coding-updated'));
    return result;
  };

  window.addEventListener('DOMContentLoaded', () => {
    const wait = setInterval(() => {
      if (!document.getElementById('codingWorkspace')) return;
      clearInterval(wait);
      addFullscreenButton();
      refreshPreview();
      document.getElementById('codingWorkspaceEditor')?.addEventListener('input', () => setTimeout(refreshPreview, 100));
    }, 60);
  });
})();