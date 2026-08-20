// RogerVIB global busy UI.
// Mirrors main.js's send-button disabled state into a stop-style square icon
// and Coding workspace Working… indicator.
(() => {
  function applyBusy(button, busy) {
    if (!button) return;
    button.classList.toggle('is-busy', busy);
    button.textContent = busy ? '■' : '↑';
    button.setAttribute('aria-label', busy ? 'RogerVIB is working' : 'Send');
    button.title = busy ? 'Working…' : 'Send';
    if (window.RogerVIBCoding?.setWorking) {
      window.RogerVIBCoding.setWorking(busy ? 'Working…' : 'Ready', busy);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('sendButton');
    if (!button) return;
    applyBusy(button, button.disabled);
    const observer = new MutationObserver(() => applyBusy(button, button.disabled));
    observer.observe(button, { attributes:true, attributeFilter:['disabled'] });
  });
})();
