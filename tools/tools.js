// RogerVIB shared tool system.
// Ollama models receive these tools as native function-calling schemas.
(() => {
  const registry = new Map();

  function register(tool) {
    if (!tool?.name || typeof tool.run !== 'function') throw new Error('Invalid RogerVIB tool');
    registry.set(tool.name, {
      description: '',
      parameters: { type: 'object', properties: {} },
      ...tool
    });
  }

  async function run(name, args = {}) {
    const tool = registry.get(name);
    if (!tool) return { ok: false, error: `unknown tool: ${name}` };
    try {
      return { ok: true, name, result: await tool.run(args) };
    } catch (error) {
      console.error(`RogerVIB tool ${name} failed:`, error);
      return { ok: false, name, error: String(error?.message || error) };
    }
  }

  function schemas() {
    return [...registry.values()].map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.parameters || { type: 'object', properties: {} }
      }
    }));
  }

  function describe() {
    return [...registry.values()].map(tool => ({
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || { type: 'object', properties: {} }
    }));
  }

  window.RogerVIBTools = { registry, register, run, schemas, describe };
})();
