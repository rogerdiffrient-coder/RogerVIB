// RogerVIB Micro v0.4 — real pretrained neural inference.
// Training happens in GitHub Actions. The browser only loads finished ONNX weights.
(() => {
  const MODEL_BASE='models/micro-v0.4';
  const CONFIG_URL=`${MODEL_BASE}/config.json`;
  const MODEL_URL=`${MODEL_BASE}/model.onnx`;

  const INFO={
    id:'neural-v0.4',
    name:'Micro v0.4 — Neural',
    version:'0.4',
    architecture:'hashed 4-char embedding + GRU character language model',
    parameterCount:10049184,
    pretrained:true,
    local:true,
    ready:false,
    loading:false,
    error:''
  };

  let config=null;
  let session=null;
  let loadPromise=null;
  let vocab=[];

  const errorText=error=>{
    if(error instanceof Error&&error.message)return error.message;
    if(typeof error==='string')return error;
    try{return JSON.stringify(error);}catch{return String(error);}
  };

  function fnv1a(text,buckets){
    let h=2166136261>>>0;
    for(let i=0;i<text.length;i++){
      h^=(text.charCodeAt(i)&0x7f);
      h=Math.imul(h,16777619)>>>0;
    }
    return h%buckets;
  }

  function sanitize(text){
    return String(text??'').replace(/[^\n\x20-\x7E]/g,'?');
  }

  async function load(){
    if(session&&config)return true;
    if(loadPromise)return loadPromise;
    loadPromise=(async()=>{
      INFO.loading=true;INFO.error='';
      try{
        if(!window.ort)throw new Error('ONNX Runtime Web did not load');

        // GitHub Pages is not cross-origin isolated. Multithreaded WASM can fail there,
        // and this model's recurrent core is small enough that one thread is preferable.
        window.ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
        window.ort.env.wasm.numThreads=1;
        window.ort.env.wasm.proxy=false;

        const response=await fetch(CONFIG_URL,{cache:'no-store'});
        if(!response.ok)throw new Error(`v0.4 config failed to load (HTTP ${response.status})`);
        config=await response.json();
        vocab=[...String(config.vocab||'')];
        if(!vocab.length)throw new Error('v0.4 config has an empty vocabulary');

        INFO.parameterCount=Number(config.parameter_count)||INFO.parameterCount;
        INFO.architecture=config.architecture||INFO.architecture;

        session=await window.ort.InferenceSession.create(MODEL_URL,{
          executionProviders:['wasm'],
          graphOptimizationLevel:'all'
        });

        const inputs=session.inputNames||[];
        const outputs=session.outputNames||[];
        if(!inputs.includes('context_id')||!inputs.includes('hidden')){
          throw new Error(`v0.4 model inputs are wrong: ${inputs.join(', ')||'(none)'}`);
        }
        if(!outputs.includes('logits')||!outputs.includes('next_hidden')){
          throw new Error(`v0.4 model outputs are wrong: ${outputs.join(', ')||'(none)'}`);
        }

        INFO.ready=true;
        return true;
      }catch(error){
        session=null;config=null;INFO.ready=false;INFO.error=errorText(error)||'unknown neural runtime error';
        console.error('RogerVIB v0.4 load failed:',error);
        throw new Error(INFO.error);
      }finally{
        INFO.loading=false;loadPromise=null;
      }
    })();
    return loadPromise;
  }

  function hashEndingAt(text){
    const width=Number(config?.context_chars)||4;
    return fnv1a(text.slice(-width),Number(config?.hash_buckets)||104000);
  }

  async function step(contextId,hidden){
    if(!session||!config)throw new Error('v0.4 inference session is not loaded');
    const hiddenSize=Number(config.hidden_size)||96;
    const feeds={
      context_id:new window.ort.Tensor('int64',BigInt64Array.of(BigInt(contextId)),[1]),
      hidden:new window.ort.Tensor('float32',hidden,[1,1,hiddenSize])
    };

    let out;
    try{out=await session.run(feeds);}
    catch(error){throw new Error(`ONNX inference failed: ${errorText(error)||'unknown error'}`);}

    const logits=out?.logits;
    const nextHidden=out?.next_hidden;
    if(!logits||!nextHidden){
      throw new Error(`ONNX returned unexpected outputs: ${Object.keys(out||{}).join(', ')||'(none)'}`);
    }
    if(!logits.data?.length||!nextHidden.data?.length){
      throw new Error('ONNX returned empty tensors');
    }

    return {logits:logits.data,hidden:new Float32Array(nextHidden.data)};
  }

  function sample(logits,temperature=0.62,topK=10){
    const ranked=Array.from(logits,(value,index)=>({value:Number(value),index}))
      .filter(x=>Number.isFinite(x.value))
      .sort((a,b)=>b.value-a.value).slice(0,topK);
    if(!ranked.length)throw new Error('v0.4 produced no valid logits');
    const max=ranked[0].value;
    const weights=ranked.map(x=>Math.exp((x.value-max)/temperature));
    const total=weights.reduce((a,b)=>a+b,0);
    let r=Math.random()*total;
    for(let i=0;i<ranked.length;i++){
      r-=weights[i];
      if(r<=0)return ranked[i].index;
    }
    return ranked[0].index;
  }

  function historyPrompt(input,history=[]){
    let messages=Array.isArray(history)?history.slice(-8):[];
    if(messages.length){
      const last=messages[messages.length-1];
      if(last?.role==='user'&&sanitize(last.text).trim()===sanitize(input).trim())messages=messages.slice(0,-1);
    }
    const lines=[];
    for(const m of messages){
      const role=m?.role==='bot'?'roger':'user';
      lines.push(`${role}: ${sanitize(m?.text).replace(/\n+/g,' ').slice(0,500)}`);
    }
    lines.push(`user: ${sanitize(input).replace(/\n+/g,' ').slice(0,500)}`);
    lines.push('roger: ');
    return lines.join('\n');
  }

  const yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));

  async function reply(input,history=[]){
    await load();
    const hiddenSize=Number(config.hidden_size)||96;
    let hidden=new Float32Array(hiddenSize);
    const prompt=historyPrompt(input,history);
    let state=null;

    const prime=prompt.slice(-900);
    let seen='';
    for(let i=0;i<prime.length;i++){
      seen+=prime[i];
      state=await step(hashEndingAt(seen),hidden);
      hidden=state.hidden;
      if((i&31)===31)await yieldFrame();
    }

    if(!state)state=await step(hashEndingAt(' '),hidden);
    let logits=state.logits;
    let answer='';
    let generated=prime;
    const maxChars=Number(config.max_reply_chars)||220;

    for(let i=0;i<maxChars;i++){
      const id=sample(logits,i<8?0.52:0.66,i<8?7:11);
      const ch=vocab[id]??'?';
      answer+=ch;generated+=ch;

      if(answer.endsWith('\n\n')||answer.includes('\nuser:'))break;
      const next=await step(hashEndingAt(generated),hidden);
      logits=next.logits;hidden=next.hidden;
      if((i&7)===7)await yieldFrame();
    }

    answer=answer.replace(/\nuser:[\s\S]*$/,'').replace(/\n\n[\s\S]*$/,'').trim();
    return answer||'(tiny neural silence)';
  }

  window.RogerVIBNeuralV04={info:INFO,load,reply};
})();