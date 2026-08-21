// Mark RogerVIB -> Ollama requests as Chrome Local Network Access requests.
// Chrome 147+ may require explicit permission for public HTTPS pages to reach localhost.
(() => {
  const previousFetch = window.fetch.bind(window);
  const OLLAMA_PREFIXES = [
    'http://localhost:11434',
    'http://127.0.0.1:11434'
  ];

  function isOllamaUrl(input) {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    return OLLAMA_PREFIXES.some(prefix => url.startsWith(prefix));
  }

  window.fetch = function RogerVIBLocalNetworkFetch(input, init = {}) {
    if (!isOllamaUrl(input)) return previousFetch(input, init);

    // Chromium's Local Network Access API recognizes targetAddressSpace.
    // Unknown RequestInit fields are ignored by browsers that do not support it.
    return previousFetch(input, {
      ...init,
      targetAddressSpace: 'local'
    });
  };
})();