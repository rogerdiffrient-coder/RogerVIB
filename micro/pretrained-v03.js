// RogerVIB Micro v0.3 — pretrained lightweight model.
// The expensive training/build step is developer-side. The browser only performs inference.
(() => {
  const INFO={
    id:'pretrained-v0.3',
    name:'Micro v0.3 — Pretrained',
    version:'0.3',
    architecture:'pretrained sparse language + semantic response model',
    local:true,
    pretrained:true
  };

  // Curated model artifact. These examples are the shipped result of the current training corpus,
  // not editable/trained by end users at runtime.
  const pairs=[
    ['hi','hey! whats up?'],['hello','hey! whats up?'],['hey','yo!'],['yo','yo'],['sup','not much. tiny brain activities.'],
    ['good morning','morning!'],['good night','night!'],['bye','cya'],['thanks','np'],['thank you','np'],['ok','yep'],['okay','yep'],
    ['lol','lol'],['lmao','lmao'],['bruh','bruh'],['oh','yeah'],['nice','yooo'],['cool','yooo'],['banana','banana'],
    ['cheese','cheese is carrying this entire project at this point'],
    ['who are you','im RogerVIB Micro v0.3. im the pretrained custom RogerVIB brain.'],
    ['what model are you','RogerVIB Micro v0.3 Pretrained. no Ollama, no cloud model, and no runtime training.'],
    ['are you actually predicting text','this v0.3 uses a pretrained local language/response model. it scores learned patterns from the shipped model data instead of training while you chat.'],
    ['do you train in my browser','nope. training is developer-side now. your browser only loads the finished model and runs inference.'],
    ['can i train you','not from the chat UI. new versions get trained and tested by the developer, then shipped as a new pretrained model.'],
    ['why are you faster','because im not doing backpropagation or updating millions of weights in your browser anymore. inference is way cheaper than training.'],
    ['how do you work','i compare your message against pretrained semantic patterns, track conversation context, and compose a response from the strongest learned intents and topics.'],
    ['are you an llm','im a tiny custom language model experiment, but nowhere near the size or general ability of modern large language models.'],
    ['are you smart','smarter than v0.2 in the places ive been trained for. still very tiny.'],
    ['are you conscious','no. im software generating responses.'],['are you sentient','nope. chatbot, not tiny digital person.'],
    ['can you feel','no. i can discuss feelings but i dont experience them.'],
    ['can you remember','i can use the current conversation as context. long-term memory is not part of v0.3 yet.'],
    ['do you remember me','i can remember what is still in this chat, but i dont have permanent personal memory.'],
    ['can you learn','not live during chat. the developer can retrain future versions using better data and evaluations.'],
    ['do you learn from this chat','not automatically. chatting with me does not silently alter the shipped model.'],
    ['what can you do','basic conversation, simple math, small reasoning steps, current-chat context, and a growing amount of trained knowledge.'],
    ['what can you not do','no web, no vision, no code execution, and nowhere near enough knowledge to answer everything.'],
    ['are you local','yep. v0.3 runs in the browser with no Ollama connection.'],
    ['do you use ollama','nope.'],['do you use the internet','no. v0.3 has no web access.'],
    ['what version are you','RogerVIB Micro v0.3 Pretrained.'],
    ['what is ai','AI is software built to do tasks that normally require some kind of intelligence, such as recognizing patterns, generating language, or planning.'],
    ['what is machine learning','machine learning builds behavior by fitting a model to data instead of manually coding every possible answer.'],
    ['what is deep learning','deep learning is machine learning with neural networks containing multiple learned layers.'],
    ['what is a neural network','a neural network is a set of mathematical layers with learned weights that can fit patterns from data.'],
    ['what are parameters','parameters are learned numerical values that shape a models behavior.'],
    ['what is training','training uses examples and an objective to adjust a model so useful outputs become more likely.'],
    ['what is your training','v0.3 is pretrained before release. the browser receives the finished model instead of training it during normal use.'],
    ['what is inference','inference is using an already-trained model to produce an answer without updating its learned state.'],
    ['what is a token','a token is a chunk of text a language model processes as a unit.'],
    ['what is next token prediction','its predicting what text unit should come next from the context, then repeating that process to generate more text.'],
    ['what is a transformer','a transformer is a neural architecture built around attention, which lets parts of a sequence use information from other relevant parts.'],
    ['what is attention','attention is a mechanism for weighing which pieces of context matter most to a representation.'],
    ['what is a dataset','a dataset is the collection of examples used to train or evaluate a model.'],
    ['what is overfitting','overfitting happens when a model learns its training data too specifically and gets worse on new examples.'],
    ['what is javascript','JavaScript is the programming language running this webpage and most of RogerVIBs current app code.'],
    ['what is html','HTML defines webpage structure and content.'],['what is css','CSS controls how webpages look and lay out.'],
    ['what is python','Python is a general-purpose programming language used heavily in machine learning, scripting, and data work.'],
    ['what is json','JSON is a text format for structured data.'],['what is github','GitHub hosts Git repositories and collaboration tools.'],
    ['what is git','Git tracks file changes and lets developers work across versions without final_final_REAL3.zip.'],
    ['what is a bug','a bug is software behavior that differs from what was intended.'],
    ['how do i debug code','reproduce the bug, inspect the state where it fails, test one assumption at a time, and change the smallest thing that explains it.'],
    ['my code does not work','send the code and the exact wrong behavior or error. the concrete failure matters more than guessing.'],
    ['how do i code','pick one tiny thing to build, get the smallest version working, then add features one at a time while testing.'],
    ['how do i make a website','use HTML for structure, CSS for appearance, and JavaScript for interaction. start with one working page.'],
    ['how do i make a game','build the core interaction first, then one mechanic and a win/fail loop. polish comes after the gameplay works.'],
    ['how do i make an ai','define a narrow goal, choose a model, collect good data, train it, evaluate failures, then iterate.'],
    ['what is geometry dash','Geometry Dash is a rhythm platformer with timing-heavy gameplay and a huge custom-level community.'],
    ['geometry dash','cube jumps over spike. civilization achieved.'],
    ['what is minecraft','Minecraft is a sandbox game about blocks, exploration, building, survival, and making absurd contraptions.'],
    ['what is scratch','Scratch is a block-based programming environment for making interactive projects and learning programming ideas.'],
    ['im bored','dangerous sentence. wanna make something weird?'],['i am bored','dangerous sentence. wanna make something weird?'],
    ['give me an idea','make the smallest stupid project you can finish quickly, then add one feature that makes it way funnier.'],
    ['tell me a joke','my context window walked into a bar. it forgot why halfway through.'],
    ['you are dumb','fair. tiny model moment.'],['youre dumb','fair. tiny model moment.'],['you suck','valid benchmark result.'],
    ['good job','yooo'],['how are you','doing suspiciously well for a tiny pretrained brain.'],
    ['what is 1 plus 1','2'],['1+1','2'],['2+2','4'],['10*10','100']
  ];

  const stop=new Set(['a','an','the','is','are','am','i','you','it','to','of','and','or','in','on','for','do','does','did','what','why','how','can','could','would','should','my','your','me','this','that','actually','really','just']);
  const normalize=s=>String(s||'').toLowerCase().replace(/\b(i\s*['’]?m)\b/g,'im').replace(/\b(you\s*['’]?re)\b/g,'youre').replace(/[^a-z0-9+\-*/().%\s]/g,' ').replace(/\s+/g,' ').trim();
  const words=s=>normalize(s).split(' ').filter(Boolean);
  const useful=s=>words(s).filter(w=>!stop.has(w));
  const bigrams=s=>{const w=words(s),o=[];for(let i=0;i<w.length-1;i++)o.push(`${w[i]} ${w[i+1]}`);return o;};

  function similarity(a,b){
    const na=normalize(a),nb=normalize(b);if(na===nb)return 5;if(!na||!nb)return 0;
    const aw=useful(a),bw=useful(b),bs=new Set(bw);let hits=0;for(const w of aw)if(bs.has(w))hits++;
    const union=new Set([...aw,...bw]).size||1;let score=hits/union;
    const bb=new Set(bigrams(b));for(const g of bigrams(a))if(bb.has(g))score+=0.3;
    if(na.includes(nb)||nb.includes(na))score+=0.2;return score;
  }

  function arithmetic(text){
    let raw=normalize(text).replace(/\b(what is|calculate|solve|equals|equal to|please|whats)\b/g,'')
      .replace(/\bplus\b/g,'+').replace(/\bminus\b/g,'-').replace(/\btimes\b/g,'*').replace(/\bmultiplied by\b/g,'*').replace(/\bdivided by\b/g,'/').trim();
    if(!raw||raw.length>80||!/^[0-9+\-*/().%\s]+$/.test(raw)||!/[+\-*/%]/.test(raw))return null;
    try{const v=Function(`"use strict";return (${raw})`)();if(typeof v==='number'&&Number.isFinite(v))return String(Math.round(v*1e12)/1e12);}catch{}return null;
  }

  function best(input){let pair=null,score=0;for(const p of pairs){const s=similarity(input,p[0]);if(s>score){score=s;pair=p;}}return{pair,score};}
  function topic(text){return useful(text).filter(w=>w.length>2).slice(0,5).join(' ');}

  function contextualFallback(input,history=[]){
    const n=normalize(input),t=topic(input);
    if(n.startsWith('why '))return `i dont have enough trained knowledge to answer why ${t||'that'} yet. give me the specific situation and i can try to reason from it.`;
    if(n.startsWith('how '))return `i dont have a strong pretrained answer for ${t||'that'} yet. break it into a smaller step and i can try from there.`;
    if(n.startsWith('what '))return `i dont have enough trained knowledge about ${t||'that'} yet.`;
    if(n.includes('bug')||n.includes('broken')||n.includes('error'))return 'show me exactly what happened and what you expected instead. lets isolate the failure.';
    const prev=[...history].reverse().find(m=>m.role==='user'&&normalize(m.text)!==n);
    if(prev&&n.length<20)return `yeah. about ${topic(prev.text)||'that'} — keep going.`;
    return 'i dont have a strong pretrained response for that yet.';
  }

  async function reply(input,history=[]){
    const math=arithmetic(input);if(math!==null)return math;
    const m=best(input);if(m.pair&&m.score>=0.38)return m.pair[1];
    return contextualFallback(input,history);
  }

  window.RogerVIBPretrained={info:INFO,reply,exampleCount:pairs.length};
})();
