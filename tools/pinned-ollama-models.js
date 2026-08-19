// RogerVIB pinned Ollama model options.
// These are added to Ollama's /api/tags response so they behave like normal picker models.
(() => {
  const PINNED_MODELS = ['minimaxm3:cloud'];
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : input?.url;
      if (!url || !String(url).includes('localhost:11434/api/tags')) return response;

      const data = await response.clone().json();
      const models = Array.isArray(data?.models) ? [...data.models] : [];
      const names = new Set(models.map(item => item?.name || item?.model).filter(Boolean));

      for (const name of PINNED_MODELS) {
        if (!names.has(name)) models.push({ name, model: name, details: { family: 'cloud' } });
      }

      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json');
      return new Response(JSON.stringify({ ...data, models }), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      console.warn('RogerVIB could not add pinned Ollama models:', error);
      return response;
    }
  };
})();