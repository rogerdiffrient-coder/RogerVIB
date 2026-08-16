// RogerVIB v0.4 Decent registration safety net.
// If the real Transformer failed to load, keep Decent visible and fall back to Brah
// instead of silently deleting the newest model from the picker.
(() => {
  if (!window.RogerVIB || RogerVIB.models.has('decent')) return;

  const reason = window.DECENT_MODEL_LOAD_ERROR || 'Decent Transformer runtime did not register';
  console.error('Decent fallback active:', reason);

  RogerVIB.registerModel({
    id: 'decent',
    name: 'Decent',
    order: 40,
    description: 'RogerVIB v0.4 Decent — Transformer failed to load; temporarily falling back to Brah.',
    async reply(input, context) {
      const brah = RogerVIB.getModel('brah');
      if (brah && brah.id !== 'decent') return brah.reply(input, context);
      return `my Decent brain failed to load: ${reason}`;
    }
  });
})();
