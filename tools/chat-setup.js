// New empty chats get a setup page for name + AI members before messaging.
(() => {
  const CHATS_KEY='rogervib_chats_v1';
  const ACTIVE_KEY='rogervib_active_chat_v1';
  const USERS_KEY='rogervib_ai_users_v1';
  const META_KEY='rogervib_chat_meta_v1';
  const ROGER_ID='__rogervib__';
  const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback;}catch{return fallback;}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const initials=s=>String(s||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('').slice(0,2)||'?';
  const avatarText=u=>(String(u?.avatarText||'').trim().slice(0,2)||initials(u?.name)).toUpperCase();
  const avatarColor=u=>u?.avatarColor||'#5b5bd6';
  let setupPage=null;

  function chats(){return read(CHATS_KEY,[]);} function users(){return read(USERS_KEY,[]);} function metas(){return read(META_KEY,{});} 
  function activeId(){return localStorage.getItem(ACTIVE_KEY)||'';}
  function activeChat(){return chats().find(c=>c.id===activeId());}

  function hideCore(hide){
    const main=document.querySelector('.main-panel'); if(!main)return;
    document.getElementById('conversation')?.classList.toggle('rv-chatsetup-hidden',hide);
    main.querySelector('.composer-wrap')?.classList.toggle('rv-chatsetup-hidden',hide);
    main.querySelector('.copy-chat-button')?.classList.toggle('rv-chatsetup-hidden',hide);
  }

  function removeSetup(){setupPage?.remove();setupPage=null;hideCore(false);}

  function memberRow(member,selected){
    const row=document.createElement('label');row.className='rv-chatsetup-member';
    const input=document.createElement('input');input.type='checkbox';input.value=member.id;input.checked=selected;
    const avatar=document.createElement('span');avatar.className='rv-chatsetup-avatar';avatar.textContent=member.avatarText;avatar.style.background=member.color;
    const text=document.createElement('span');text.className='rv-chatsetup-member-text';
    const name=document.createElement('strong');name.textContent=member.name;const sub=document.createElement('small');sub.textContent=member.sub;
    text.append(name,sub);row.append(input,avatar,text);return row;
  }

  function currentMembers(){
    const model=document.getElementById('modelPicker')?.value||'current model';
    return [{id:ROGER_ID,name:'RogerVIB',sub:model,avatarText:'RV',color:'#f0f0f0'},...users().map(u=>({id:u.id,name:u.name,sub:u.model,avatarText:avatarText(u),color:avatarColor(u)}))];
  }

  function saveSetup(chat,name,members){
    const all=chats();const target=all.find(c=>c.id===chat.id);if(target){target.title=name;const firstUser=members.map(id=>users().find(u=>u.id===id)).find(Boolean);if(firstUser?.model)target.model=firstUser.model;write(CHATS_KEY,all);}
    const meta=metas();meta[chat.id]={name,members,setupDone:true};write(META_KEY,meta);
    const picker=document.getElementById('modelPicker');const firstUser=members.map(id=>users().find(u=>u.id===id)).find(Boolean);
    if(firstUser?.model&&picker&&[...picker.options].some(o=>o.value===firstUser.model)){picker.value=firstUser.model;picker.dispatchEvent(new Event('change',{bubbles:true}));}
    removeSetup();
    // Force the core sidebar/conversation to notice the saved title/model without a full reload.
    document.getElementById('chatList')?.querySelector('.chat-entry.active .chat-item')?.replaceChildren(document.createTextNode(name));
    window.dispatchEvent(new CustomEvent('rogervib-chat-setup-complete',{detail:{chatId:chat.id,name,members}}));
    document.getElementById('messageInput')?.focus();
    decorateChatList();
  }

  function renderSetup(chat){
    const main=document.querySelector('.main-panel');if(!main)return;
    hideCore(true);setupPage?.remove();
    setupPage=document.createElement('section');setupPage.className='rv-chatsetup-page';
    const old=metas()[chat.id]||{};const selected=new Set(old.members?.length?old.members:[ROGER_ID]);
    setupPage.innerHTML='<div class="rv-chatsetup-card"><div class="rv-chatsetup-eyebrow">NEW CHAT</div><h1>Set up your chat</h1><p>Name it and choose who is in here. You can change members later.</p><label class="rv-chatsetup-name-label">Chat name<input data-name maxlength="60" placeholder="tacos"></label><div class="rv-chatsetup-heading"><span>Members</span><small>choose at least one</small></div><div class="rv-chatsetup-members" data-members></div><div class="rv-chatsetup-actions"><button class="primary" data-create>Create chat</button></div></div>';
    const name=setupPage.querySelector('[data-name]');name.value=old.name||(chat.title==='New conversation'?'':chat.title);
    const membersBox=setupPage.querySelector('[data-members]');for(const member of currentMembers())membersBox.append(memberRow(member,selected.has(member.id)));
    setupPage.querySelector('[data-create]').onclick=()=>{const title=name.value.trim()||'New chat';const chosen=[...membersBox.querySelectorAll('input:checked')].map(x=>x.value);if(!chosen.length){membersBox.classList.add('error');return;}saveSetup(chat,title,chosen);};
    name.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();setupPage.querySelector('[data-create]').click();}});
    main.append(setupPage);name.focus();
  }

  function maybeRender(){
    if(document.querySelector('.rv-users-main-page')){removeSetup();return;}
    const chat=activeChat();if(!chat){removeSetup();return;}
    const meta=metas()[chat.id];
    if((chat.messages||[]).length===0&&!meta?.setupDone)renderSetup(chat);else removeSetup();
    decorateChatList();
  }

  function memberNames(ids){const list=users();return (ids||[]).map(id=>id===ROGER_ID?'RogerVIB':list.find(u=>u.id===id)?.name).filter(Boolean);}
  function decorateChatList(){
    const list=document.getElementById('chatList');if(!list)return;const all=chats(),meta=metas();const rows=[...list.querySelectorAll('.chat-entry')];
    rows.forEach((row,i)=>{const chat=all[i];if(!chat)return;row.querySelector('.rv-chat-member-sub')?.remove();const names=memberNames(meta[chat.id]?.members);if(!names.length)return;const sub=document.createElement('div');sub.className='rv-chat-member-sub';sub.textContent=names.join(', ');row.querySelector('.chat-item')?.append(sub);});
  }

  window.addEventListener('DOMContentLoaded',()=>{
    setTimeout(maybeRender,80);
    document.getElementById('newChatButton')?.addEventListener('click',()=>setTimeout(maybeRender,0));
    document.getElementById('chatList')?.addEventListener('click',()=>setTimeout(maybeRender,0));
    window.addEventListener('rogervib-ai-users-changed',()=>{if(setupPage)maybeRender();});
    const observer=new MutationObserver(()=>{if(!document.querySelector('.rv-users-main-page')){decorateChatList();const chat=activeChat();if(chat&&(chat.messages||[]).length===0&&!metas()[chat.id]?.setupDone&&!setupPage)setTimeout(maybeRender,0);}});
    const list=document.getElementById('chatList');if(list)observer.observe(list,{childList:true,subtree:true});
  });
})();