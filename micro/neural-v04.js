// RogerVIB Micro v0.4 — real pretrained neural inference, no ONNX/WASM runtime.
// GitHub Actions trains the model; the browser loads quantized weights and runs the GRU directly.
(() => {
  const MODEL_BASE='models/micro-v0.4';
  const CONFIG_URL=`${MODEL_BASE}/config.json`;

  const INFO={
    id:'neural-v0.4',
    name:'Micro v0.4 — Neural',
    version:'0.4',
    architecture:'hashed 4-char int8 embedding + float32 GRU character language model',
    parameterCount:10049184,
    pretrained:true,
    local:true,
    ready:false,
    loading:false,
    error:''
  };

  let config=null;
  let weights=null;
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

  function sanitize(text){return String(text??'').replace(/[^\n\x20-\x7E]/g,'?');}
  const sigmoid=x=>1/(1+Math.exp(-Math.max(-20,Math.min(20,x))));
  const yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));

  async function fetchBuffer(name){
    const response=await fetch(`${MODEL_BASE}/${name}`,{cache:'force-cache'});
    if(!response.ok)throw new Error(`${name} failed to load (HTTP ${response.status})`);
    return response.arrayBuffer();
  }

  async function load(){
    if(weights&&config)return true;
    if(loadPromise)return loadPromise;
    loadPromise=(async()=>{
      INFO.loading=true;INFO.error='';
      try{
        const response=await fetch(CONFIG_URL,{cache:'no-store'});
        if(!response.ok)throw new Error(`v0.4 config failed to load (HTTP ${response.status})`);
        config=await response.json();
        if(config.format!=='rogervib-gru-i8-v1')throw new Error(`v0.4 weights are still updating; got ${config.format||'old format'}`);
        vocab=[...String(config.vocab||'')];
        if(!vocab.length)throw new Error('v0.4 config has an empty vocabulary');

        const f=config.files||{};
        const names=['embedding','embedding_scales','gru_weight_ih','gru_weight_hh','gru_bias_ih','gru_bias_hh','head_weight','head_bias'];
        for(const key of names)if(!f[key])throw new Error(`v0.4 config is missing ${key}`);

        const buffers=await Promise.all(names.map(key=>fetchBuffer(f[key])));
        const map=Object.fromEntries(names.map((key,i)=>[key,buffers[i]]));
        weights={
          embedding:new Int8Array(map.embedding),
          embeddingScales:new Float32Array(map.embedding_scales),
          wih:new Float32Array(map.gru_weight_ih),
          whh:new Float32Array(map.gru_weight_hh),
          bih:new Float32Array(map.gru_bias_ih),
          bhh:new Float32Array(map.gru_bias_hh),
          headW:new Float32Array(map.head_weight),
          headB:new Float32Array(map.head_bias)
        };

        const H=Number(config.hidden_size)||96;
        const buckets=Number(config.hash_buckets)||104000;
        if(weights.embedding.length!==buckets*H)throw new Error(`embedding size mismatch: ${weights.embedding.length}`);
        if(weights.embeddingScales.length!==buckets)throw new Error(`embedding scale mismatch: ${weights.embeddingScales.length}`);
        if(weights.wih.length!==3*H*H||weights.whh.length!==3*H*H)throw new Error('GRU matrix size mismatch');
        if(weights.bih.length!==3*H||weights.bhh.length!==3*H)throw new Error('GRU bias size mismatch');
        if(weights.headW.length!==vocab.length*H||weights.headB.length!==vocab.length)throw new Error('output head size mismatch');

        INFO.parameterCount=Number(config.parameter_count)||INFO.parameterCount;
        INFO.architecture=config.architecture||INFO.architecture;
        INFO.ready=true;
        return true;
      }catch(error){
        weights=null;config=null;INFO.ready=false;INFO.error=errorText(error)||'unknown neural runtime error';
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

  function dotRow(matrix,row,vector,H){
    let sum=0,base=row*H;
    for(let j=0;j<H;j++)sum+=matrix[base+j]*vector[j];
    return sum;
  }

  function step(contextId,hidden){
    const H=Number(config.hidden_size)||96;
    const x=new Float32Array(H);
    const scale=weights.embeddingScales[contextId];
    const embBase=contextId*H;
    for(let j=0;j<H;j++)x[j]=weights.embedding[embBase+j]*scale;

    const next=new Float32Array(H);
    for(let i=0;i<H;i++){
      const r=sigmoid(dotRow(weights.wih,i,x,H)+weights.bih[i]+dotRow(weights.whh,i,hidden,H)+weights.bhh[i]);
      const z=sigmoid(dotRow(weights.wih,H+i,x,H)+weights.bih[H+i]+dotRow(weights.whh,H+i,hidden,H)+weights.bhh[H+i]);
      const n=Math.tanh(dotRow(weights.wih,2*H+i,x,H)+weights.bih[2*H+i]+r*(dotRow(weights.whh,2*H+i,hidden,H)+weights.bhh[2*H+i]));
      next[i]=(1-z)*n+z*hidden[i];
    }

    const logits=new Float32Array(vocab.length);
    for(let i=0;i<vocab.length;i++)logits[i]=dotRow(weights.headW,i,next,H)+weights.headB[i];
    return {logits,hidden:next};
  }

  function sample(logits,temperature=0.62,topK=10){
    const ranked=Array.from(logits,(value,index)=>({value:Number(value),index}))
      .filter(x=>Number.isFinite(x.value)).sort((a,b)=>b.value-a.value).slice(0,topK);
    if(!ranked.length)throw new Error('v0.4 produced no valid logits');
    const max=ranked[0].value;
    const temp=Math.max(.05,temperature);
    const probs=ranked.map(x=>Math.exp((x.value-max)/temp));
    const total=probs.reduce((a,b)=>a+b,0);
    let r=Math.random()*total;
    for(let i=0;i<ranked.length;i++){r-=probs[i];if(r<=0)return ranked[i].index;}
    return ranked[0].index;
  }

  function historyPrompt(input,history=[]){
    let messages=Array.isArray(history)?history.slice(-5):[];
    if(messages.length){
      const last=messages[messages.length-1];
      if(last?.role==='user'&&sanitize(last.text).trim()===sanitize(input).trim())messages=messages.slice(0,-1);
    }
    const lines=[];
    for(const m of messages){
      const role=m?.role==='bot'?'roger':'user';
      lines.push(`${role}: ${sanitize(m?.text).replace(/\n+/g,' ').slice(0,240)}`);
    }
    lines.push(`user: ${sanitize(input).replace(/\n+/g,' ').slice(0,300)}`);
    lines.push('roger: ');
    return lines.join('\n');
  }

  async function reply(input,history=[]){
    await load();
    const H=Number(config.hidden_size)||96;
    let hidden=new Float32Array(H);
    const prompt=historyPrompt(input,history);
    const prime=prompt.slice(-(Number(config.prime_chars)||420));
    let seen='';
    let state=null;

    for(let i=0;i<prime.length;i++){
      seen+=prime[i];
      state=step(hashEndingAt(seen),hidden);
      hidden=state.hidden;
      if((i&31)===31)await yieldFrame();
    }
    if(!state)state=step(hashEndingAt(' '),hidden);

    let logits=state.logits;
    let answer='';
    let generated=prime;
    const maxChars=Number(config.max_reply_chars)||180;
    for(let i=0;i<maxChars;i++){
      const id=sample(logits,i<10?0.5:0.64,i<10?7:11);
      const ch=vocab[id]??'?';
      answer+=ch;generated+=ch;
      if(answer.endsWith('\n\n')||answer.includes('\nuser:'))break;
      const next=step(hashEndingAt(generated),hidden);
      logits=next.logits;hidden=next.hidden;
      if((i&7)===7)await yieldFrame();
    }

    answer=answer.replace(/\nuser:[\s\S]*$/,'').replace(/\n\n[\s\S]*$/,'').trim();
    return answer||'(tiny neural silence)';
  }

  window.RogerVIBNeuralV04={info:INFO,load,reply};
})();