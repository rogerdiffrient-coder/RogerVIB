// Final startup guard: never allow RogerVIB's model picker to remain in a loading state.
(() => {
  const CACHE_KEY='rogervib_last_models_v1';
  const PREFERRED_KEY='rogervib_preferred_model_v1';
  const FALLBACK=['gemma4:cloud','minimax-m3:cloud','qwen3.5:cloud','kimi-k2.7-code:cloud'];
  const readCache=()=>{try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'[]');return Array.isArray(x)?x:[];}catch{return[];}};
  const unique=a=>[...new Set((a||[]).map(x=>String(x||'').trim()).filter(Boolean))];
  const bad=v=>!v||/connecting|loading|no ollama/i.test(String(v));

  function rescue(){
    const select=document.getElementById('modelPicker');
    if(!select)return;
    const optionValues=[...select.options].map(o=>o.value||o.textContent).filter(Boolean);
    const isStuck=select.disabled||bad(select.value)||optionValues.length===0||optionValues.every(bad);
    if(!isStuck)return;

    const models=unique([...readCache(),...FALLBACK]);
    const preferred=localStorage.getItem(PREFERRED_KEY)||'gemma4:cloud';
    select.innerHTML='';
    for(const model of models){
      const o=document.createElement('option');o.value=model;o.textContent=model;select.append(o);
    }
    select.value=models.includes(preferred)?preferred:(models.includes('gemma4:cloud')?'gemma4:cloud':models[0]);
    select.disabled=false;
    select.dispatchEvent(new Event('change',{bubbles:true}));

    const status=document.getElementById('modelDescription');
    if(status&&/connecting|loading/i.test(status.textContent||'')) status.textContent=`Models ready • using ${select.value}`;
  }

  window.addEventListener('DOMContentLoaded',()=>{
    rescue();
    let checks=0;
    const timer=setInterval(()=>{rescue();if(++checks>=40)clearInterval(timer);},250);
    const select=document.getElementById('modelPicker');
    if(select)new MutationObserver(rescue).observe(select,{childList:true,subtree:true,attributes:true});
  });
})();