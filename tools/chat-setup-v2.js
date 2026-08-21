// Stable new-chat setup: name + AI members, no self-triggering observers.
(() => {
  const CHATS_KEY='rogervib_chats_v1';
  const ACTIVE_KEY='rogervib_active_chat_v1';
  const USERS_KEY='rogervib_ai_users_v1';
  const META_KEY='rogervib_chat_meta_v1';
  const ROGERVIB_ID='__rogervib__';

  const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback;}catch{return fallback;}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const initials=s=>String(s||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('').slice(0,2)||'?';
  const avatarText=u=>(String(u?.avatarText||'').trim().slice(0,2)||initials(u?.name)).toUpperCase();
  const avatarColor=u=>u?.avatarColor||'#5b5bd6';

  let setupPage=null;
  let renderQueued=false;

  const chats=()=>read(CHATS_KEY,[]);
  function users(){
    const list=read(USERS_KEY,[]);
    if(!list.some(u=>u?.id===ROGERVIB_ID)){
      const picker=document.getElementById('modelPicker');
      const preferred=localStorage.getItem('rogervib_preferred_model_v1');
      const model=(preferred&&!/connecting|loading|no ollama/i.test(preferred))?preferred:
        (picker?.value&&!/connecting|loading|no ollama/i.test(picker.value)?picker.value:'gemma4:cloud');
      list.unshift({id:ROGERVIB_ID,name:'RogerVIB',model,prompt:'Default RogerVIB assistant. Uses the normal RogerVIB personality, tools, and app behavior.',avatarText:'RV',avatarColor:'#f0f0f0',builtIn:true});
      write(USERS_KEY,list);
    }
    return list;
  }
  const metas=()=>read(META_KEY,{});
  const activeId=()=>localStorage.getItem(ACTIVE_KEY)||'';
  const activeChat=()=>chats().find(c=>c.id===activeId());

  function hideCore(hide){
    const main=document.querySelector('.main-panel');
    if(!main)return;
    document.getElementById('conversation')?.classList.toggle('rv-chatsetup-hidden',hide);
    main.querySelector('.composer-wrap')?.classList.toggle('rv-chatsetup-hidden',hide);
    main.querySelector('.copy-chat-button')?.classList.toggle('rv-chatsetup-hidden',hide);
  }

  function removeSetup(){
    if(setupPage){setupPage.remove();setupPage=null;}
    hideCore(false);
  }

  function currentMembers(){
    return users().map(u=>({
      id:u.id,
      name:u.name,
      sub:u.model,
      avatarText:avatarText(u),
      color:avatarColor(u)
    }));
  }

  function memberRow(member,selected){
    const row=document.createElement('label');
    row.className='rv-chatsetup-member';
    const input=document.createElement('input');
    input.type='checkbox';
    input.value=member.id;
    input.checked=selected;
    const avatar=document.createElement('span');
    avatar.className='rv-chatsetup-avatar';
    avatar.textContent=member.avatarText;
    avatar.style.background=member.color;
    const text=document.createElement('span');
    text.className='rv-chatsetup-member-text';
    const name=document.createElement('strong');
    name.textContent=member.name;
    const sub=document.createElement('small');
    sub.textContent=member.sub;
    text.append(name,sub);
    row.append(input,avatar,text);
    return row;
  }

  function saveSetup(chat,name,members){
    const all=chats();
    const target=all.find(c=>c.id===chat.id);
    const userList=users();
    const firstUser=members.map(id=>userList.find(u=>u.id===id)).find(Boolean);
    if(target){
      target.title=name;
      if(firstUser?.model)target.model=firstUser.model;
      write(CHATS_KEY,all);
    }
    const meta=metas();
    meta[chat.id]={name,members,setupDone:true};
    write(META_KEY,meta);

    const picker=document.getElementById('modelPicker');
    if(firstUser?.model&&picker&&[...picker.options].some(o=>o.value===firstUser.model)){
      picker.value=firstUser.model;
      picker.dispatchEvent(new Event('change',{bubbles:true}));
    }

    removeSetup();
    window.dispatchEvent(new CustomEvent('rogervib-chat-setup-complete',{detail:{chatId:chat.id,name,members}}));
    queueRender();
    document.getElementById('messageInput')?.focus();
  }

  function renderSetup(chat){
    const main=document.querySelector('.main-panel');
    if(!main)return;
    hideCore(true);
    if(setupPage)setupPage.remove();

    setupPage=document.createElement('section');
    setupPage.className='rv-chatsetup-page';
    const old=metas()[chat.id]||{};
    const available=currentMembers();
    const defaultMember=available.find(m=>m.id===ROGERVIB_ID)||available[0];
    const selected=new Set(old.members?.length?old.members:(defaultMember?[defaultMember.id]:[]));

    setupPage.innerHTML='<div class="rv-chatsetup-card"><div class="rv-chatsetup-eyebrow">NEW CHAT</div><h1>Set up your chat</h1><p>Name it and choose which AI users are in here.</p><label class="rv-chatsetup-name-label">Chat name<input data-name maxlength="60" placeholder="tacos"></label><div class="rv-chatsetup-heading"><span>Members</span><small>choose at least one</small></div><div class="rv-chatsetup-members" data-members></div><div class="rv-chatsetup-actions"><button class="primary" data-create>Create chat</button></div></div>';

    const name=setupPage.querySelector('[data-name]');
    name.value=old.name||(chat.title==='New conversation'?'':chat.title);
    const membersBox=setupPage.querySelector('[data-members]');
    const create=setupPage.querySelector('[data-create]');

    for(const member of available)membersBox.append(memberRow(member,selected.has(member.id)));

    create.onclick=()=>{
      const title=name.value.trim()||'New chat';
      const chosen=[...membersBox.querySelectorAll('input:checked')].map(x=>x.value);
      if(!chosen.length){membersBox.classList.add('error');return;}
      saveSetup(chat,title,chosen);
    };

    name.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        create.click();
      }
    });

    main.append(setupPage);
    name.focus();
  }

  function memberNames(ids){
    const list=users();
    return (ids||[]).map(id=>list.find(u=>u.id===id)?.name).filter(Boolean);
  }

  function decorateChatList(){
    const list=document.getElementById('chatList');
    if(!list)return;
    const all=chats();
    const meta=metas();
    const rows=[...list.querySelectorAll(':scope > .chat-entry')];

    rows.forEach((row,i)=>{
      const chat=all[i];
      if(!chat)return;
      const button=row.querySelector('.chat-item');
      if(!button)return;
      const names=memberNames(meta[chat.id]?.members);
      const wanted=names.join(', ');
      let sub=button.querySelector('.rv-chat-member-sub');

      if(!wanted){
        if(sub)sub.remove();
        return;
      }
      if(!sub){
        sub=document.createElement('div');
        sub.className='rv-chat-member-sub';
        button.append(sub);
      }
      if(sub.textContent!==wanted)sub.textContent=wanted;
    });
  }

  function render(){
    renderQueued=false;
    if(document.querySelector('.rv-users-main-page')){
      removeSetup();
      return;
    }
    const chat=activeChat();
    if(!chat){
      removeSetup();
      return;
    }
    const meta=metas()[chat.id];
    if((chat.messages||[]).length===0&&!meta?.setupDone){
      if(!setupPage)renderSetup(chat);
    }else{
      removeSetup();
    }
    decorateChatList();
  }

  function queueRender(){
    if(renderQueued)return;
    renderQueued=true;
    requestAnimationFrame(render);
  }

  window.addEventListener('DOMContentLoaded',()=>{
    users();
    queueRender();
    setTimeout(queueRender,50);
    setTimeout(queueRender,250);

    document.getElementById('newChatButton')?.addEventListener('click',()=>setTimeout(queueRender,0));
    document.getElementById('chatList')?.addEventListener('click',()=>setTimeout(queueRender,0));
    window.addEventListener('rogervib-ai-users-changed',queueRender);

    const list=document.getElementById('chatList');
    if(list)new MutationObserver(queueRender).observe(list,{childList:true,subtree:false});
  });
})();