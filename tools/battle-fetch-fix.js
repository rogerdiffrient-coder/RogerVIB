// Fix Model Battle requests accidentally triggering a failing Ollama CORS preflight.
// Battle originally tagged requests with X-RogerVIB-Battle, but localhost:11434
// does not need that header and may reject it during Access-Control preflight.
(() => {
  const previousFetch = window.fetch.bind(window);

  window.fetch = function RogerVIBBattleFetchFix(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.includes('localhost:11434/api/chat')) return previousFetch(input, init);

    const headers = new Headers(init.headers || (typeof input !== 'string' ? input?.headers : undefined) || {});
    if (headers.has('X-RogerVIB-Battle')) headers.delete('X-RogerVIB-Battle');

    return previousFetch(input, {...init, headers});
  };
})();
