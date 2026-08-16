// RogerVIB v0.4 Decent model loader
// The original trained payload was split across five escaped JS-string chunks.
// Some chunk boundaries contain an extra trailing backslash, so reconstruct the
// payload by trying only boundary-safe repairs and accepting a strictly valid model.
(() => {
  const prefix = 'window.DECENT_MODEL_PARTS=(window.DECENT_MODEL_PARTS||[]);window.DECENT_MODEL_PARTS.push("';
  const suffix = '");';

  function isValidModel(model) {
    return !!(
      model &&
      model.version === '0.4' &&
      model.params === 17824 &&
      model.trainingExamples === 10000 &&
      Array.isArray(model.vocab) &&
      model.vocab.length === 62 &&
      model.tensors &&
      model.tensors['tok.weight'] &&
      model.tensors['pos.weight'] &&
      model.tensors['b.q.weight'] &&
      model.tensors['head.weight']
    );
  }

  function tryDecode(parts) {
    const repairable = parts.slice(0, -1).map(part => part.endsWith('\\'));
    const combinations = 1 << repairable.length;

    for (let mask = 0; mask < combinations; mask++) {
      const candidate = parts.map((part, i) => {
        if (i >= repairable.length || !repairable[i]) return part;
        return (mask & (1 << i)) ? part.slice(0, -1) : part;
      }).join('');

      try {
        const jsonText = JSON.parse('"' + candidate + '"');
        const model = JSON.parse(jsonText);
        if (isValidModel(model)) return { model, mask };
      } catch (_) {
        // Try the next tiny boundary-repair combination.
      }
    }

    return null;
  }

  window.DECENT_MODEL_READY = (async () => {
    try {
      const sources = await Promise.all(
        Array.from({ length: 5 }, async (_, i) => {
          const response = await fetch(`decent-model-part${i}.js?v=0.4.4`, { cache: 'no-store' });
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

      const decoded = tryDecode(rawParts);
      if (!decoded) throw new Error('Decent payload could not be reconstructed from its chunk boundaries');

      window.DECENT_MODEL = decoded.model;
      window.DECENT_MODEL_LOAD_ERROR = null;
      console.log(`Decent v${decoded.model.version} loaded: ${decoded.model.params} parameters (boundary repair mask ${decoded.mask})`);
      return decoded.model;
    } catch (error) {
      console.error('Decent model failed to load:', error);
      window.DECENT_MODEL = null;
      window.DECENT_MODEL_LOAD_ERROR = String(error?.message || error);
      window.dispatchEvent(new CustomEvent('rogervib:decent-failed', { detail: window.DECENT_MODEL_LOAD_ERROR }));
      return null;
    }
  })();
})();
