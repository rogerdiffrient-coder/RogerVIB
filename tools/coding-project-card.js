// Persistent recovery card for the current RogerVIB Coding project.
(() => {
  const STORAGE_KEY = 'rogervib_coding_workspace_v2';
  let rendering = false;
  let timer = null;

  function readState() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(renderCard, 40);
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
    if (!names.length) { rendering = false; return; }

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
