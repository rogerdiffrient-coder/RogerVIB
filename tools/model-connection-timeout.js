// Real Ollama connection wrapper: request Chrome Local Network Access and make model discovery truthful.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const LOCALHOST = 'http://localhost:11434';
  const LOOPBACK = 'http://127.0.0.1:11434';
  const isOllama = url => /^http:\/\/(localhost|127\.0\.0\.1):11434(?:\/|$)/.test(url);
  const isTags = url => /\/api\/tags(?:\?|$)/.test(url);

  async function timedFetch(url, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const externalSignal = init?.signal;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', () => controller.abort(), {once:true});
    }
    try {
      return await nativeFetch(url, {
        ...init,
        signal: controller.signal,
        targetAddressSpace: 'local',
        cache: 'no-store'
      });
    } finally {
      clearTimeout(timer);
    }
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    if (!isOllama(url)) return nativeFetch(input, init);

    const nextInit = {...init, targetAddressSpace:'local'};

    // main.js asks localhost for /api/tags. If localhost itself is the problem,
    // transparently retry the loopback IP before declaring Ollama unreachable.
    if (isTags(url)) {
      try {
        const first = await timedFetch(url, nextInit);
        if (first.ok) return first;
        return first;
      } catch (firstError) {
        if (url.startsWith(LOCALHOST)) {
          const retryUrl = url.replace(LOCALHOST, LOOPBACK);
          try {
            return await timedFetch(retryUrl, nextInit);
          } catch (secondError) {
            console.error('RogerVIB could not reach Ollama model list on localhost or 127.0.0.1', {firstError, secondError});
            throw secondError;
          }
        }
        throw firstError;
      }
    }

    return nativeFetch(input, nextInit);
  };
})();