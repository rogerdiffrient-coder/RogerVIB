// Report the real browser -> Ollama connection state instead of hiding it behind cached models.
(() => {
  const OLLAMA='http://localhost:11434';
  async function check(){
    const status=document.getElementById('modelDescription');
    try{
      const response=await fetch(`${OLLAMA}/api/tags`,{cache:'no-store'});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      const count=Array.isArray(data?.models)?data.models.length:0;
      if(status) status.textContent=`Connected to Ollama • ${count} model${count===1?'':'s'} available`;
      document.documentElement.dataset.ollamaConnection='ok';
    }catch(error){
      console.error('RogerVIB real Ollama connection check failed:',error);
      if(status) status.textContent='Ollama connection blocked • run the macOS RogerVIB Ollama setup, then restart Ollama';
      document.documentElement.dataset.ollamaConnection='failed';
    }
  }
  window.addEventListener('DOMContentLoaded',()=>setTimeout(check,250));
  window.RogerVIBCheckOllamaConnection=check;
})();