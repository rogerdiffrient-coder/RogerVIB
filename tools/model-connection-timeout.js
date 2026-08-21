// Real Ollama connection wrapper: request Chrome Local Network Access and time out /api/tags.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const isOllama = url => /^http:\/\/(localhost|127\.0\.0\.1):11434(?:\/|$)/.test(url);

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    if (!isOllama(url)) return nativeFetch(input, init);

    const nextInit = {
      ...init,
      // Chrome's Local Network Access permission for public HTTPS -> loopback.
      // Unsupported browsers ignore unknown RequestInit members.
      targetAddressSpace: 'local'
    };

    if (!/\/api\/tags(?:\?|$)/.test(url)) return nativeFetch(input, nextInit);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const externalSignal = init?.signal;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', () => controller.abort(), {once:true});
    }

    return nativeFetch(input, {...nextInit, signal:controller.signal})
      .finally(() => clearTimeout(timer));
  };
})();