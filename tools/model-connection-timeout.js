// Add a timeout to real Ollama /api/tags requests. Do not fake model results.
(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    if (!/\/api\/tags(?:\?|$)/.test(url)) return nativeFetch(input, init);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const externalSignal = init?.signal;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', () => controller.abort(), {once:true});
    }

    return nativeFetch(input, {...init, signal: controller.signal})
      .finally(() => clearTimeout(timer));
  };
})();