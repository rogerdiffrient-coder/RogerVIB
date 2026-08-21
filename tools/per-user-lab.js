// Per-user AI Lab settings: persona + temperature live on AI users, not the global model menu.
(() => {
  const USERS_KEY='rogervib_ai_users_v1';
  const CHATS_KEY='rogervib_chats_v1';
  const ACTIVE_KEY='rogervib_active_chat_v1';
  const META_KEY='rogervib_chat_meta_v1';
  const PERSONAS={
    rogervib:{name:'RogerVIB',prompt:'use the normal rogervib personality and vibe.'},
    chaos:{name:'absolute chaos',prompt:'lean hard into chaotic funny chat energy. stay useful and truthful, but weird jokes and unhinged phrasing are welcome.'},
    corporate:{name:'corporate drone',prompt:'use polished professional grammar, restrained tone, and boring corporate-assistant energy. do not use slang.'},
    zen:{name:'zen master',prompt:'be extremely concise, calm, low-sass, and direct. usually one or two sentences unless detail is necessary.'},
    nerd:{name:'lab nerd',prompt:'be curious, technical, precise, and enthusiastic about how things work. explain mechanisms when useful without becoming corporate.'}
  };
  const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback;}catch{return fallback;}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));

  function currentUser(){
    const active=localStorage.getItem(ACTIVE_KEY)||'';
    const chat=read(CHATS_KEY,[]).find(c=>c.id===active);
    const memberIds=read(META_KEY,{})[active]?.members||[];
    const users=read(USERS_KEY,[]);
    const byMember=memberIds.map(id=>users.find(u=>u.id===id)).find(Boolean);
    if(byMember)return byMember;
    return users.find(u=>u.model===chat?.model)||users.find(u=>u.id==='__rogervib__')||null;
  }

  function injectFields(modal){
    const card=modal.querySelector('.rv-sidebar-modal-card');
    if(!card||card.dataset.userLabReady==='1')return;
    card.dataset.userLabReady='1';
    const heading=card.querySelector('h2')?.textContent||'';
    const oldName=heading.startsWith('Edit ')?heading.slice(5):'';
    const before=oldName?read(USERS_KEY,[]).find(u=>u.name===oldName):null;
    const prompt=card.querySelector('[data-prompt]');
    if(!prompt)return;

    const wrap=document.createElement('div');
    wrap.className='rv-user-lab-fields';
    wrap.innerHTML='<label>Persona</label><select data-user-persona></select><label>Temperature <span data-user-temp-label></span></label><input data-user-temp type="range" min="0" max="1.5" step="0.05"><small class="rv-avatar-help">0 = deterministic · 1.5 = chaos</small>';
    const persona=wrap.querySelector('[data-user-persona]');
    for(const [id,p] of Object.entries(PERSONAS)){const o=document.createElement('option');o.value=id;o.textContent=p.name;persona.append(o);}
    const temp=wrap.querySelector('[data-user-temp]');
    const tempLabel=wrap.querySelector('[data-user-temp-label]');
    persona.value=PERSONAS[before?.persona]?before.persona:'rogervib';
    temp.value=String(Number.isFinite(Number(before?.temperature))?Math.max(0,Math.min(1.5,Number(before.temperature))):0.7);
    const renderTemp=()=>tempLabel.textContent=Number(temp.value).toFixed(2);
    temp.addEventListener('input',renderTemp);renderTemp();
    prompt.parentNode.insertBefore(wrap,prompt.previousElementSibling || prompt);

    const save=card.querySelector('[data-save]');
    save?.addEventListener('click',()=>{
      const newName=card.querySelector('[data-name]')?.value.trim();
      const existingId=before?.id||null;
      const personaValue=persona.value;
      const temperature=Number(temp.value);
      setTimeout(()=>{
        const list=read(USERS_KEY,[]);
        const user=(existingId&&list.find(u=>u.id===existingId))||[...list].reverse().find(u=>u.name===newName);
        if(!user)return;
        user.persona=PERSONAS[personaValue]?personaValue:'rogervib';
        user.temperature=Math.max(0,Math.min(1.5,Number.isFinite(temperature)?temperature:0.7));
        write(USERS_KEY,list);
        window.dispatchEvent(new CustomEvent('rogervib-ai-users-changed'));
      },0);
    });
  }

  const observer=new MutationObserver(()=>document.querySelectorAll('.rv-sidebar-modal').forEach(injectFields));
  window.addEventListener('DOMContentLoaded',()=>{
    observer.observe(document.body,{childList:true,subtree:false});
    document.querySelectorAll('.rv-sidebar-modal').forEach(injectFields);
  });

  // Loaded late: this becomes the final authority for per-user persona + temperature.
  const previousFetch=window.fetch.bind(window);
  window.fetch=async function RogerVIBPerUserFetch(input,init={}){
    const url=typeof input==='string'?input:input?.url||'';
    if(!url.includes('localhost:11434/api/chat')||typeof init?.body!=='string')return previousFetch(input,init);
    try{
      const payload=JSON.parse(init.body);
      const user=currentUser();
      if(user){
        const temperature=Number.isFinite(Number(user.temperature))?Math.max(0,Math.min(1.5,Number(user.temperature))):0.7;
        payload.options={...(payload.options||{}),temperature};
        const personaKey=PERSONAS[user.persona]?user.persona:'rogervib';
        const system=Array.isArray(payload.messages)?payload.messages.find(m=>m?.role==='system'):null;
        if(system&&personaKey!=='rogervib')system.content=`${system.content}\n\nCURRENT AI USER PERSONA — REAL PER-USER SETTING:\n${PERSONAS[personaKey].prompt}`;
        if(system&&user.prompt)system.content=`${system.content}\n\nCURRENT AI USER CUSTOM INSTRUCTIONS:\n${user.prompt}`;
      }
      return previousFetch(input,{...init,body:JSON.stringify(payload)});
    }catch{return previousFetch(input,init);}
  };

  window.RogerVIBUserLab={personas:PERSONAS,currentUser};
})();