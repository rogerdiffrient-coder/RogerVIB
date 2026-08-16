// RogerVIB alpha-testing UI. Very early models opt in with `alpha: true`.
(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const openButton = document.getElementById('alphaTestButton');
    const backdrop = document.getElementById('alphaModalBackdrop');
    const closeButton = document.getElementById('alphaCloseButton');
    const list = document.getElementById('alphaModelList');
    const modelPicker = document.getElementById('modelPicker');
    if (!openButton || !backdrop || !closeButton || !list || !modelPicker || !window.RogerVIB) return;

    const smarterPreview = {
      id: 'smarter-preview',
      name: 'Smarter',
      alpha: true,
      previewOnly: true,
      params: 11170944,
      context: 512,
      status: 'training',
      knownIssues: 'not available to chat with until the current training build is deployed',
      description: 'RogerVIB v0.6 Smarter — larger Transformer, longer context, and grounded tool use.'
    };

    function alphaModels() {
      const registered = [...RogerVIB.models.values()]
        .filter(model => model.alpha === true)
        .sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
      const hasSmarter = registered.some(model => /smarter/i.test(model.name || '') || model.id === 'smarter');
      if (!hasSmarter) registered.unshift(smarterPreview);
      return registered;
    }

    function selectModel(model) {
      if (model.previewOnly) return;
      let option = [...modelPicker.options].find(item => item.value === model.id);
      if (!option) {
        option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.name} (Alpha)`;
        modelPicker.appendChild(option);
      }
      modelPicker.value = model.id;
      modelPicker.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    }

    function stat(text) {
      const span = document.createElement('span');
      span.className = 'alpha-stat';
      span.textContent = text;
      return span;
    }

    function render() {
      const models = alphaModels();
      list.innerHTML = '';
      for (const model of models) {
        const card = document.createElement('article');
        card.className = 'beta-model-card alpha-model-card';
        const top = document.createElement('div');
        top.className = 'beta-model-card-top';
        const name = document.createElement('div');
        name.className = 'beta-model-name';
        name.textContent = model.name || model.id;
        const badge = document.createElement('span');
        badge.className = 'beta-badge alpha-badge';
        badge.textContent = 'ALPHA';
        top.append(name, badge);

        const description = document.createElement('div');
        description.className = 'beta-model-description';
        description.textContent = model.description || 'Very early RogerVIB model. Expect nonsense.';

        const stats = document.createElement('div');
        stats.className = 'alpha-stats';
        if (model.params) stats.appendChild(stat(`${Number(model.params).toLocaleString()} params`));
        if (model.context) stats.appendChild(stat(`${model.context} context`));
        if (model.status) stats.appendChild(stat(String(model.status)));
        if (model.knownIssues) stats.appendChild(stat(`Known issues: ${model.knownIssues}`));

        const use = document.createElement('button');
        use.className = 'beta-use-button alpha-use-button';
        use.type = 'button';
        if (model.previewOnly) {
          use.textContent = 'Training…';
          use.disabled = true;
        } else {
          use.textContent = modelPicker.value === model.id ? 'Using this alpha' : 'Test this alpha';
          use.disabled = modelPicker.value === model.id;
          use.addEventListener('click', () => selectModel(model));
        }

        card.append(top, description);
        if (stats.childNodes.length) card.appendChild(stats);
        card.appendChild(use);
        list.appendChild(card);
      }
    }

    function open() { render(); backdrop.classList.remove('hidden'); closeButton.focus(); }
    function close() { backdrop.classList.add('hidden'); openButton.focus(); }
    openButton.addEventListener('click', open);
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !backdrop.classList.contains('hidden')) close(); });
  });
})();
