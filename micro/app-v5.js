// RogerVIB Micro app v0.5: v0.5 + v0.4 neural models with honest v0.2 fallback.
(() => {
  const CHATS_KEY='rogervib_micro_chats_v1';
  const ACTIVE_KEY='rogervib_micro_active_chat_v1';
  const DEFAULT_MODEL='neural-v0.5';
  const BUILD=window.ROGERVIB_BUILD||'dev';
  const MODELS={
    'neural-v0.5':{label:'Micro v0.5 — Damn Daniel',short:'Micro v0.5 Damn Daniel',params:24999992,runtime:()=>window.RogerVIBNeuralV05},
    'neural-v0.4':{label:'Micro v0.4 — Neural',short:'Micro v0.4 Neural',params:10049184,runtime:()=>window.RogerVIBNeuralV04},
    'baseline-v0.2':{label:'Micro v0.2 — Baseline',short:'Micro v0.2',params:0,runtime:()=>window.RogerVIBMicro},
  };
  const loading=new Set();

  const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback;}catch{return fallback;}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const id=()=>crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const normalizeModel=value=>{
    if(['pretrained-v0.3','neural-v0.3'].includes(value))return 'neural-v0.4';
    return MODELS[value]?value:DEFAULT_MODEL;
  };
  const makeChat=()=>({id:id(),title:'New conversation',model:DEFAULT_MODEL,messages:[]});
  const errorText=error=>{if(error instanceof Error&&error.message)return error.message;if(typeof error==='string')return error;try{return JSON.stringify(error);}catch{return String(error);}};

  function boot(){
    const chatList=document.getElementById('chatList'),conversation=document.getElementById('conversation'),emptyState=document.getElementById('emptyState');
    const form=document.getElementById('chatForm'),input=document.getElementById('messageInput'),send=document.getElementById('sendButton');
    const newChat=document.getElementById('newChatButton'),copy=document.getElementById('copyChatButton'),collapse=document.getElementById('collapseButton'),mobile=document.getElementById('mobileSidebarButton');
    const sidebar=document.querySelector('.sidebar'),modelDescription=document.getElementById('modelDescription'),composerWrap=document.querySelector('.composer-wrap'),modelPicker=document.getElementById('microModelPicker');

    let chats=read(CHATS_KEY,[]).map(c=>({...c,model:normalizeModel(c.model),messages:Array.isArray(c.messages)?c.messages:[]}));
    let active=localStorage.getItem(ACTIVE_KEY)||'',transientStatus='',statusTimer=null;
    if(!chats.length){const first=makeChat();chats=[first];active=first.id;save();}
    if(!chats.some(c=>c.id===active))active=chats[0].id;

    function save(){write(CHATS_KEY,chats);localStorage.setItem(ACTIVE_KEY,active);}
    const activeChat=()=>chats.find(c=>c.id===active);
    const selectedModel=()=>activeChat()?.model||DEFAULT_MODEL;
    const meta=model=>MODELS[normalizeModel(model)]||MODELS[DEFAULT_MODEL];

    function setTransientStatus(text,ms=5500){transientStatus=text||'';if(statusTimer){clearTimeout(statusTimer);statusTimer=null;}updateModelUI();if(text&&ms>0)statusTimer=setTimeout(()=>{if(transientStatus===text){transientStatus='';updateModelUI();}statusTimer=null;},ms);}
    function syncComposerSpace(){const h=Math.ceil(composerWrap?.getBoundingClientRect().height||110);document.documentElement.style.setProperty('--micro-composer-space',`${h}px`);}
    function scrollToBottom(){requestAnimationFrame(()=>conversation.scrollTop=conversation.scrollHeight);}
    function renderMarkdown(el,text){if(window.RogerVIBMarkdown?.renderInto)return window.RogerVIBMarkdown.renderInto(el,String(text||''));el.textContent=String(text||'');}
    function renderMessage(message){const row=document.createElement('div');row.className=`message-row ${message.role}`;if(message.role==='bot'){const avatar=document.createElement('div');avatar.className='bot-avatar';avatar.textContent='R';row.append(avatar);}const stack=document.createElement('div');stack.className='message-stack';const bubble=document.createElement('div');bubble.className='message-bubble markdown';renderMarkdown(bubble,message.text);stack.append(bubble);row.append(stack);conversation.append(row);}
    function renderConversation(){conversation.querySelectorAll('.message-row').forEach(n=>n.remove());const chat=activeChat();emptyState.classList.toggle('hidden',!!chat?.messages.length);copy.disabled=!chat?.messages.length;for(const m of chat?.messages||[])renderMessage(m);scrollToBottom();}

    function updateOption(model){const option=modelPicker?.querySelector(`option[value="${model}"]`);if(!option)return;const m=meta(model);if(model==='baseline-v0.2'){option.textContent=m.label;return;}const info=m.runtime()?.info;if(loading.has(model)||info?.loading)option.textContent=`${m.label} · loading`;else if(info?.ready)option.textContent=`${m.label} · ready`;else if(info?.error)option.textContent=`${m.label} · unavailable`;else option.textContent=m.label;}
    function updateModelUI(){
      const chat=activeChat();if(!chat)return;chat.model=normalizeModel(chat.model);modelPicker.value=chat.model;Object.keys(MODELS).forEach(updateOption);
      if(transientStatus)modelDescription.textContent=transientStatus;
      else if(chat.model==='baseline-v0.2'){
        const info=window.RogerVIBMicro?.info;modelDescription.textContent=info?`${info.name} v${info.version} • baseline • ${window.RogerVIBMicro.exampleCount||0} examples • build ${BUILD}`:`Micro v0.2 • build ${BUILD}`;
      }else{
        const m=meta(chat.model),info=m.runtime()?.info;
        if(loading.has(chat.model)||info?.loading)modelDescription.textContent=`${m.short} • loading native weights… • build ${BUILD}`;
        else if(info?.ready){const rev=info.artifactRevision?` • weights ${String(info.artifactRevision).slice(0,8)}`:'';modelDescription.textContent=`${m.short} • ${Number(info.parameterCount||m.params).toLocaleString()} parameters • ${info.runtime||'local'}${rev} • build ${BUILD}`;}
        else if(info?.error)modelDescription.textContent=`${m.short} • unavailable: ${info.error} • build ${BUILD}`;
        else modelDescription.textContent=`${m.short} • pretrained • ${m.params.toLocaleString()} parameters • build ${BUILD}`;
      }
      syncComposerSpace();
    }

    function renderChats(){chatList.innerHTML='';for(const chat of chats){chat.model=normalizeModel(chat.model);const entry=document.createElement('div');entry.className=`chat-entry${chat.id===active?' active':''}`;const button=document.createElement('button');button.className='chat-item';button.textContent=chat.title;button.title=`${chat.title} · ${meta(chat.model).label}`;button.onclick=()=>{active=chat.id;setTransientStatus('',0);save();renderChats();renderConversation();updateModelUI();};const del=document.createElement('button');del.className='delete-chat';del.textContent='×';del.setAttribute('aria-label',`Delete ${chat.title}`);del.onclick=e=>{e.stopPropagation();chats=chats.filter(c=>c.id!==chat.id);if(!chats.length)chats=[makeChat()];if(!chats.some(c=>c.id===active))active=chats[0].id;save();renderChats();renderConversation();updateModelUI();};entry.append(button,del);chatList.append(entry);}}
    function resize(){input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,160)}px`;syncComposerSpace();}

    async function ensureNeural(model){
      const m=meta(model),runtime=m.runtime();if(!runtime)throw new Error(`${m.short} native runtime did not load`);if(runtime.info?.ready)return true;
      loading.add(model);updateModelUI();try{await runtime.load();return true;}finally{loading.delete(model);updateModelUI();}
    }
    async function getReply(text,chat,modelAtSend){
      if(modelAtSend==='baseline-v0.2')return window.RogerVIBMicro.reply(text,chat.messages);
      const m=meta(modelAtSend),runtime=m.runtime();
      try{await ensureNeural(modelAtSend);return await runtime.reply(text,chat.messages);}
      catch(error){const reason=errorText(error)||'unknown neural load error';console.warn(`${m.short} unavailable; using v0.2 for this reply only:`,reason);setTransientStatus(`${m.short} unavailable (${reason}) • used v0.2 for this reply`);return window.RogerVIBMicro.reply(text,chat.messages);}
    }
    async function sendMessage(){const text=input.value.trim(),chat=activeChat();if(!text||!chat||send.disabled)return;const modelAtSend=normalizeModel(chat.model);chat.messages.push({role:'user',text});if(chat.title==='New conversation')chat.title=text.length>28?`${text.slice(0,28)}…`:text;input.value='';resize();send.disabled=true;save();renderChats();renderConversation();modelDescription.textContent=`${meta(modelAtSend).label} • thinking locally…`;try{const reply=await getReply(text,chat,modelAtSend);chat.messages.push({role:'bot',text:reply});}catch(error){console.error('RogerVIB chat failed:',error);chat.messages.push({role:'bot',text:`RogerVIB hit an unexpected app error: ${errorText(error)||'unknown error'}`});}finally{send.disabled=false;save();renderConversation();updateModelUI();input.focus();}}

    form.addEventListener('submit',e=>{e.preventDefault();sendMessage();});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});input.addEventListener('input',resize);
    modelPicker.addEventListener('change',()=>{const chat=activeChat();if(!chat)return;const nextModel=normalizeModel(modelPicker.value);chat.model=nextModel;save();setTransientStatus('',0);renderChats();updateModelUI();if(nextModel!=='baseline-v0.2')ensureNeural(nextModel).catch(error=>setTransientStatus(`${meta(nextModel).short} unavailable: ${errorText(error)}`));input.focus();});
    newChat.onclick=()=>{const inherited=selectedModel(),chat=makeChat();chat.model=inherited;chats.unshift(chat);active=chat.id;setTransientStatus('',0);save();renderChats();renderConversation();updateModelUI();input.focus();};
    copy.onclick=async()=>{const chat=activeChat();if(!chat?.messages.length)return;const text=chat.messages.map(m=>`${m.role==='user'?'You':'RogerVIB'}: ${m.text}`).join('\n\n');try{await navigator.clipboard.writeText(text);copy.textContent='Copied!';setTimeout(()=>copy.textContent='Copy Chat',1000);}catch{copy.textContent='Copy failed';}};
    collapse.onclick=()=>{if(innerWidth<=760)sidebar.classList.remove('mobile-open');else sidebar.classList.toggle('collapsed');};mobile.onclick=()=>sidebar.classList.toggle('mobile-open');
    if(window.ResizeObserver&&composerWrap)new ResizeObserver(()=>{syncComposerSpace();scrollToBottom();}).observe(composerWrap);window.addEventListener('resize',()=>{syncComposerSpace();scrollToBottom();});

    save();renderChats();renderConversation();resize();syncComposerSpace();updateModelUI();input.focus();if(selectedModel()!=='baseline-v0.2')ensureNeural(selectedModel()).catch(()=>{});
  }
  window.addEventListener('DOMContentLoaded',boot);
})();
