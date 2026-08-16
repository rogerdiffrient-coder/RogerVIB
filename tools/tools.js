// RogerVIB shared tool system.
// Models can call RogerVIB.tools.run(name, args) without owning tool implementations.
(() => {
  const registry = new Map();

  function register(tool) {
    if (!tool?.name || typeof tool.run !== 'function') throw new Error('Invalid RogerVIB tool');
    registry.set(tool.name, tool);
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

  function describe() {
    return [...registry.values()].map(tool => ({ name: tool.name, description: tool.description || '' }));
  }

  window.RogerVIBTools = { registry, register, run, describe };
})();
