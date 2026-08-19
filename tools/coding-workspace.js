// RogerVIB Coding workspace.
// Opens a right-side editable HTML workspace with a sandboxed live preview.
(() => {
  if (!window.RogerVIBTools) throw new Error('RogerVIBTools must load before coding-workspace');

  const STORAGE_KEY = 'rogervib_coding_workspace_v1';
  let dock = null;
  let editor = null;
  let preview = null;
  let filenameLabel = null;
  let titleLabel = null;
  let previewTimer = null;

  const fallbackHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RogerVIB Preview</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; }
  </style>
</head>
<body>
  <h1>Hello from RogerVIB 👋</h1>
</body>
</html>`;

  function readState() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  }

  function saveState() {
    if (!editor) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      open: !!dock && !dock.classList.contains('hidden'),
      title: titleLabel?.textContent || 'Coding',
      filename: filenameLabel?.textContent || 'index.html',
      code: editor.value
    }));
  }

  function renderPreview() {
    if (!preview || !editor) return;
    preview.srcdoc = editor.value || fallbackHtml;
    saveState();
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 180);
  }

  function closeWorkspace() {
    if (!dock) return;
    dock.classList.add('hidden');
    document.body.classList.remove('coding-workspace-open');
    saveState();
  }

  function openWorkspace({ title='Coding', filename='index.html', code, replace=true } = {}) {
    ensureDock();
    titleLabel.textContent = String(title || 'Coding').slice(0, 80);
    filenameLabel.textContent = String(filename || 'index.html').slice(0, 100);
    if (typeof code === 'string') {
      if (replace || !editor.value.trim()) editor.value = code;
      else editor.value += `\n${code}`;
    }
    dock.classList.remove('hidden');
    document.body.classList.add('coding-workspace-open');
    renderPreview();
    editor.focus();
  }

  function ensureDock() {
    if (dock) return dock;

    dock = document.createElement('aside');
    dock.id = 'codingWorkspace';
    dock.className = 'coding-workspace hidden';

    const header = document.createElement('div');
    header.className = 'coding-workspace-header';

    const headingWrap = document.createElement('div');
    headingWrap.className = 'coding-workspace-heading';
    titleLabel = document.createElement('strong');
    titleLabel.className = 'coding-workspace-title';
    titleLabel.textContent = 'Coding';
    filenameLabel = document.createElement('span');
    filenameLabel.className = 'coding-workspace-filename';
    filenameLabel.textContent = 'index.html';
    headingWrap.append(titleLabel, filenameLabel);

    const headerActions = document.createElement('div');
    headerActions.className = 'coding-workspace-header-actions';

    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'coding-workspace-icon-button';
    refresh.textContent = '↻';
    refresh.title = 'Refresh preview';
    refresh.addEventListener('click', renderPreview);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'coding-workspace-icon-button';
    close.textContent = '×';
    close.title = 'Close coding workspace';
    close.addEventListener('click', closeWorkspace);

    headerActions.append(refresh, close);
    header.append(headingWrap, headerActions);

    const body = document.createElement('div');
    body.className = 'coding-workspace-body';

    const editorSection = document.createElement('section');
    editorSection.className = 'coding-editor-section';
    const editorBar = document.createElement('div');
    editorBar.className = 'coding-pane-label';
    editorBar.textContent = 'CODE';
    editor = document.createElement('textarea');
    editor.id = 'codingWorkspaceEditor';
    editor.className = 'coding-workspace-editor';
    editor.spellcheck = false;
    editor.setAttribute('aria-label', 'Code editor');
    editor.addEventListener('input', schedulePreview);
    editorSection.append(editorBar, editor);

    const previewSection = document.createElement('section');
    previewSection.className = 'coding-preview-section';
    const previewBar = document.createElement('div');
    previewBar.className = 'coding-pane-label coding-preview-label';
    previewBar.innerHTML = '<span>LIVE PREVIEW</span><span class="coding-live-dot">●</span>';
    preview = document.createElement('iframe');
    preview.id = 'codingWorkspacePreview';
    preview.className = 'coding-workspace-preview';
    preview.title = 'Live preview';
    // Scripts may run, but the preview cannot access RogerVIB's DOM/origin.
    preview.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
    previewSection.append(previewBar, preview);

    body.append(editorSection, previewSection);
    dock.append(header, body);

    const shell = document.querySelector('.app-shell');
    if (shell) shell.appendChild(dock);
    else document.body.appendChild(dock);

    const saved = readState();
    editor.value = typeof saved.code === 'string' ? saved.code : fallbackHtml;
    titleLabel.textContent = saved.title || 'Coding';
    filenameLabel.textContent = saved.filename || 'index.html';
    if (saved.open) {
      dock.classList.remove('hidden');
      document.body.classList.add('coding-workspace-open');
    }
    renderPreview();
    return dock;
  }

  RogerVIBTools.register({
    name: 'coding_workspace',
    description: 'Open or update RogerVIB’s right-side coding workspace. The workspace has an editable HTML file and a sandboxed live preview that updates while the user types. Use this when the user asks to build, prototype, edit, or preview a small webpage or HTML/CSS/JS demo. Put CSS and JavaScript inside the HTML document for now.',
    parameters: {
      type: 'object',
      properties: {
        title: { type:'string', description:'Short workspace title.' },
        filename: { type:'string', description:'Displayed filename, usually index.html.' },
        code: { type:'string', description:'Complete HTML document to place in the editor.' },
        replace: { type:'boolean', description:'Replace the current editor contents. Defaults to true.' }
      }
    },
    async run(args = {}) {
      openWorkspace({
        title: args.title || 'Coding',
        filename: args.filename || 'index.html',
        code: typeof args.code === 'string' ? args.code : undefined,
        replace: args.replace !== false
      });
      return {
        opened: true,
        filename: filenameLabel.textContent,
        live_preview: true,
        sandboxed: true,
        note: 'The coding workspace is visible on the right. The user can edit the HTML and the preview updates live.'
      };
    }
  });

  window.addEventListener('DOMContentLoaded', ensureDock);
  window.RogerVIBCoding = { openWorkspace, closeWorkspace, renderPreview };
})();
