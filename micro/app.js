// RogerVIB Micro app: one AI, simple chats, no Ollama/users/tools.
(() => {
  const CHATS_KEY='rogervib_micro_chats_v1';
  const ACTIVE_KEY='rogervib_micro_active_chat_v1';

  const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback;}catch{return fallback;}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const id=()=>crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const makeChat=()=>({id:id(),title:'New conversation',messages:[]});

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

    let chats=read(CHATS_KEY,[]);
    let active=localStorage.getItem(ACTIVE_KEY)||'';
    if(!chats.length){const first=makeChat();chats=[first];active=first.id;save();}
    if(!chats.some(c=>c.id===active))active=chats[0].id;

    function save(){write(CHATS_KEY,chats);localStorage.setItem(ACTIVE_KEY,active);}
    const activeChat=()=>chats.find(c=>c.id===active);

    function renderMarkdown(el,text){
      if(window.RogerVIBMarkdown?.renderInto) return window.RogerVIBMarkdown.renderInto(el,String(text||''));
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
      requestAnimationFrame(()=>conversation.scrollTop=conversation.scrollHeight);
    }

    function renderChats(){
      chatList.innerHTML='';
      for(const chat of chats){
        const entry=document.createElement('div');entry.className=`chat-entry${chat.id===active?' active':''}`;
        const button=document.createElement('button');button.className='chat-item';button.textContent=chat.title;button.onclick=()=>{active=chat.id;save();renderChats();renderConversation();};
        const del=document.createElement('button');del.className='delete-chat';del.textContent='×';del.onclick=e=>{e.stopPropagation();chats=chats.filter(c=>c.id!==chat.id);if(!chats.length)chats=[makeChat()];if(!chats.some(c=>c.id===active))active=chats[0].id;save();renderChats();renderConversation();};
        entry.append(button,del);chatList.append(entry);
      }
    }

    function resize(){input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,160)}px`;}

    async function sendMessage(){
      const text=input.value.trim();const chat=activeChat();if(!text||!chat||send.disabled)return;
      chat.messages.push({role:'user',text});
      if(chat.title==='New conversation')chat.title=text.length>28?`${text.slice(0,28)}…`:text;
      input.value='';resize();send.disabled=true;save();renderChats();renderConversation();
      modelDescription.textContent='RogerVIB Micro v0.1 • thinking locally…';
      try{
        const reply=await window.RogerVIBMicro.reply(text,chat.messages);
        chat.messages.push({role:'bot',text:reply});
      }catch(error){
        console.error(error);chat.messages.push({role:'bot',text:`micro brain crashed: ${error.message}`});
      }finally{
        send.disabled=false;modelDescription.textContent='RogerVIB Micro v0.1 • local prototype • no Ollama';save();renderConversation();input.focus();
      }
    }

    form.addEventListener('submit',e=>{e.preventDefault();sendMessage();});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
    input.addEventListener('input',resize);
    newChat.onclick=()=>{const chat=makeChat();chats.unshift(chat);active=chat.id;save();renderChats();renderConversation();input.focus();};
    copy.onclick=async()=>{const chat=activeChat();if(!chat?.messages.length)return;const text=chat.messages.map(m=>`${m.role==='user'?'You':'RogerVIB'}: ${m.text}`).join('\n\n');try{await navigator.clipboard.writeText(text);copy.textContent='Copied!';setTimeout(()=>copy.textContent='Copy Chat',1000);}catch{copy.textContent='Copy failed';}};
    collapse.onclick=()=>{if(innerWidth<=760)sidebar.classList.remove('mobile-open');else sidebar.classList.toggle('collapsed');};
    mobile.onclick=()=>sidebar.classList.toggle('mobile-open');

    const info=window.RogerVIBMicro?.info;
    modelDescription.textContent=info?`${info.name} v${info.version} • local prototype • ${info.parameterBudget.toLocaleString()} parameter target`:'RogerVIB Micro';
    renderChats();renderConversation();resize();input.focus();
  }

  window.addEventListener('DOMContentLoaded',boot);
})();