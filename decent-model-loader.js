(() => {
  const parts = window.DECENT_MODEL_PARTS || [];
  try {
    if (parts.length !== 5) throw new Error(`Expected 5 Decent model parts, got ${parts.length}`);
    window.DECENT_MODEL = JSON.parse(parts.join(''));
    window.DECENT_MODEL_LOAD_ERROR = null;
  } catch (error) {
    console.error('Decent model failed to load:', error);
    window.DECENT_MODEL = null;
    window.DECENT_MODEL_LOAD_ERROR = String(error?.message || error);
  }
  delete window.DECENT_MODEL_PARTS;
})();
