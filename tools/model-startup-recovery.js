// Keep RogerVIB's model picker usable even if Ollama /api/tags stalls during startup.
(() => {
  const OLLAMA_BASE_URL = 'http://localhost:11434';
  const CACHE_KEY = 'rogervib_last_models_v1';
  const PREFERRED_KEY = 'rogervib_preferred_model_v1';
  const FALLBACK_MODELS = ['gemma4:cloud','minimax-m3:cloud','qwen3.5:cloud','kimi-k2.7-code:cloud'];

  const readJson = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; }
    catch { return fallback; }
  };

  function usableNames(names) {
    return [...new Set((names || []).map(x => String(x || '').trim()).filter(Boolean))];
  }

  function fill(select, names, dispatch = false) {
    names = usableNames(names);
    if (!select || !names.length) return false;
    const previous = select.value;
    const preferred = localStorage.getItem(PREFERRED_KEY) || '';
    select.innerHTML = '';
    for (const model of names) {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      select.append(option);
    }
    const next = names.includes(previous) ? previous : names.includes(preferred) ? preferred : names.includes('gemma4:cloud') ? 'gemma4:cloud' : names[0];
    select.value = next;
    select.disabled = false;
    if (dispatch) select.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  }

  async function fetchModels(timeoutMs = 3000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {cache:'no-store', signal:controller.signal});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return usableNames(Array.isArray(data.models) ? data.models.map(item => item?.name || item?.model) : []);
    } finally { clearTimeout(timer); }
  }

  function updateStatus(text) {
    const el = document.getElementById('modelDescription');
    if (el && /connecting|loading|ollama/i.test(el.textContent || '')) el.textContent = text;
  }

  window.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('modelPicker');
    if (!select) return;

    // Restore the last known list immediately instead of showing a dead loading state.
    const cached = usableNames(readJson(CACHE_KEY, []));
    if (cached.length) {
      fill(select, cached, false);
      updateStatus('Restored Ollama models • checking connection…');
    }

    // Let the core loader have a moment. If it is still stuck, recover ourselves.
    setTimeout(async () => {
      const stuck = select.disabled || !select.value || /connecting|loading/i.test(select.value) || /connecting|loading/i.test(select.textContent || '');
      if (!stuck) {
        const current = usableNames([...select.options].map(o => o.value).filter(Boolean));
        if (current.length) localStorage.setItem(CACHE_KEY, JSON.stringify(current));
        return;
      }

      try {
        const detected = await fetchModels(3000);
        const names = usableNames([...FALLBACK_MODELS, ...detected]);
        fill(select, names, true);
        localStorage.setItem(CACHE_KEY, JSON.stringify(names));
        updateStatus(`Connected to Ollama • ${names.length} models available`);
      } catch (error) {
        console.warn('RogerVIB startup model recovery:', error);
        const names = cached.length ? cached : FALLBACK_MODELS;
        fill(select, names, true);
        updateStatus('Ollama model check timed out • using saved models');
      }
    }, 1800);

    // Keep a fresh last-known-good model list whenever another loader updates the select.
    new MutationObserver(() => {
      const names = usableNames([...select.options].map(o => o.value).filter(v => v && !/connecting|no ollama/i.test(v)));
      if (names.length) localStorage.setItem(CACHE_KEY, JSON.stringify(names));
    }).observe(select, {childList:true, subtree:true});
  });
})();