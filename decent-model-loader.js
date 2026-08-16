// RogerVIB v0.4 Decent model loader
// Load the five trained-weight chunks as raw text, join them first, then decode.
// Expose a promise so the Decent runtime can WAIT for the weights instead of
// racing the loader and pretending to be Brah.
(() => {
  const prefix = 'window.DECENT_MODEL_PARTS=(window.DECENT_MODEL_PARTS||[]);window.DECENT_MODEL_PARTS.push("';
  const suffix = '");';

  window.DECENT_MODEL_READY = (async () => {
    try {
      const sources = await Promise.all(
        Array.from({ length: 5 }, async (_, i) => {
          const response = await fetch(`decent-model-part${i}.js?v=0.4.3`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`Decent part ${i} returned HTTP ${response.status}`);
          return (await response.text()).trim();
        })
      );

      const rawParts = sources.map((source, i) => {
        if (!source.startsWith(prefix) || !source.endsWith(suffix)) {
          throw new Error(`Decent part ${i} has an unexpected wrapper`);
        }
        return source.slice(prefix.length, -suffix.length);
      });

      // The chunks contain one escaped JavaScript string. Join BEFORE decoding so
      // an escape sequence is allowed to cross a chunk boundary safely.
      const escapedPayload = rawParts.join('');
      const jsonText = JSON.parse('"' + escapedPayload + '"');
      const model = JSON.parse(jsonText);

      if (!model || model.version !== '0.4' || !model.tensors || !Array.isArray(model.vocab)) {
        throw new Error('Decent model payload decoded but failed validation');
      }

      window.DECENT_MODEL = model;
      window.DECENT_MODEL_LOAD_ERROR = null;
      console.log(`Decent v${model.version} loaded: ${model.params} parameters`);
      return model;
    } catch (error) {
      console.error('Decent model failed to load:', error);
      window.DECENT_MODEL = null;
      window.DECENT_MODEL_LOAD_ERROR = String(error?.message || error);
      return null;
    }
  })();
})();
