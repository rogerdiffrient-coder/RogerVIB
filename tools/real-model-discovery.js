// Truthful model discovery: only show models that a real Ollama /api/tags response returned.
(() => {
  const URLS=['http://localhost:11434/api/tags','http://127.0.0.1:11434/api/tags'];
  const PREF='rogervib_preferred_model_v1';

  async function getTags(url){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(url,{cache:'no-store',signal:controller.signal,targetAddressSpace:'local'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      const models=Array.isArray(data?.models)?data.models.map(x=>x?.name||x?.model).filter(Boolean):[];
      return [...new Set(models)];
    }finally{clearTimeout(timer);}
  }

  function applyModels(models){
    const picker=document.getElementById('modelPicker');
    const status=document.getElementById('modelDescription');
    if(!picker)return;
    picker.innerHTML='';
    for(const name of models){
      const option=document.createElement('option');
      option.value=name;option.textContent=name;picker.append(option);
    }
    const preferred=localStorage.getItem(PREF);
    picker.value=models.includes(preferred)?preferred:(models.includes('gemma4:cloud')?'gemma4:cloud':models[0]);
    picker.disabled=false;
    document.documentElement.dataset.ollamaRealModels='1';
    if(status)status.textContent=`Connected to Ollama • ${models.length} real model${models.length===1?'':'s'} loaded`;
    picker.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function applyFailure(errors){
    const picker=document.getElementById('modelPicker');
    const status=document.getElementById('modelDescription');
    const send=document.getElementById('sendButton');
    if(picker){picker.innerHTML='<option value="">Ollama unreachable</option>';picker.disabled=true;}
    if(send)send.disabled=true;
    if(status)status.textContent='Could not reach Ollama on localhost:11434 or 127.0.0.1:11434';
    document.documentElement.dataset.ollamaRealModels='0';
    console.error('RogerVIB real model discovery failed:',errors);
  }

  async function discover(){
    const errors=[];
    for(const url of URLS){
      try{
        const models=await getTags(url);
        if(models.length){applyModels(models);return true;}
        errors.push(`${url}: returned no models`);
      }catch(error){errors.push(`${url}: ${error?.message||error}`);}
    }
    applyFailure(errors);return false;
  }

  window.addEventListener('DOMContentLoaded',()=>setTimeout(discover,100));
  window.RogerVIBDiscoverModels=discover;
})();