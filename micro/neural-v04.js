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
  let toId=new Map();

  function fnv1a(text,buckets){
    let h=2166136261>>>0;
    for(let i=0;i<text.length;i++){
      const code=text.charCodeAt(i)&0x7f;
      h^=code;
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
        window.ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
        window.ort.env.wasm.numThreads=Math.max(1,Math.min(4,navigator.hardwareConcurrency||2));
        const response=await fetch(CONFIG_URL,{cache:'no-cache'});
        if(!response.ok)throw new Error(`pretrained v0.4 config unavailable (HTTP ${response.status})`);
        config=await response.json();
        vocab=[...String(config.vocab||'')];
        toId=new Map(vocab.map((c,i)=>[c,i]));
        INFO.parameterCount=Number(config.parameter_count)||INFO.parameterCount;
        INFO.architecture=config.architecture||INFO.architecture;
        session=await window.ort.InferenceSession.create(MODEL_URL,{
          executionProviders:['wasm'],
          graphOptimizationLevel:'all'
        });
        INFO.ready=true;
        return true;
      }catch(error){
        session=null;config=null;INFO.ready=false;INFO.error=error?.message||String(error);
        throw error;
      }finally{
        INFO.loading=false;loadPromise=null;
      }
    })();
    return loadPromise;
  }

  function hashEndingAt(text){
    const width=Number(config?.context_chars)||4;
    const slice=text.slice(-width);
    return fnv1a(slice,Number(config?.hash_buckets)||104000);
  }

  async function step(contextId,hidden){
    const feeds={
      context_id:new window.ort.Tensor('int64',BigInt64Array.of(BigInt(contextId)),[1]),
      hidden:new window.ort.Tensor('float32',hidden,[1,1,Number(config.hidden_size)])
    };
    const out=await session.run(feeds);
    return {
      logits:out.logits.data,
      hidden:new Float32Array(out.next_hidden.data)
    };
  }

  function sample(logits,temperature=0.62,topK=10){
    const ranked=Array.from(logits,(value,index)=>({value:Number(value),index}))
      .sort((a,b)=>b.value-a.value).slice(0,topK);
    const max=ranked[0]?.value||0;
    const weights=ranked.map(x=>Math.exp((x.value-max)/temperature));
    const total=weights.reduce((a,b)=>a+b,0);
    let r=Math.random()*total;
    for(let i=0;i<ranked.length;i++){
      r-=weights[i];
      if(r<=0)return ranked[i].index;
    }
    return ranked[0]?.index||0;
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

  async function reply(input,history=[]){
    await load();
    const hiddenSize=Number(config.hidden_size)||96;
    let hidden=new Float32Array(hiddenSize);
    let prompt=historyPrompt(input,history);
    let state=null;

    // Prime the recurrent state with recent conversation context.
    // Keep the tail bounded so long chats do not make every reply slower forever.
    const prime=prompt.slice(-1400);
    let seen='';
    for(let i=0;i<prime.length;i++){
      seen+=prime[i];
      state=await step(hashEndingAt(seen),hidden);
      hidden=state.hidden;
      if((i&63)===63)await new Promise(requestAnimationFrame);
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
      if((i&7)===7)await new Promise(requestAnimationFrame);
    }

    answer=answer.replace(/\nuser:[\s\S]*$/,'').replace(/\n\n[\s\S]*$/,'').trim();
    return answer||'(tiny neural silence)';
  }

  window.RogerVIBNeuralV04={info:INFO,load,reply};
})();
