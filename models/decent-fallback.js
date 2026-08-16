// RogerVIB v0.4 Decent registration safety net.
// Keeps Decent visible while its trained weights load, then lets the real model
// replace this temporary entry as soon as DECENT_MODEL_READY resolves.
(() => {
  if (!window.RogerVIB || RogerVIB.models.has('decent')) return;

  const placeholder = {
    id: 'decent',
    name: 'Decent',
    order: 40,
    description: 'RogerVIB v0.4 Decent — loading Transformer weights…',
    async reply(input, context) {
      const model = await window.DECENT_MODEL_READY;
      const real = RogerVIB.getModel('decent');
      if (model && real && real !== placeholder) return real.reply(input, context);
      const brah = RogerVIB.getModel('brah');
      if (brah && brah.id !== 'decent') return brah.reply(input, context);
      return 'my Decent brain failed to load';
    }
  };

  RogerVIB.registerModel(placeholder);

  function refreshDescription() {
    const picker = document.getElementById('modelPicker');
    const description = document.getElementById('modelDescription');
    if (picker?.value === 'decent' && description) {
      description.textContent = RogerVIB.getModel('decent')?.description || '';
    }
  }

  window.addEventListener('rogervib:decent-ready', refreshDescription);
  window.addEventListener('rogervib:decent-failed', event => {
    placeholder.description = `RogerVIB v0.4 Decent — load error: ${event.detail || 'unknown error'}`;
    refreshDescription();
  });
})();
