// Keep the user's chosen Ollama model stable across reloads, model refreshes, and new chats.
(() => {
  const PREFERRED_KEY = 'rogervib_preferred_model_v1';
  const DEFAULT_PREFERRED = 'gemma4:cloud';
  let restoring = false;
  let userHasChosen = !!localStorage.getItem(PREFERRED_KEY);

  function optionsFor(select) {
    return [...select.options]
      .map(option => String(option.value || '').trim())
      .filter(value => value && !/connecting|no ollama/i.test(value));
  }

  function preferredModel() {
    return localStorage.getItem(PREFERRED_KEY) || DEFAULT_PREFERRED;
  }

  function applyPreferred(select) {
    const options = optionsFor(select);
    if (!options.length) return false;

    const preferred = preferredModel();
    if (!options.includes(preferred)) return false;
    if (select.value === preferred) return true;

    restoring = true;
    select.value = preferred;
    select.dispatchEvent(new Event('change', { bubbles:true }));
    restoring = false;
    return true;
  }

  window.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('modelPicker');
    if (!select) return;

    // Save genuine user/app selections. Ignore our own restore dispatch.
    select.addEventListener('change', () => {
      if (restoring) return;
      const value = String(select.value || '').trim();
      if (!value || /connecting|no ollama/i.test(value)) return;
      localStorage.setItem(PREFERRED_KEY, value);
      userHasChosen = true;
    }, true);

    // main.js and the custom refresh button both rebuild the native select.
    // Re-apply the user's preference after either operation finishes.
    let scheduled = false;
    const scheduleRestore = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        applyPreferred(select);
      });
    };

    new MutationObserver(scheduleRestore).observe(select, {
      childList:true,
      subtree:true
    });

    // Initial restore (or Gemma default if no preference has ever been chosen).
    scheduleRestore();

    window.RogerVIBModelPreference = {
      get: preferredModel,
      set(model) {
        const value = String(model || '').trim();
        if (!value) return;
        localStorage.setItem(PREFERRED_KEY, value);
        userHasChosen = true;
        applyPreferred(select);
      },
      clear() {
        localStorage.removeItem(PREFERRED_KEY);
        userHasChosen = false;
        applyPreferred(select);
      },
      hasUserChoice: () => userHasChosen
    };
  });
})();