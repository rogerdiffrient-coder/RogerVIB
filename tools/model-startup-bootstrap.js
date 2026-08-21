// Bootstrap Ollama model discovery before main.js so startup can never hang on /api/tags.
(() => {
  const CACHE_KEY = 'rogervib_last_models_v1';
  const FALLBACK_MODELS = ['gemma4:cloud','minimax-m3:cloud','qwen3.5:cloud','kimi-k2.7-code:cloud'];
  const nativeFetch = window.fetch.bind(window);

  const readCache = () => {
    try {
      const value = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
    } catch { return []; }
  };

  const unique = values => [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))];
  const cached = unique(readCache());
  const startupModels = unique([...cached, ...FALLBACK_MODELS]);

  // Give the native select useful values before main.js/model-controls even start.
  const select = document.getElementById('modelPicker');
  if (select && startupModels.length) {
    select.innerHTML = '';
    for (const model of startupModels) {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      select.append(option);
    }
    const preferred = localStorage.getItem('rogervib_preferred_model_v1');
    select.value = startupModels.includes(preferred) ? preferred : (startupModels.includes('gemma4:cloud') ? 'gemma4:cloud' : startupModels[0]);
    select.disabled = false;
  }

  function syntheticTags(models) {
    return new Response(JSON.stringify({models: unique(models).map(name => ({name, model:name}))}), {
      status: 200,
      headers: {'Content-Type':'application/json'}
    });
  }

  async function refreshRealTags(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await nativeFetch(url, {...(init || {}), cache:'no-store', signal:controller.signal});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.clone().json();
      const detected = Array.isArray(data?.models) ? data.models.map(item => item?.name || item?.model).filter(Boolean) : [];
      if (detected.length) localStorage.setItem(CACHE_KEY, JSON.stringify(unique([...FALLBACK_MODELS, ...detected])));
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  // main.js calls /api/tags during startup. Never let that call block the whole app.
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    if (!/\/api\/tags(?:\?|$)/.test(url)) return nativeFetch(input, init);

    // Return known models immediately. Refresh the real Ollama list in the background.
    refreshRealTags(input, init).catch(error => console.warn('Ollama tag refresh failed:', error));
    return syntheticTags(startupModels);
  };
})();