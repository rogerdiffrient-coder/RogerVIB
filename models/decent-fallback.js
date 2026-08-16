// RogerVIB v0.4 Decent registration safety net.
// Keeps Decent visible while its trained weights load, then lets the real model
// replace this temporary entry as soon as DECENT_MODEL_READY resolves.
(() => {
  if (!window.RogerVIB || RogerVIB.models.has('decent')) return;

  RogerVIB.registerModel({
    id: 'decent',
    name: 'Decent',
    order: 40,
    description: 'RogerVIB v0.4 Decent — loading Transformer weights…',
    async reply(input, context) {
      const model = await window.DECENT_MODEL_READY;
      const real = RogerVIB.getModel('decent');
      if (model && real && real.reply !== this.reply) return real.reply(input, context);
      const brah = RogerVIB.getModel('brah');
      if (brah && brah.id !== 'decent') return brah.reply(input, context);
      return 'my Decent brain failed to load';
    }
  });

  window.addEventListener('rogervib:decent-ready', () => {
    // The real Decent model has now replaced the temporary registry entry.
    // Refresh the visible description if Decent is currently selected.
    const picker = document.getElementById('modelPicker');
    const description = document.getElementById('modelDescription');
    if (picker?.value === 'decent' && description) {
      description.textContent = RogerVIB.getModel('decent')?.description || '';
    }
  });
})();
