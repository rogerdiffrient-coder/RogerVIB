// RogerVIB Web Search tool.
// Full web search uses an optional same-origin/backend endpoint so API keys never
// live in the browser. Without one, it falls back to Wikipedia search, which is
// keyless and CORS-friendly.
(() => {
  if (!window.RogerVIBTools) throw new Error('RogerVIBTools must load before web search tool');

  const BLOCKED = [
    /\b(gun|firearm|ammo|ammunition|silencer|switchblade|taser|pepper spray)\b/i,
    /\b(cocaine|heroin|meth|fentanyl|marijuana|weed|thc|vape|nicotine|cigarette|alcohol|vodka|beer)\b/i,
    /\b(casino|sportsbook|betting|gambling|prediction market)\b/i,
    /\b(porn|pornography|xxx)\b/i,
    /\b(dangerous challenge|how to choke|blackout challenge)\b/i
  ];

  function assertSafe(query) {
    if (BLOCKED.some(pattern => pattern.test(query))) {
      throw new Error('that search is blocked by RogerVIB safety');
    }
  }

  async function searchBackend(query) {
    const endpoint = window.ROGERVIB_SEARCH_ENDPOINT || localStorage.getItem('rogervib_search_endpoint');
    if (!endpoint) return null;
    const url = new URL(endpoint, window.location.href);
    url.searchParams.set('q', query);
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`search backend returned HTTP ${response.status}`);
    const data = await response.json();
    const rows = Array.isArray(data) ? data : data.results;
    if (!Array.isArray(rows)) throw new Error('search backend returned an unexpected response');
    return rows.slice(0, 5).map(row => ({
      title: String(row.title || ''),
      snippet: String(row.snippet || row.description || ''),
      url: String(row.url || row.link || '')
    }));
  }

  async function searchWikipedia(query) {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.searchParams.set('origin', '*');
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('utf8', '1');
    url.searchParams.set('srlimit', '5');
    url.searchParams.set('srsearch', query);
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Wikipedia search returned HTTP ${response.status}`);
    const data = await response.json();
    return (data?.query?.search || []).slice(0, 5).map(row => ({
      title: row.title,
      snippet: String(row.snippet || '').replace(/<[^>]+>/g, ''),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(row.title.replace(/ /g, '_'))}`,
      source: 'Wikipedia fallback'
    }));
  }

  RogerVIBTools.register({
    name: 'web_search',
    description: 'Search for current or externally verifiable information. Use this whenever the answer could have changed recently, the user asks to search/look something up, or you are unsure of a factual claim. Do not invent search results.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'A concise search query containing the important names, terms, and context needed to answer the user.'
        }
      }
    },
    async run(args) {
      const query = String(args?.query || '').trim().slice(0, 300);
      if (!query) throw new Error('missing search query');
      assertSafe(query);
      const backend = await searchBackend(query);
      const results = backend || await searchWikipedia(query);
      return { query, mode: backend ? 'web' : 'wikipedia-fallback', results };
    }
  });
})();
