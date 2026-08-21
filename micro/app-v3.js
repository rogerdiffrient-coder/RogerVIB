// RogerVIB Micro app v0.3: baseline + real locally trained neural model.
(() => {
  const CHATS_KEY='rogervib_micro_chats_v1';
  const ACTIVE_KEY='rogervib_micro_active_chat_v1';
  const DEFAULT_MODEL='baseline-v0.2';

  const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback;}catch{return fallback;}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const id=()=>crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const makeChat=()=>({id:id(),title:'New conversation',model:DEFAULT_MODEL,messages:[]});

  function boot(){
    const chatList=document.getElementById('chatList');
    const conversation=document.getElementById('conversation');
    const emptyState=document.getElementById('emptyState');
    const form=document.getElementById('chatForm');
    const input=document.getElementById('messageInput');
    const send=document.getElementById('sendButton');
    const newChat=document.getElementById('newChatButton');
    const copy=document.getElementById('copyChatButton');
    const collapse=document.getElementById('collapseButton');
    const mobile=document.getElementById('mobileSidebarButton');
    const sidebar=document.querySelector('.sidebar');
    const modelDescription=document.getElementById('modelDescription');
    const composerWrap=document.querySelector('.composer-wrap');
    const modelPicker=document.getElementById('microModelPicker');
    const trainButton=document.getElementById('trainModelButton');

    let chats=read(CHATS_KEY,[]).map(c=>({...c,model:c.model||DEFAULT_MODEL,messages:Array.isArray(c.messages)?c.messages:[]}));
    let active=localStorage.getItem(ACTIVE_KEY)||'';
    let training=false;
    if(!chats.length){const first=makeChat();chats=[first];active=first.id;save();}
    if(!chats.some(c=>c.id===active))active=chats[0].id;

    function save(){write(CHATS_KEY,chats);localStorage.setItem(ACTIVE_KEY,active);}
    const activeChat=()=>chats.find(c=>c.id===active);
    const selectedModel=()=>activeChat()?.model||DEFAULT_MODEL;

    function syncComposerSpace(){
      const h=Math.ceil(composerWrap?.getBoundingClientRect().height||110);
      document.documentElement.style.setProperty('--micro-composer-space',`${h}px`);
    }
    function scrollToBottom(){requestAnimationFrame(()=>conversation.scrollTop=conversation.scrollHeight);}
    function renderMarkdown(el,text){
      if(window.RogerVIBMarkdown?.renderInto)return window.RogerVIBMarkdown.renderInto(el,String(text||''));
      el.textContent=String(text||'');
    }

    function renderMessage(message){
      const row=document.createElement('div');row.className=`message-row ${message.role}`;
      if(message.role==='bot'){
        const avatar=document.createElement('div');avatar.className='bot-avatar';avatar.textContent='R';row.append(avatar);
      }
      const stack=document.createElement('div');stack.className='message-stack';
      const bubble=document.createElement('div');bubble.className='message-bubble markdown';renderMarkdown(bubble,message.text);stack.append(bubble);row.append(stack);conversation.append(row);
    }

    function renderConversation(){
      conversation.querySelectorAll('.message-row').forEach(n=>n.remove());
      const chat=activeChat();
      emptyState.classList.toggle('hidden',!!chat?.messages.length);
      copy.disabled=!chat?.messages.length;
      for(const m of chat?.messages||[])renderMessage(m);
      scrollToBottom();
    }

    function modelLabel(id){return id==='neural-v0.3'?'Micro v0.3 — Neural':'Micro v0.2 — Baseline';}

    function updateModelUI(){
      const chat=activeChat();if(!chat)return;
      modelPicker.value=chat.model||DEFAULT_MODEL;
      const neural=window.RogerVIBNeural?.info;
      const isNeural=modelPicker.value==='neural-v0.3';
      trainButton.hidden=!isNeural;
      trainButton.disabled=training;
      trainButton.textContent=training?'Training…':(neural?.trained?'Retrain':'Train');
      if(training)return;
      if(isNeural){
        modelDescription.textContent=neural?.trained
          ? `Micro v0.3 Neural • ${Number(neural.parameterCount||0).toLocaleString()} trained parameters • saved locally`
          : `Micro v0.3 Neural • untrained • ${Number(neural?.parameterCount||3031776).toLocaleString()} parameters`;
      }else{
        const info=window.RogerVIBMicro?.info;
        modelDescription.textContent=info?`${info.name} v${info.version} • baseline • ${window.RogerVIBMicro.exampleCount||0} examples`:'Micro v0.2';
      }
      syncComposerSpace();
    }

    function renderChats(){
      chatList.innerHTML='';
      for(const chat of chats){
        const entry=document.createElement('div');entry.className=`chat-entry${chat.id===active?' active':''}`;
        const button=document.createElement('button');button.className='chat-item';button.textContent=chat.title;button.title=`${chat.title} · ${modelLabel(chat.model||DEFAULT_MODEL)}`;
        button.onclick=()=>{active=chat.id;save();renderChats();renderConversation();updateModelUI();};
        const del=document.createElement('button');del.className='delete-chat';del.textContent='×';del.onclick=e=>{e.stopPropagation();chats=chats.filter(c=>c.id!==chat.id);if(!chats.length)chats=[makeChat()];if(!chats.some(c=>c.id===active))active=chats[0].id;save();renderChats();renderConversation();updateModelUI();};
        entry.append(button,del);chatList.append(entry);
      }
    }

    function resize(){input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,160)}px`;syncComposerSpace();}

    async function getReply(text,chat){
      if(chat.model==='neural-v0.3'){
        await window.RogerVIBNeural.load();
        if(!window.RogerVIBNeural.info.trained)throw new Error('Micro v0.3 is not trained yet. Click Train first.');
        return window.RogerVIBNeural.reply(text,chat.messages);
      }
      return window.RogerVIBMicro.reply(text,chat.messages);
    }

    async function sendMessage(){
      const text=input.value.trim(),chat=activeChat();if(!text||!chat||send.disabled||training)return;
      chat.messages.push({role:'user',text});
      if(chat.title==='New conversation')chat.title=text.length>28?`${text.slice(0,28)}…`:text;
      input.value='';resize();send.disabled=true;save();renderChats();renderConversation();
      modelDescription.textContent=`${modelLabel(chat.model)} • thinking locally…`;
      try{
        const reply=await getReply(text,chat);
        chat.messages.push({role:'bot',text:reply});
      }catch(error){
        console.error(error);chat.messages.push({role:'bot',text:`${error.message}`});
      }finally{
        send.disabled=false;save();renderConversation();updateModelUI();input.focus();
      }
    }

    async function trainNeural(){
      if(training)return;
      training=true;trainButton.disabled=true;send.disabled=true;modelPicker.disabled=true;
      syncComposerSpace();
      try{
        await window.RogerVIBNeural.train(chats,progress=>{
          if(progress.stage==='start'){
            modelDescription.textContent=`Preparing ${progress.samples} training sequences • ${Number(progress.params).toLocaleString()} parameters…`;
          }else if(progress.stage==='training'){
            const loss=Number.isFinite(progress.loss)?progress.loss.toFixed(4):'?';
            modelDescription.textContent=`Training v0.3 • epoch ${progress.epoch}/${progress.epochs} • loss ${loss}`;
          }else if(progress.stage==='done'){
            modelDescription.textContent='Micro v0.3 training complete • weights saved locally';
          }
        });
      }catch(error){
        console.error('Neural training failed:',error);
        modelDescription.textContent=`Training failed: ${error.message}`;
      }finally{
        training=false;send.disabled=false;modelPicker.disabled=false;updateModelUI();input.focus();
      }
    }

    form.addEventListener('submit',e=>{e.preventDefault();sendMessage();});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
    input.addEventListener('input',resize);
    modelPicker.addEventListener('change',()=>{const chat=activeChat();if(!chat)return;chat.model=modelPicker.value;save();renderChats();updateModelUI();input.focus();});
    trainButton.addEventListener('click',trainNeural);
    newChat.onclick=()=>{const chat=makeChat();chat.model=selectedModel();chats.unshift(chat);active=chat.id;save();renderChats();renderConversation();updateModelUI();input.focus();};
    copy.onclick=async()=>{const chat=activeChat();if(!chat?.messages.length)return;const text=chat.messages.map(m=>`${m.role==='user'?'You':'RogerVIB'}: ${m.text}`).join('\n\n');try{await navigator.clipboard.writeText(text);copy.textContent='Copied!';setTimeout(()=>copy.textContent='Copy Chat',1000);}catch{copy.textContent='Copy failed';}};
    collapse.onclick=()=>{if(innerWidth<=760)sidebar.classList.remove('mobile-open');else sidebar.classList.toggle('collapsed');};
    mobile.onclick=()=>sidebar.classList.toggle('mobile-open');
    if(window.ResizeObserver&&composerWrap)new ResizeObserver(()=>{syncComposerSpace();scrollToBottom();}).observe(composerWrap);
    window.addEventListener('resize',()=>{syncComposerSpace();scrollToBottom();});

    (async()=>{try{await window.RogerVIBNeural?.load();}catch{}updateModelUI();})();
    renderChats();renderConversation();resize();syncComposerSpace();input.focus();
  }

  window.addEventListener('DOMContentLoaded',boot);
})();