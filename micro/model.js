// RogerVIB Micro v0.1
// A tiny local chatbot baseline with no external model/runtime dependency.
// The app targets a 1,048,576-parameter neural model later; this first brain is
// deliberately transparent retrieval + lightweight reasoning so we can iterate fast.
(() => {
  const INFO = {
    name: 'RogerVIB Micro',
    version: '0.1',
    architecture: 'retrieval-reasoning baseline',
    parameterBudget: 1048576,
    trainedParameters: 0,
    local: true
  };

  const examples = [
    ['hi', 'hey! whats up?'],
    ['hello', 'hey! whats up?'],
    ['hey', 'yo!'],
    ['who are you', 'im RogerVIB Micro v0.1. tiny local brain rn, but this is where the custom ai starts.'],
    ['what model are you', 'RogerVIB Micro v0.1. no Ollama, no cloud model. this first version is a tiny local baseline we can keep upgrading.'],
    ['what can you do', 'right now: basic conversation, simple reasoning, some math, and remembering the current chat. the whole point is to start tiny and make me better.'],
    ['thanks', 'np'],
    ['thank you', 'np'],
    ['how are you', 'doing suspiciously well for a v0.1 brain'],
    ['lol', 'lol'],
    ['lmao', 'lmao'],
    ['im bored', 'dangerous sentence. you wanna make something, break something harmless, or invent something stupid?'],
    ['what is javascript', 'JavaScript is the language that runs most interactive stuff in web pages. RogerVIB itself is currently running in JavaScript too.'],
    ['what is html', 'HTML is the structure of a web page: headings, buttons, text boxes, sections, all that stuff. CSS styles it and JavaScript makes it do things.'],
    ['what is css', 'CSS controls how a web page looks: layout, spacing, fonts, colors, animations, and so on.'],
    ['what is ai', 'AI is software built to perform tasks that normally need some kind of intelligence, like recognizing patterns, generating language, planning, or making predictions.'],
    ['what is a neural network', 'a neural network is a stack of numerical layers that learns useful patterns by adjusting weights during training.'],
    ['what are parameters', 'parameters are the learned numbers inside a model. training changes them so the model gets better at predicting useful outputs.'],
    ['what is training', 'training means showing a model lots of examples, measuring how wrong its predictions are, then adjusting its parameters to reduce that error.'],
    ['what is a transformer', 'a transformer is a neural network architecture that uses attention to decide which parts of its input matter to each other. modern language models mostly use transformers.'],
    ['how do i debug code', 'reduce the problem. reproduce the bug reliably, inspect the exact state where it breaks, test one assumption at a time, and change the smallest thing that explains the failure.'],
    ['my code does not work', 'send the code and the exact error or wrong behavior. the useful part is figuring out what actually happened instead of guessing around it.'],
    ['how do i make a game', 'start with the core interaction first. movement, one obstacle or mechanic, win/fail state. make that fun before menus, cosmetics, or giant systems.'],
    ['how do i make an ai', 'start with a narrow goal, choose a model architecture, prepare training examples, train it, test failures, then iterate. starting tiny is way easier to understand.'],
    ['why start small', 'because small models are cheap and fast to experiment with. when something improves, you can actually tell which change caused it.'],
    ['what is overfitting', 'overfitting is when a model memorizes its training examples too closely and gets worse at handling new examples.'],
    ['what is a dataset', 'a dataset is the collection of examples used to train or evaluate a model. bad data can absolutely kneecap a good architecture.'],
    ['geometry dash', 'cube jumps over spike. civilization achieved.'],
    ['what is geometry dash', 'Geometry Dash is a rhythm platformer built around timing jumps and other inputs through obstacle-heavy levels, with a huge level editor/community side too.'],
    ['what is 1 plus 1', '2'],
    ['1+1', '2'],
    ['2+2', '4'],
    ['why', 'depends what youre asking why about. give me the thing youre pointing at and ill try to reason through it.'],
    ['yes', 'alright'],
    ['no', 'fair'],
    ['ok', 'yep'],
    ['okay', 'yep'],
    ['test', 'yep, im alive'],
    ['banana', 'banana'],
    ['cheese', 'cheese is carrying this entire project at this point'],
    ['are you smart', 'v0.1 smart? kinda. actually smart? not yet. thats the fun part.'],
    ['can you learn', 'not automatically yet. but we can add examples, training data, evaluation tests, and eventually real learned weights.'],
    ['do you use ollama', 'nope. RogerVIB Micro runs directly in the page.'],
    ['are you local', 'yep. this v0.1 brain runs inside the browser and doesnt need Ollama.']
  ];

  const stop = new Set(['a','an','the','is','are','am','i','you','it','to','of','and','or','in','on','for','do','does','what','why','how','can','could','would','should','my','your','me']);
  const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9+\-*/().%\s]/g,' ').replace(/\s+/g,' ').trim();
  const words = s => normalize(s).split(' ').filter(Boolean);
  const usefulWords = s => words(s).filter(w => !stop.has(w));
  const bigrams = s => {
    const w = words(s); const out=[];
    for(let i=0;i<w.length-1;i++) out.push(`${w[i]} ${w[i+1]}`);
    return out;
  };

  function similarity(a,b){
    const aw=usefulWords(a), bw=usefulWords(b);
    if(!aw.length || !bw.length) return normalize(a)===normalize(b) ? 1 : 0;
    const bs=new Set(bw); let hits=0;
    for(const w of aw) if(bs.has(w)) hits++;
    const union=new Set([...aw,...bw]).size || 1;
    let score=hits/union;
    const bb=new Set(bigrams(b));
    for(const g of bigrams(a)) if(bb.has(g)) score+=0.22;
    if(normalize(a)===normalize(b)) score+=2;
    return score;
  }

  function safeArithmetic(text){
    const raw=normalize(text).replace(/\b(what is|calculate|solve|equals|equal to)\b/g,'').trim();
    if(!raw || raw.length>80) return null;
    if(!/^[0-9+\-*/().%\s]+$/.test(raw) || !/[+\-*/%]/.test(raw)) return null;
    try{
      // The character whitelist above keeps this arithmetic-only.
      const value=Function(`"use strict"; return (${raw})`)();
      if(typeof value==='number' && Number.isFinite(value)) return String(Math.round(value*1e12)/1e12);
    }catch{}
    return null;
  }

  function bestExample(input){
    let best=null, bestScore=0;
    for(const pair of examples){
      const score=similarity(input,pair[0]);
      if(score>bestScore){bestScore=score;best=pair;}
    }
    return {pair:best,score:bestScore};
  }

  function topic(input){
    const w=usefulWords(input).filter(x=>x.length>2);
    return w.slice(0,4).join(' ');
  }

  function fallback(input, history){
    const n=normalize(input);
    const t=topic(input);
    if(/\?$/.test(String(input).trim())){
      if(n.startsWith('why ')) return `probably because of something about ${t || 'the situation'}, but i dont know enough yet. give me a little more context.`;
      if(n.startsWith('how ')) return `i dont have a strong learned answer for that yet. break ${t || 'it'} into the smallest steps and i can try to reason through them with you.`;
      if(n.startsWith('what ')) return `i dont know enough about ${t || 'that'} yet. thats a good candidate for the training set.`;
      return `not sure yet. v0.1 brain moment. give me a little more context and ill try.`;
    }
    if(n.includes('bug') || n.includes('broken') || n.includes('error')) return 'show me exactly what happened and what you expected instead. lets isolate the failure instead of guessing.';
    if(n.includes('idea') || n.includes('make')) return `we can build off ${t || 'that'}. id start with the smallest version that proves the main idea works.`;
    const lastUser=[...(history||[])].reverse().find(m=>m.role==='user' && normalize(m.text)!==n);
    if(lastUser && n.length<18) return `yeah. about the ${topic(lastUser.text) || 'last thing'} — keep going.`;
    return `i dont have a good learned response for that yet. add this kind of example to my training data and v0.2 gets less dumb.`;
  }

  async function reply(input, history=[]){
    const math=safeArithmetic(input);
    if(math!==null) return math;
    const match=bestExample(input);
    if(match.pair && match.score>=0.42) return match.pair[1];
    return fallback(input,history);
  }

  window.RogerVIBMicro={info:INFO,reply,normalize,similarity};
})();