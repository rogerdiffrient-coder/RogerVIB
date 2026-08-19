// Augment RogerVIB's Ollama system prompt with the tools that are actually registered.
// This keeps old/stale hard-coded tool wording from hiding newer widget/game tools.
(() => {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function RogerVIBFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.includes('localhost:11434/api/chat') || !init?.body || typeof init.body !== 'string') {
      return nativeFetch(input, init);
    }

    try {
      const payload = JSON.parse(init.body);
      if (!Array.isArray(payload.messages)) return nativeFetch(input, init);
      const system = payload.messages.find(message => message?.role === 'system');
      const tools = window.RogerVIBTools?.describe?.() || [];
      if (system && tools.length) {
        const toolLines = tools.map(tool => `- ${tool.name}: ${tool.description || 'Available RogerVIB tool.'}`).join('\n');
        system.content = `${String(system.content || '')}\n\nCURRENT ROGERVIB TOOLS (this list overrides any older statement about having only two tools):\n${toolLines}\n\nUI/GAME RULES:\n- Normal assistant messages support Markdown directly in chat. Use Markdown naturally; a Markdown panel is optional, not required.\n- Inline panels are closable by the user.\n- For Wordle, use game_engine/show_game_widget to start or present state when useful, but the user types guesses directly into chat. Never ask them to click a Make a Guess button.\n- Do not merely describe a game state change when a deterministic game tool can perform it.`;
      }
      return nativeFetch(input, {...init, body:JSON.stringify(payload)});
    } catch {
      return nativeFetch(input, init);
    }
  };
})();
