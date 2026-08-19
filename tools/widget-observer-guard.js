// Filter widget-only DOM mutations so the widget renderer does not react to its own rerenders.
(() => {
  const NativeMutationObserver = window.MutationObserver;
  if (!NativeMutationObserver) return;

  window.MutationObserver = class RogerVIBMutationObserver {
    constructor(callback) {
      this._native = new NativeMutationObserver((mutations, observer) => {
        const meaningful = mutations.some(mutation => {
          const changed = [...mutation.addedNodes, ...mutation.removedNodes];
          if (!changed.length) return true;
          return changed.some(node => {
            if (node.nodeType !== Node.ELEMENT_NODE) return true;
            return !node.classList.contains('rogervib-widget-row');
          });
        });
        if (meaningful) callback(mutations, this);
      });
    }
    observe(...args) { return this._native.observe(...args); }
    disconnect() { return this._native.disconnect(); }
    takeRecords() { return this._native.takeRecords(); }
  };
})();