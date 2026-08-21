// Keep the visible Ollama status consistent with the actual loaded model picker.
(() => {
  const bad = /connection blocked|run the macos rogervib ollama setup|connecting to ollama|checking connection/i;
  const realModels = select => [...(select?.options || [])]
    .map(o => String(o.value || o.textContent || '').trim())
    .filter(v => v && !/connecting|loading|no ollama/i.test(v));

  function syncStatus(){
    const select=document.getElementById('modelPicker');
    const status=document.getElementById('modelDescription');
    if(!select||!status)return;
    const models=realModels(select);
    if(models.length && bad.test(status.textContent||'')){
      const current=(select.value && models.includes(select.value)) ? select.value : models[0];
      status.textContent=`Connected to Ollama • using ${current}`;
    }
  }

  window.addEventListener('DOMContentLoaded',()=>{
    syncStatus();
    setTimeout(syncStatus,100);
    setTimeout(syncStatus,500);
    setTimeout(syncStatus,1500);
    const select=document.getElementById('modelPicker');
    if(select)new MutationObserver(syncStatus).observe(select,{childList:true,subtree:true,attributes:true});
  });
})();