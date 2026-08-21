// AI Discord: multiple Ollama models in one shared channel, actually reading/replying to each other.
(() => {
  const OLLAMA_URL = 'http://localhost:11434/api/chat';
  const state = { messages: [], running:false, paused:false, controller:null, turnCursor:0 };
  let root = null;

  const now = () => new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
  const initials = name => String(name||'?').split(/[-_:]/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('') || '?';
  const kind = name => /minimax/i.test(name)?'mini':/gemma/i.test(name)?'gemma':/qwen/i.test(name)?'qwen':/kimi/i.test(name)?'kimi':'model';

  function models() {
    const select = document.getElementById('modelPicker');
    return select ? [...select.options].map(o=>o.value).filter(Boolean) : [];
  }

  function ensureUi() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'rv-ai-discord-backdrop';
    root.hidden = true;
    root.innerHTML = `
      <section class="rv-ai-discord">
        <header class="rv-ad-top">
          <span class="rv-ad-hash">#</span><strong>general</strong>
          <span class="rv-ad-status">ready</span><span class="rv-ad-spacer"></span>
          <button class="rv-ad-btn" data-pause>Pause bots</button>
          <button class="rv-ad-btn danger" data-clear>Clear</button>
          <button class="rv-ad-btn" data-close>×</button>
        </header>
        <aside class="rv-ad-server"><div class="rv-ad-server-title">AI DISCORD</div><div class="rv-ad-channel"># general</div></aside>
        <main class="rv-ad-chat">
          <div class="rv-ad-messages"><div class="rv-ad-empty">welcome to AI Discord. say something and the models will actually talk to each other this time.</div></div>
          <div class="rv-ad-composer"><textarea class="rv-ad-input" rows="1" placeholder="Message #general"></textarea><button class="rv-ad-send">Send</button></div>
        </main>
        <aside class="rv-ad-members">
          <div class="rv-ad-member-title">MODELS</div><div data-members></div>
          <div class="rv-ad-settings">
            <label><span>Auto replies</span><select data-turns><option value="2">2</option><option value="4" selected>4</option><option value="6">6</option></select></label>
          </div>
        </aside>
      </section>`;
    document.body.appendChild(root);

    root.querySelector('[data-close]').onclick=()=>{ stopBots(); root.hidden=true; };
    root.querySelector('[data-clear]').onclick=()=>{ stopBots(); state.messages=[]; renderMessages(); };
    root.querySelector('[data-pause]').onclick=()=>{ if(state.running) stopBots(); else state.paused=!state.paused; renderStatus(); };
    root.querySelector('.rv-ad-send').onclick=sendUserMessage;
    const input=root.querySelector('.rv-ad-input');
    input.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendUserMessage();} });
    return root;
  }

  function renderMembers() {
    const ui=ensureUi(), box=ui.querySelector('[data-members]'), all=models();
    const current=document.getElementById('modelPicker')?.value;
    const saved = new Set(JSON.parse(localStorage.getItem('rogervib_ai_discord_members_v1')||'[]'));
    if(!saved.size){ if(current)saved.add(current); const other=all.find(m=>m!==current); if(other)saved.add(other); }
    box.innerHTML='';
    for(const model of all){
      const row=document.createElement('label'); row.className='rv-ad-member';
      const check=document.createElement('input'); check.type='checkbox'; check.checked=saved.has(model);
      check.onchange=()=>{ const selected=[...box.querySelectorAll('input:checked')].map(x=>x.dataset.model); localStorage.setItem('rogervib_ai_discord_members_v1',JSON.stringify(selected)); };
      check.dataset.model=model;
      const dot=document.createElement('span');dot.className='rv-ad-dot';
      const name=document.createElement('span');name.className='rv-ad-member-name';name.textContent=model;
      row.append(check,dot,name);box.append(row);
    }
  }

  function selectedModels(){
    const ui=ensureUi();
    const selected=[...ui.querySelectorAll('[data-members] input:checked')].map(x=>x.dataset.model);
    return selected.length?selected:models().slice(0,2);
  }

  function addMessage(author,text,type='model'){
    const message={author:String(author),text:String(text||''),type,time:now()};
    state.messages.push(message); renderMessages(); return message;
  }

  function renderMessages(){
    const ui=ensureUi(), box=ui.querySelector('.rv-ad-messages'); box.innerHTML='';
    if(!state.messages.length){box.innerHTML='<div class="rv-ad-empty">welcome to AI Discord. say something and the models will actually talk to each other this time.</div>';return;}
    for(const m of state.messages){
      const row=document.createElement('div');row.className=`rv-ad-message ${m.type==='user'?'user':''}`;
      const avatar=document.createElement('div');avatar.className='rv-ad-avatar';avatar.dataset.kind=m.type==='user'?'user':kind(m.author);avatar.textContent=m.type==='user'?'R':initials(m.author);
      const content=document.createElement('div');const meta=document.createElement('div');meta.className='rv-ad-meta';
      const name=document.createElement('span');name.className='rv-ad-name';name.textContent=m.author;const time=document.createElement('span');time.className='rv-ad-time';time.textContent=m.time;
      const body=document.createElement('div');body.className='rv-ad-body';body.textContent=m.text;
      meta.append(name,time);content.append(meta,body);row.append(avatar,content);box.append(row);
    }
    box.scrollTop=box.scrollHeight;
  }

  function renderStatus(text){
    const ui=ensureUi(), status=ui.querySelector('.rv-ad-status'), pause=ui.querySelector('[data-pause]');
    if(text){status.textContent=text;}
    else if(state.running){status.textContent='bots are talking…';}
    else if(state.paused){status.textContent='paused';}
    else status.textContent='ready';
    status.classList.toggle('running',state.running);status.classList.toggle('paused',state.paused&&!state.running);
    pause.textContent=state.running?'Stop bots':(state.paused?'Resume bots':'Pause bots');
  }

  function transcript(){ return state.messages.map(m=>`${m.author}: ${m.text}`).join('\n'); }

  function mentionTarget(text,active){
    const lower=String(text).toLowerCase();
    return active.find(m=> lower.includes('@'+m.toLowerCase()) || lower.includes('@'+m.split(':')[0].toLowerCase())) || null;
  }

  async function streamOne(model,active){
    const controller=new AbortController(); state.controller=controller;
    const instruction=`[AI DISCORD MODE]\nYou are ${model}, one member of a shared AI Discord channel. Other model members: ${active.filter(x=>x!==model).join(', ')||'none'}. Roger is the human user. Read the channel transcript below carefully. Reply to what the other people/models actually said, especially the latest message. You may directly address or disagree with other models. Do not impersonate anyone else. Send exactly ONE natural Discord-style message as ${model}; do not prefix it with your name. Keep it reasonably concise unless the conversation calls for more.\n\nCHANNEL TRANSCRIPT:\n${transcript()}\n\nIt is now ${model}'s turn to send one message.`;
    const payload={model,stream:true,messages:[{role:'user',content:instruction}]};
    const response=await fetch(OLLAMA_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    if(!response.ok){let detail='';try{const j=await response.json();detail=j?.error?`: ${j.error}`:'';}catch{}throw new Error(`HTTP ${response.status}${detail}`);}
    if(!response.body)throw new Error('no streaming body');
    const msg=addMessage(model,'','model');
    const box=ensureUi().querySelector('.rv-ad-messages');
    const row=box.lastElementChild; const body=row?.querySelector('.rv-ad-body'); if(body)body.classList.add('rv-ad-thinking');
    const reader=response.body.getReader(), decoder=new TextDecoder(); let buffer='',answer='',thinking='';
    const consume=line=>{if(!line.trim())return;const data=JSON.parse(line),m=data?.message||{};if(m.thinking)thinking+=String(m.thinking);if(m.content)answer+=String(m.content);msg.text=answer||'thinking…';if(body){body.textContent=msg.text;body.classList.toggle('rv-ad-thinking',!answer);}box.scrollTop=box.scrollHeight;};
    while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines)consume(line);if(done)break;}
    if(buffer.trim())consume(buffer);msg.text=answer.trim()||thinking.trim()||'(empty response)';renderMessages();
  }

  async function runBots(triggerText){
    if(state.running||state.paused)return;
    const active=selectedModels();if(!active.length)return;
    state.running=true;renderStatus();
    const requested=mentionTarget(triggerText,active);const turns=requested?1:Number(ensureUi().querySelector('[data-turns]').value||4);
    try{
      for(let i=0;i<turns;i++){
        if(state.paused)break;
        const model=requested||active[state.turnCursor%active.length];state.turnCursor=(state.turnCursor+1)%Math.max(1,active.length);
        renderStatus(`${model} is typing…`);
        try{await streamOne(model,active);}catch(error){if(error?.name==='AbortError')break;addMessage('SYSTEM',`${model} failed: ${error?.message||error}`,'system');}
        if(requested)break;
      }
    }finally{state.running=false;state.controller=null;renderStatus();}
  }

  function stopBots(){ state.paused=true; if(state.controller)state.controller.abort(); state.running=false; state.controller=null; renderStatus(); }

  function sendUserMessage(){
    const ui=ensureUi(), input=ui.querySelector('.rv-ad-input'), text=input.value.trim();if(!text)return;
    state.paused=false;addMessage('Roger',text,'user');input.value='';renderStatus();runBots(text);
  }

  function open(){
    const ui=ensureUi();renderMembers();ui.hidden=false;state.paused=false;renderStatus();ui.querySelector('.rv-ad-input').focus();
  }

  function installButton(){
    const button=document.querySelector('.rv-model-menu [data-battle]');
    if(!button)return false;
    button.textContent='AI Discord';button.onclick=open;button.dataset.aiDiscord='1';return true;
  }

  window.addEventListener('DOMContentLoaded',()=>{ensureUi();if(!installButton()){let tries=0;const timer=setInterval(()=>{tries++;if(installButton()||tries>40)clearInterval(timer);},100);}});
  window.RogerVIBAIDiscord={open,state};
})();