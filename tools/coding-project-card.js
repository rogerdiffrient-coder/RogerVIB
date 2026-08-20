// Persistent recovery card for a RogerVIB Coding project after it has been edited.
(() => {
  const STORAGE_KEY = 'rogervib_coding_workspace_v2';
  const STARTER = {
    'index.html': `<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>RogerVIB Preview</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <h1>Hello from RogerVIB 👋</h1>\n  <script src="script.js"></script>\n</body>\n</html>`,
    'styles.css': `body {\n  font-family: system-ui, sans-serif;\n  padding: 2rem;\n  background: #f7f7fb;\n  color: #17171b;\n}`,
    'script.js': `console.log('RogerVIB preview ready');`
  };
  let rendering = false;
  let timer = null;

  function readState() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  }

  function projectWasEdited(state) {
    const files = state.files && typeof state.files === 'object' && !Array.isArray(state.files) ? state.files : null;
    if (!files) return false;
    const names = Object.keys(files).sort();
    const starterNames = Object.keys(STARTER).sort();
    if (names.length !== starterNames.length || names.some((name, i) => name !== starterNames[i])) return true;
    return names.some(name => String(files[name]) !== String(STARTER[name]));
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(renderCard, 50);
  }

  function renderCard() {
    if (rendering) return;
    const conversation = document.getElementById('conversation');
    if (!conversation) return;
    rendering = true;
    conversation.querySelectorAll('.coding-project-card-row').forEach(node => node.remove());

    const state = readState();
    const files = state.files && typeof state.files === 'object' && !Array.isArray(state.files) ? state.files : null;
    const names = files ? Object.keys(files) : [];
    if (!names.length || !projectWasEdited(state)) { rendering = false; return; }

    const row = document.createElement('div');
    row.className = 'coding-project-card-row';
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'coding-project-card';

    const icon = document.createElement('div');
    icon.className = 'coding-project-card-icon';
    icon.textContent = '</>';

    const text = document.createElement('div');
    text.className = 'coding-project-card-text';
    const title = document.createElement('strong');
    title.textContent = state.title || 'Coding Project';
    const meta = document.createElement('span');
    meta.textContent = `${names.length} file${names.length === 1 ? '' : 's'} • ${state.activePath || (names.includes('index.html') ? 'index.html' : names[0])}`;
    text.append(title, meta);

    const action = document.createElement('span');
    action.className = 'coding-project-card-open';
    action.textContent = 'Open →';

    card.append(icon, text, action);
    card.addEventListener('click', () => window.RogerVIBCoding?.openWorkspace?.({title: state.title || 'Coding Project'}));
    row.appendChild(card);
    conversation.appendChild(row);
    rendering = false;
  }

  window.addEventListener('DOMContentLoaded', () => {
    const conversation = document.getElementById('conversation');
    if (conversation) {
      new MutationObserver(mutations => {
        const onlyCardChanges = mutations.every(m => [...m.addedNodes, ...m.removedNodes].every(node => node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('coding-project-card-row')));
        if (!onlyCardChanges) schedule();
      }).observe(conversation, {childList:true});
    }

    const waitForWorkspace = setInterval(() => {
      const workspace = document.getElementById('codingWorkspace');
      if (!workspace) return;
      clearInterval(waitForWorkspace);
      new MutationObserver(schedule).observe(workspace, {childList:true,subtree:true,characterData:true,attributes:true});
      workspace.addEventListener('input', schedule, true);
    }, 100);

    schedule();
  });

  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) schedule(); });
  window.addEventListener('rogervib:coding-updated', schedule);
})();
