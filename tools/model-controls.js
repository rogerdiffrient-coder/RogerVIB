// Custom model picker + per-user RogerVIB behavior controls.
(() => {
  const SASS_KEY = 'rogervib_sass_v1';
  const LENGTH_KEY = 'rogervib_reply_length_v1';
  const THINKING_KEY = 'rogervib_show_thinking_v1';
  const THINK_DEPTH_KEY = 'rogervib_thinking_depth_v1';
  const OLLAMA_BASE_URL = 'http://localhost:11434';

  const readNumber = (key, fallback) => {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) ? n : fallback;
  };
  const sassLevel = () => Math.max(0, Math.min(10, readNumber(SASS_KEY, 5)));
  const replyLength = () => ['short','normal','long'].includes(localStorage.getItem(LENGTH_KEY)) ? localStorage.getItem(LENGTH_KEY) : 'normal';
  const showThinking = () => localStorage.getItem(THINKING_KEY) !== '0';
  const thinkingDepth = () => ['quick','normal','deep'].includes(localStorage.getItem(THINK_DEPTH_KEY)) ? localStorage.getItem(THINK_DEPTH_KEY) : 'normal';

  function sassName(value) {
    if (value <= 1) return 'basically none';
    if (value <= 3) return 'chill';
    if (value <= 5) return 'playful';
    if (value <= 7) return 'snarky';
    if (value <= 9) return 'menace';
    return 'maximum goblin';
  }

  function syncThinkingVisibility() {
    document.body.classList.toggle('rv-hide-thinking', !showThinking());
  }

  window.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('modelPicker');
    const actions = document.querySelector('.composer-actions');
    if (!select || !actions || document.querySelector('.rv-model-shell')) return;

    select.classList.add('rv-native-model-picker');

    const shell = document.createElement('div');
    shell.className = 'rv-model-shell';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rv-model-button';
    button.setAttribute('aria-haspopup','listbox');
    button.setAttribute('aria-expanded','false');
    button.innerHTML = '<span class="rv-model-button-label">models</span><span class="rv-model-caret">▼</span>';

    const menu = document.createElement('div');
    menu.className = 'rv-model-menu';
    menu.hidden = true;
    menu.innerHTML = `
      <div class="rv-menu-title">Models</div>
      <div class="rv-model-list" role="listbox"></div>
      <div class="rv-control-section">
        <div class="rv-control-row"><span class="rv-control-label">Sass</span><span class="rv-control-value rv-sass-value"></span></div>
        <input class="rv-range rv-sass-slider" type="range" min="0" max="10" step="1" aria-label="Sass level">
        <div class="rv-range-labels"><span>0 nice</span><span>10 goblin</span></div>
      </div>
      <div class="rv-control-section">
        <div class="rv-control-row"><span class="rv-control-label">Reply length</span><span class="rv-control-value">default style</span></div>
        <div class="rv-length-group">
          <button type="button" class="rv-length-option" data-length="short">short</button>
          <button type="button" class="rv-length-option" data-length="normal">normal</button>
          <button type="button" class="rv-length-option" data-length="long">yap</button>
        </div>
        <div class="rv-control-row" style="margin-top:12px"><span class="rv-control-label">Thinking depth</span><span class="rv-control-value">reasoning effort</span></div>
        <div class="rv-length-group rv-thinking-depth-group">
          <button type="button" class="rv-length-option rv-think-option" data-depth="quick">quick</button>
          <button type="button" class="rv-length-option rv-think-option" data-depth="normal">normal</button>
          <button type="button" class="rv-length-option rv-think-option" data-depth="deep">deep</button>
        </div>
        <div class="rv-toggle-row"><span class="rv-control-label">Show thinking</span><button type="button" class="rv-toggle" aria-label="Toggle thinking visibility"></button></div>
      </div>
      <div class="rv-menu-footer">
        <button type="button" class="rv-refresh-models">Refresh Ollama models</button>
        <div class="rv-shortcuts">shortcuts: <code>/calc</code> <code>/wordle</code> <code>/code</code> <code>/clear</code></div>
      </div>`;

    shell.append(button, menu);
    actions.insertBefore(shell, select);

    const label = button.querySelector('.rv-model-button-label');
    const list = menu.querySelector('.rv-model-list');
    const sassSlider = menu.querySelector('.rv-sass-slider');
    const sassValue = menu.querySelector('.rv-sass-value');
    const thinkingToggle = menu.querySelector('.rv-toggle');
    const refreshButton = menu.querySelector('.rv-refresh-models');

    function updateLabel() {
      label.textContent = select.value || 'no model';
      label.title = select.value || '';
    }

    function renderModels() {
      list.innerHTML = '';
      const options = [...select.options].filter(option => option.value && !/connecting|no ollama/i.test(option.textContent || ''));
      for (const option of options) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `rv-model-option${option.value === select.value ? ' active' : ''}`;
        row.setAttribute('role','option');
        row.setAttribute('aria-selected', option.value === select.value ? 'true' : 'false');
        const badge = /:cloud$/i.test(option.value) ? 'cloud' : 'local';
        const check = document.createElement('span'); check.className = 'rv-model-check'; check.textContent = '✓';
        const name = document.createElement('span'); name.className = 'rv-model-name'; name.textContent = option.textContent || option.value;
        const tag = document.createElement('span'); tag.className = 'rv-model-badge'; tag.textContent = badge;
        row.append(check,name,tag);
        row.addEventListener('click', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change',{bubbles:true}));
          updateLabel(); renderModels(); closeMenu();
        });
        list.append(row);
      }
      if (!options.length) {
        const empty = document.createElement('div');
        empty.className = 'rv-shortcuts';
        empty.style.padding = '8px 10px';
        empty.textContent = 'no models loaded yet';
        list.append(empty);
      }
      updateLabel();
    }

    function renderControls() {
      const sass = sassLevel();
      sassSlider.value = String(sass);
      sassValue.textContent = `${sass}/10 · ${sassName(sass)}`;
      const length = replyLength();
      menu.querySelectorAll('.rv-length-option[data-length]').forEach(el => el.classList.toggle('active', el.dataset.length === length));
      const depth = thinkingDepth();
      menu.querySelectorAll('.rv-think-option').forEach(el => el.classList.toggle('active', el.dataset.depth === depth));
      thinkingToggle.classList.toggle('on', showThinking());
      thinkingToggle.setAttribute('aria-pressed', showThinking() ? 'true' : 'false');
      syncThinkingVisibility();
    }

    function openMenu() { menu.hidden = false; button.setAttribute('aria-expanded','true'); renderModels(); renderControls(); }
    function closeMenu() { menu.hidden = true; button.setAttribute('aria-expanded','false'); }

    button.addEventListener('click', () => menu.hidden ? openMenu() : closeMenu());
    document.addEventListener('pointerdown', event => { if (!shell.contains(event.target)) closeMenu(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

    sassSlider.addEventListener('input', () => {
      localStorage.setItem(SASS_KEY, String(sassSlider.value));
      renderControls();
    });
    menu.querySelectorAll('.rv-length-option[data-length]').forEach(el => el.addEventListener('click', () => {
      localStorage.setItem(LENGTH_KEY, el.dataset.length);
      renderControls();
    }));
    menu.querySelectorAll('.rv-think-option').forEach(el => el.addEventListener('click', () => {
      localStorage.setItem(THINK_DEPTH_KEY, el.dataset.depth);
      renderControls();
    }));
    thinkingToggle.addEventListener('click', () => {
      localStorage.setItem(THINKING_KEY, showThinking() ? '0' : '1');
      renderControls();
    });

    refreshButton.addEventListener('click', async () => {
      const old = refreshButton.textContent;
      refreshButton.textContent = 'Refreshing…';
      refreshButton.disabled = true;
      try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {cache:'no-store'});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const names = Array.isArray(data.models) ? data.models.map(item => item.name || item.model).filter(Boolean) : [];
        const pinned = ['minimax-m3:cloud'];
        const all = [...new Set([...pinned,...names])];
        const previous = select.value;
        select.innerHTML = '';
        for (const model of all) {
          const option = document.createElement('option'); option.value = model; option.textContent = model; select.append(option);
        }
        if (all.includes(previous)) select.value = previous;
        else if (all.length) { select.value = all[0]; select.dispatchEvent(new Event('change',{bubbles:true})); }
        renderModels();
        refreshButton.textContent = `Found ${all.length} model${all.length === 1 ? '' : 's'}`;
      } catch (error) {
        refreshButton.textContent = 'Refresh failed';
        console.warn('RogerVIB model refresh failed:', error);
      } finally {
        setTimeout(() => { refreshButton.textContent = old; refreshButton.disabled = false; }, 1200);
      }
    });

    select.addEventListener('change', () => { updateLabel(); renderModels(); });
    new MutationObserver(() => renderModels()).observe(select,{childList:true,subtree:true,attributes:true});

    renderModels(); renderControls();
    window.RogerVIBBehaviorSettings = { sassLevel, replyLength, showThinking, thinkingDepth };
  });
})();