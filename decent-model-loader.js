// RogerVIB v0.4 Decent model loader
// The trained model payload was split across JS-looking files. Do NOT execute
// those files independently: a split can land inside an escape sequence.
// Instead, read them as raw text, stitch the escaped payload together, then
// decode the complete string exactly once.
(() => {
  try {
    const prefix = 'window.DECENT_MODEL_PARTS=(window.DECENT_MODEL_PARTS||[]);window.DECENT_MODEL_PARTS.push("';
    const suffix = '");';
    const rawParts = [];

    for (let i = 0; i < 5; i += 1) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `decent-model-part${i}.js?v=0.4.2`, false);
      xhr.send(null);

      if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0)) {
        throw new Error(`Decent part ${i} returned HTTP ${xhr.status}`);
      }

      const source = xhr.responseText.trim();
      if (!source.startsWith(prefix) || !source.endsWith(suffix)) {
        throw new Error(`Decent part ${i} has an unexpected wrapper`);
      }

      // Keep the source escapes untouched here. The whole reason for this loader
      // is that an escape sequence may cross a file boundary.
      rawParts.push(source.slice(prefix.length, -suffix.length));
    }

    const escapedPayload = rawParts.join('');
    const jsonText = JSON.parse('"' + escapedPayload + '"');
    const model = JSON.parse(jsonText);

    if (!model || model.version !== '0.4' || !model.tensors || !Array.isArray(model.vocab)) {
      throw new Error('Decent model payload decoded but failed validation');
    }

    window.DECENT_MODEL = model;
    window.DECENT_MODEL_LOAD_ERROR = null;
    console.log(`Decent v${model.version} loaded: ${model.params} parameters`);
  } catch (error) {
    console.error('Decent model failed to load:', error);
    window.DECENT_MODEL = null;
    window.DECENT_MODEL_LOAD_ERROR = String(error?.message || error);
  }
})();
