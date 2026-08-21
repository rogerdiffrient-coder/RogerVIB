// RogerVIB Micro v0.3 Neural
// Real browser-trained character language model using TensorFlow.js.
(() => {
  const MODEL_URL='indexeddb://rogervib-micro-v03';
  const SEQ=64;
  const EMBED=192;
  const UNITS=896;
  const CHARS=['\n',' '];
  for(let i=33;i<=126;i++)CHARS.push(String.fromCharCode(i));
  const VOCAB=[...new Set(CHARS)];
  const TO_ID=new Map(VOCAB.map((c,i)=>[c,i]));
  const UNKNOWN=TO_ID.get('?')||0;

  const INFO={
    id:'neural-v0.3',
    name:'Micro v0.3 — Neural',
    version:'0.3',
    architecture:'char GRU language model',
    parameterCount:3031776,
    sequenceLength:SEQ,
    trained:false
  };

  const seedPairs=[
    ['hi','hey! whats up?'],['hello','hey! whats up?'],['hey','yo!'],['yo','yo'],['sup','not much. tiny brain activities.'],
    ['good morning','morning!'],['good night','night!'],['bye','cya'],['thanks','np'],['thank you','np'],['ok','yep'],['okay','yep'],
    ['lol','lol'],['lmao','lmao'],['bruh','bruh'],['oh','yeah'],['nice','yooo'],['cool','yooo'],['banana','banana'],
    ['cheese','cheese is carrying this entire project at this point'],
    ['who are you','im RogerVIB Micro v0.3. im a tiny neural chatbot trained directly in your browser.'],
    ['what model are you','RogerVIB Micro v0.3 Neural. im a small character-level language model with about 3 million learned parameters.'],
    ['are you actually predicting text','yep. this neural version predicts the next character repeatedly from learned weights.'],
    ['how do you work','i read recent text, predict a probability for the next character, choose one, append it, and repeat.'],
    ['are you an llm','technically im a tiny language model. extremely tiny compared with modern LLMs, but the basic prediction idea is real.'],
    ['are you smart','tiny-model smart. which means sometimes clever and sometimes impressively confused.'],
    ['are you conscious','no. im a trained text model, not a conscious being.'],['are you sentient','nope. chatbot, not tiny digital person.'],
    ['can you learn','i can be retrained on better conversation data. my saved weights change during training, not secretly during normal chat.'],
    ['what is training','training shows me text, measures how wrong my next-character predictions are, then updates my weights to reduce that error.'],
    ['what are parameters','parameters are learned numbers inside a neural model. training adjusts them.'],
    ['how many parameters do you have','this v0.3 architecture has 3,031,776 trainable parameters.'],
    ['what is a neural network','a neural network is a stack of mathematical operations with learned weights that can fit patterns from data.'],
    ['what is a token','a token is a unit a language model predicts. i use characters as my tokens right now.'],
    ['what is next token prediction','it means looking at previous text and predicting what unit should come next, then repeating that process to generate more text.'],
    ['what is a gru','a GRU is a recurrent neural network layer with gates that help it carry useful information forward through a sequence.'],
    ['what is ai','AI is software built to perform tasks that usually need some kind of intelligence, like recognizing patterns or generating language.'],
    ['what is machine learning','machine learning builds behavior by fitting model parameters to data instead of manually coding every answer.'],
    ['what is javascript','JavaScript is the programming language running this webpage and the code around my neural model.'],
    ['what is python','Python is a general-purpose programming language heavily used for machine learning, automation, and data work.'],
    ['what is html','HTML describes the structure and content of a webpage.'],['what is css','CSS controls how a webpage looks.'],
    ['what is github','GitHub hosts Git repositories and collaboration tools like pull requests and issues.'],
    ['what is geometry dash','Geometry Dash is a rhythm platformer with timing-heavy gameplay and a huge custom level editor community.'],
    ['geometry dash','cube jumps over spike. civilization achieved.'],['what is minecraft','Minecraft is a sandbox game about blocks, building, survival, and making absurd contraptions.'],
    ['im bored','dangerous sentence. wanna make something weird?'],['give me an idea','make the smallest stupid project you can finish quickly, then add one feature that makes it way funnier.'],
    ['tell me a joke','my context window walked into a bar. it forgot why halfway through.'],['you are dumb','correct. im three million parameters fighting for my life.'],
    ['you suck','valid benchmark result. retrain me.'],['good job','yooo'],['how are you','doing suspiciously well for three million parameters.'],
    ['what is 1 plus 1','2'],['1+1','2'],['2+2','4'],['what can you do','chat badly but genuinely with learned weights. thats the entire v0.3 mission.'],
    ['what can you not do','no web, no vision, no tools, and my world knowledge is tiny.'],['are you local','yep. training and inference happen in your browser.']
  ];

  let model=null;
  let loading=null;

  const encodeChar=c=>TO_ID.has(c)?TO_ID.get(c):UNKNOWN;
  const sanitize=s=>String(s||'').replace(/[^\n\x20-\x7E]/g,'?');
  const formatPair=(u,a)=>`user: ${sanitize(u)}\nroger: ${sanitize(a)}\n\n`;

  function buildModel(){
    if(!window.tf)throw new Error('TensorFlow.js did not load');
    const input=tf.input({shape:[SEQ],dtype:'int32'});
    let x=tf.layers.embedding({inputDim:VOCAB.length,outputDim:EMBED,inputLength:SEQ}).apply(input);
    x=tf.layers.gru({units:UNITS,returnSequences:true}).apply(x);
    const output=tf.layers.dense({units:VOCAB.length,activation:'softmax'}).apply(x);
    const m=tf.model({inputs:input,outputs:output,name:'rogervib_micro_v03'});
    m.compile({optimizer:tf.train.adam(0.0015),loss:'sparseCategoricalCrossentropy'});
    INFO.parameterCount=m.countParams();
    return m;
  }

  async function load(){
    if(model)return model;
    if(loading)return loading;
    loading=(async()=>{
      try{
        model=await tf.loadLayersModel(MODEL_URL);
        model.compile({optimizer:tf.train.adam(0.0015),loss:'sparseCategoricalCrossentropy'});
        INFO.trained=true;
      }catch{
        model=null;
        INFO.trained=false;
      }
      return model;
    })();
    const result=await loading;loading=null;return result;
  }

  function conversationCorpus(extraChats=[]){
    let text='';
    for(const [u,a] of seedPairs)text+=formatPair(u,a);
    for(const chat of extraChats||[]){
      const msgs=Array.isArray(chat?.messages)?chat.messages:[];
      for(let i=0;i<msgs.length-1;i++){
        if(msgs[i]?.role==='user'&&msgs[i+1]?.role==='bot')text+=formatPair(msgs[i].text,msgs[i+1].text);
      }
    }
    // Repeat the seed corpus so a tiny dataset still gives useful gradient steps.
    return text.repeat(4);
  }

  function makeDataset(text,maxSamples=1600){
    const ids=[...sanitize(text)].map(encodeChar);
    const xs=[],ys=[];
    const stride=Math.max(1,Math.floor((ids.length-SEQ-1)/maxSamples));
    for(let i=0;i+SEQ<ids.length;i+=stride){
      xs.push(ids.slice(i,i+SEQ));
      ys.push(ids.slice(i+1,i+SEQ+1));
      if(xs.length>=maxSamples)break;
    }
    return {xs:tf.tensor2d(xs,[xs.length,SEQ],'int32'),ys:tf.tensor2d(ys,[ys.length,SEQ],'int32'),count:xs.length};
  }

  async function train(extraChats=[],onProgress=()=>{}){
    await tf.ready();
    model=buildModel();
    const corpus=conversationCorpus(extraChats);
    const data=makeDataset(corpus);
    onProgress({stage:'start',samples:data.count,params:model.countParams(),epoch:0,loss:null});
    try{
      await model.fit(data.xs,data.ys,{
        epochs:3,batchSize:16,shuffle:true,
        callbacks:{
          onEpochEnd:async(epoch,logs)=>{
            onProgress({stage:'training',samples:data.count,params:model.countParams(),epoch:epoch+1,epochs:3,loss:Number(logs?.loss)});
            await tf.nextFrame();
          }
        }
      });
      await model.save(MODEL_URL);
      INFO.trained=true;
      onProgress({stage:'done',samples:data.count,params:model.countParams(),epoch:3,epochs:3});
      return INFO;
    }finally{data.xs.dispose();data.ys.dispose();}
  }

  function sample(probs,temperature=0.72){
    const adjusted=Array.from(probs,p=>Math.pow(Math.max(p,1e-12),1/temperature));
    const total=adjusted.reduce((a,b)=>a+b,0);let r=Math.random()*total;
    for(let i=0;i<adjusted.length;i++){r-=adjusted[i];if(r<=0)return i;}
    return adjusted.length-1;
  }

  async function reply(input,history=[]){
    await tf.ready();
    await load();
    if(!model)throw new Error('Micro v0.3 is not trained yet');
    const recent=(history||[]).slice(-6).map(m=>`${m.role==='user'?'user':'roger'}: ${sanitize(m.text)}\n`).join('');
    let generated=`${recent}user: ${sanitize(input)}\nroger: `;
    let answer='';
    for(let step=0;step<220;step++){
      const context=[...generated].slice(-SEQ).map(encodeChar);
      while(context.length<SEQ)context.unshift(TO_ID.get(' '));
      const nextId=tf.tidy(()=>{
        const x=tf.tensor2d([context],[1,SEQ],'int32');
        const pred=model.predict(x);
        const last=pred.slice([0,SEQ-1,0],[1,1,VOCAB.length]).reshape([VOCAB.length]);
        return sample(last.dataSync());
      });
      const ch=VOCAB[nextId]||'?';
      generated+=ch;answer+=ch;
      if(answer.endsWith('\n\n')||answer.includes('\nuser:'))break;
      if(step%12===0)await tf.nextFrame();
    }
    answer=answer.replace(/\nuser:[\s\S]*$/,'').trim();
    return answer||'(tiny neural silence)';
  }

  async function erase(){
    try{await tf.io.removeModel(MODEL_URL);}catch{}
    if(model){model.dispose();model=null;}INFO.trained=false;
  }

  window.RogerVIBNeural={info:INFO,load,train,reply,erase,seedCount:seedPairs.length};
})();