// RogerVIB Coding workspace v2.
// Multi-file in-browser project workspace with a sandboxed live preview.
(() => {
  if (!window.RogerVIBTools) throw new Error('RogerVIBTools must load before coding-workspace');

  const STORAGE_KEY = 'rogervib_coding_workspace_v2';
  let dock = null;
  let editor = null;
  let preview = null;
  let fileList = null;
  let titleLabel = null;
  let currentFileLabel = null;
  let workingLabel = null;
  let previewTimer = null;
  let activePath = 'index.html';

  const starterFiles = {
    'index.html': `<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>RogerVIB Preview</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <h1>Hello from RogerVIB 👋</h1>\n  <script src="script.js"></script>\n</body>\n</html>`,
    'styles.css': `body {\n  font-family: system-ui, sans-serif;\n  padding: 2rem;\n  background: #f7f7fb;\n  color: #17171b;\n}`,
    'script.js': `console.log('RogerVIB preview ready');`
  };

  function readState() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  }

  function normalizePath(path) {
    return String(path || '').replace(/^\.\//, '').replace(/^\/+/, '').trim();
  }

  function getState() {
    const saved = readState();
    const files = saved.files && typeof saved.files === 'object' && !Array.isArray(saved.files)
      ? {...saved.files}
      : {...starterFiles};
    if (!Object.keys(files).length) Object.assign(files, starterFiles);
    return {
      open: !!saved.open,
      title: String(saved.title || 'Coding'),
      files,
      activePath: files[saved.activePath] !== undefined ? saved.activePath : (files['index.html'] !== undefined ? 'index.html' : Object.keys(files)[0])
    };
  }

  let state = getState();
  activePath = state.activePath;

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      open: !!dock && !dock.classList.contains('hidden'),
      title: titleLabel?.textContent || state.title || 'Coding',
      files: state.files,
      activePath
    }));
  }

  function escapeScriptClose(code) {
    return String(code).replace(/<\/script/gi, '<\\/script');
  }

  function escapeStyleClose(code) {
    return String(code).replace(/<\/style/gi, '<\\/style');
  }

  function buildPreviewDocument() {
    let entry = state.files['index.html'];
    if (typeof entry !== 'string') {
      const htmlPath = Object.keys(state.files).find(name => /\.html?$/i.test(name));
      entry = htmlPath ? state.files[htmlPath] : '<!doctype html><html><body><h1>No HTML entry file</h1></body></html>';
    }

    let html = String(entry);

    // Inline local stylesheet files so relative project files work inside srcdoc.
    html = html.replace(/<link\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi, (full, before, href, after) => {
      const path = normalizePath(href.split(/[?#]/)[0]);
      if (/^(?:https?:|data:|blob:|\/\/)/i.test(href) || typeof state.files[path] !== 'string') return full;
      return `<style data-rogervib-file="${path.replace(/"/g, '&quot;')}">${escapeStyleClose(state.files[path])}</style>`;
    });

    // Inline local JavaScript files. Preserve module/classic type when supplied.
    html = html.replace(/<script\b([^>]*?)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (full, before, src, after) => {
      const path = normalizePath(src.split(/[?#]/)[0]);
      if (/^(?:https?:|data:|blob:|\/\/)/i.test(src) || typeof state.files[path] !== 'string') return full;
      const attrs = `${before || ''} ${after || ''}`.replace(/\s*src=["'][^"']+["']/i, '');
      return `<script${attrs} data-rogervib-file="${path.replace(/"/g, '&quot;')}">${escapeScriptClose(state.files[path])}<\/script>`;
    });

    return html;
  }

  function renderPreview() {
    if (!preview) return;
    try {
      preview.srcdoc = buildPreviewDocument();
      if (workingLabel && workingLabel.dataset.manual !== 'true') workingLabel.textContent = 'Preview updated';
    } catch (error) {
      preview.srcdoc = `<!doctype html><body style="font-family:system-ui;padding:20px"><h2>Preview error</h2><pre>${String(error?.message || error).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre></body>`;
    }
    persist();
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 160);
  }

  function syncEditorToFile() {
    if (!editor || !activePath) return;
    state.files[activePath] = editor.value;
    persist();
  }

  function chooseFile(path) {
    path = normalizePath(path);
    if (state.files[path] === undefined) return false;
    syncEditorToFile();
    activePath = path;
    editor.value = state.files[path];
    if (currentFileLabel) currentFileLabel.textContent = path;
    renderFileList();
    persist();
    return true;
  }

  function renderFileList() {
    if (!fileList) return;
    fileList.innerHTML = '';
    const paths = Object.keys(state.files).sort((a,b) => {
      if (a === 'index.html') return -1;
      if (b === 'index.html') return 1;
      return a.localeCompare(b);
    });
    for (const path of paths) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `coding-file${path === activePath ? ' active' : ''}`;
      button.textContent = path;
      button.title = path;
      button.addEventListener('click', () => chooseFile(path));
      fileList.appendChild(button);
    }
  }

  function setWorking(text = 'Working…', active = true) {
    if (!workingLabel) ensureDock();
    if (!workingLabel) return;
    workingLabel.dataset.manual = active ? 'true' : 'false';
    workingLabel.textContent = text;
    workingLabel.classList.toggle('active', !!active);
    dock?.classList.toggle('coding-working', !!active);
  }

  function writeFile(path, content) {
    path = normalizePath(path);
    if (!path) throw new Error('path is required');
    state.files[path] = String(content ?? '');
    if (!activePath || activePath === path || !state.files[activePath]) activePath = path;
    if (editor && activePath === path) editor.value = state.files[path];
    if (currentFileLabel) currentFileLabel.textContent = activePath;
    renderFileList();
    renderPreview();
    persist();
    return path;
  }

  function deleteFile(path) {
    path = normalizePath(path);
    if (state.files[path] === undefined) throw new Error(`file not found: ${path}`);
    delete state.files[path];
    if (!Object.keys(state.files).length) state.files['index.html'] = '';
    if (activePath === path) activePath = state.files['index.html'] !== undefined ? 'index.html' : Object.keys(state.files)[0];
    if (editor) editor.value = state.files[activePath] || '';
    if (currentFileLabel) currentFileLabel.textContent = activePath;
    renderFileList();
    renderPreview();
    persist();
  }

  function renameFile(path, newPath) {
    path = normalizePath(path);
    newPath = normalizePath(newPath);
    if (!newPath) throw new Error('new_path is required');
    if (state.files[path] === undefined) throw new Error(`file not found: ${path}`);
    if (path !== newPath && state.files[newPath] !== undefined) throw new Error(`file already exists: ${newPath}`);
    state.files[newPath] = state.files[path];
    if (path !== newPath) delete state.files[path];
    if (activePath === path) activePath = newPath;
    if (editor) editor.value = state.files[activePath] || '';
    if (currentFileLabel) currentFileLabel.textContent = activePath;
    renderFileList();
    renderPreview();
    persist();
  }

  function closeWorkspace() {
    if (!dock) return;
    syncEditorToFile();
    dock.classList.add('hidden');
    document.body.classList.remove('coding-workspace-open');
    persist();
  }

  function openWorkspace({title='Coding'} = {}) {
    ensureDock();
    state.title = String(title || 'Coding').slice(0,80);
    titleLabel.textContent = state.title;
    dock.classList.remove('hidden');
    document.body.classList.add('coding-workspace-open');
    chooseFile(activePath);
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
    titleLabel.textContent = state.title;
    currentFileLabel = document.createElement('span');
    currentFileLabel.className = 'coding-workspace-filename';
    currentFileLabel.textContent = activePath;
    headingWrap.append(titleLabel,currentFileLabel);

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
    headerActions.append(refresh,close);
    header.append(headingWrap,headerActions);

    const status = document.createElement('div');
    status.className = 'coding-working-row';
    workingLabel = document.createElement('span');
    workingLabel.className = 'coding-working-label';
    workingLabel.dataset.manual = 'false';
    workingLabel.textContent = 'Ready';
    status.appendChild(workingLabel);

    const body = document.createElement('div');
    body.className = 'coding-workspace-body coding-workspace-body-v2';

    const codeArea = document.createElement('section');
    codeArea.className = 'coding-editor-section coding-editor-v2';
    const codeTop = document.createElement('div');
    codeTop.className = 'coding-code-top';
    const filesHeading = document.createElement('span');
    filesHeading.className = 'coding-pane-label-inline';
    filesHeading.textContent = 'FILES';
    const codeHeading = document.createElement('span');
    codeHeading.className = 'coding-pane-label-inline';
    codeHeading.textContent = 'CODE';
    codeTop.append(filesHeading,codeHeading);

    const editorGrid = document.createElement('div');
    editorGrid.className = 'coding-editor-grid';
    fileList = document.createElement('nav');
    fileList.className = 'coding-file-list';
    editor = document.createElement('textarea');
    editor.id = 'codingWorkspaceEditor';
    editor.className = 'coding-workspace-editor';
    editor.spellcheck = false;
    editor.setAttribute('aria-label','Code editor');
    editor.value = state.files[activePath] || '';
    editor.addEventListener('input', () => {
      state.files[activePath] = editor.value;
      persist();
      schedulePreview();
    });
    editorGrid.append(fileList,editor);
    codeArea.append(codeTop,editorGrid);

    const previewSection = document.createElement('section');
    previewSection.className = 'coding-preview-section';
    const previewBar = document.createElement('div');
    previewBar.className = 'coding-pane-label coding-preview-label';
    previewBar.innerHTML = '<span>LIVE PREVIEW</span><span class="coding-live-dot">●</span>';
    preview = document.createElement('iframe');
    preview.id = 'codingWorkspacePreview';
    preview.className = 'coding-workspace-preview';
    preview.title = 'Live preview';
    preview.setAttribute('sandbox','allow-scripts allow-forms allow-modals allow-popups');
    previewSection.append(previewBar,preview);

    body.append(codeArea,previewSection);
    dock.append(header,status,body);
    const shell = document.querySelector('.app-shell');
    (shell || document.body).appendChild(dock);

    renderFileList();
    if (state.open) {
      dock.classList.remove('hidden');
      document.body.classList.add('coding-workspace-open');
    }
    renderPreview();
    return dock;
  }

  RogerVIBTools.register({
    name: 'coding_workspace',
    description: 'Manage RogerVIB’s multi-file Coding workspace and live browser preview. You can open the workspace, list/read files, create or overwrite files, delete files, and rename files. For web projects, use index.html plus separate CSS/JS files when useful. Relative <link href="..."> and <script src="..."></script> references to workspace files are bundled into the live preview automatically. Use write repeatedly to build multi-file projects instead of stuffing everything into one file.',
    parameters: {
      type:'object',
      required:['action'],
      properties:{
        action:{type:'string',enum:['open','list','read','write','delete','rename','preview']},
        title:{type:'string',description:'Optional workspace title.'},
        path:{type:'string',description:'File path for read/write/delete/rename.'},
        new_path:{type:'string',description:'Destination path for rename.'},
        content:{type:'string',description:'Complete file contents for write.'}
      }
    },
    async run(args={}) {
      ensureDock();
      const action = String(args.action || 'open').toLowerCase();
      if (args.title) { state.title = String(args.title).slice(0,80); titleLabel.textContent = state.title; }

      if (action === 'open') {
        openWorkspace({title:args.title || state.title});
        return {opened:true,files:Object.keys(state.files),active_file:activePath,live_preview:true};
      }
      if (action === 'list') return {files:Object.keys(state.files),active_file:activePath};
      if (action === 'read') {
        const path = normalizePath(args.path);
        if (state.files[path] === undefined) throw new Error(`file not found: ${path}`);
        return {path,content:state.files[path]};
      }
      if (action === 'write') {
        setWorking(`Writing ${normalizePath(args.path) || 'file'}…`,true);
        const path = writeFile(args.path,args.content);
        openWorkspace({title:args.title || state.title});
        setWorking('Ready',false);
        return {written:true,path,files:Object.keys(state.files),preview_updated:true};
      }
      if (action === 'delete') {
        setWorking(`Removing ${normalizePath(args.path)}…`,true);
        deleteFile(args.path);
        setWorking('Ready',false);
        return {deleted:true,path:normalizePath(args.path),files:Object.keys(state.files),preview_updated:true};
      }
      if (action === 'rename') {
        setWorking(`Renaming ${normalizePath(args.path)}…`,true);
        renameFile(args.path,args.new_path);
        setWorking('Ready',false);
        return {renamed:true,from:normalizePath(args.path),to:normalizePath(args.new_path),files:Object.keys(state.files),preview_updated:true};
      }
      if (action === 'preview') {
        renderPreview();
        openWorkspace({title:args.title || state.title});
        return {preview_updated:true,entry:state.files['index.html'] !== undefined ? 'index.html' : null};
      }
      throw new Error(`unsupported coding action: ${action}`);
    }
  });

  window.addEventListener('DOMContentLoaded', ensureDock);
  window.RogerVIBCoding = {
    openWorkspace,closeWorkspace,renderPreview,setWorking,
    writeFile,deleteFile,renameFile,
    listFiles:() => Object.keys(state.files),
    readFile:path => state.files[normalizePath(path)]
  };
})();
