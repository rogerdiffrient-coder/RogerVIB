// RogerVIB beta-testing UI. Experimental models opt in with `beta: true` or `experimental: true`.
(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const openButton = document.getElementById('betaTestButton');
    const backdrop = document.getElementById('betaModalBackdrop');
    const closeButton = document.getElementById('betaCloseButton');
    const list = document.getElementById('betaModelList');
    const modelPicker = document.getElementById('modelPicker');
    if (!openButton || !backdrop || !closeButton || !list || !modelPicker || !window.RogerVIB) return;

    function experimentalModels() {
      return [...RogerVIB.models.values()]
        .filter(model => model.beta === true || model.experimental === true)
        .sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
    }

    function selectModel(model) {
      // Use the existing picker so RogerVIB's normal per-chat model switching stays in charge.
      let option = [...modelPicker.options].find(item => item.value === model.id);
      if (!option) {
        option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.name} (Beta)`;
        modelPicker.appendChild(option);
      }
      modelPicker.value = model.id;
      modelPicker.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    }

    function render() {
      const betaModels = experimentalModels();
      list.innerHTML = '';

      if (!betaModels.length) {
        const empty = document.createElement('div');
        empty.className = 'beta-empty';
        empty.textContent = 'No beta models are available right now. When an experimental build passes its tests, it can appear here without replacing the stable model.';
        list.appendChild(empty);
        return;
      }

      for (const model of betaModels) {
        const card = document.createElement('article');
        card.className = 'beta-model-card';

        const top = document.createElement('div');
        top.className = 'beta-model-card-top';
        const name = document.createElement('div');
        name.className = 'beta-model-name';
        name.textContent = model.name || model.id;
        const badge = document.createElement('span');
        badge.className = 'beta-badge';
        badge.textContent = 'BETA';
        top.append(name, badge);

        const description = document.createElement('div');
        description.className = 'beta-model-description';
        description.textContent = model.description || 'Experimental RogerVIB model.';

        const use = document.createElement('button');
        use.className = 'beta-use-button';
        use.type = 'button';
        use.textContent = modelPicker.value === model.id ? 'Using this beta' : 'Test this model';
        use.disabled = modelPicker.value === model.id;
        use.addEventListener('click', () => selectModel(model));

        card.append(top, description, use);
        list.appendChild(card);
      }
    }

    function open() {
      render();
      backdrop.classList.remove('hidden');
      closeButton.focus();
    }

    function close() {
      backdrop.classList.add('hidden');
      openButton.focus();
    }

    openButton.addEventListener('click', open);
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !backdrop.classList.contains('hidden')) close();
    });
  });
})();
