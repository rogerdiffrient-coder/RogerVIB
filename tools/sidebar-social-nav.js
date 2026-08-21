// First-class Chats / Users navigation in RogerVIB's left sidebar.
(() => {
  const USERS_KEY='rogervib_ai_users_v1';
  const DMS_KEY='rogervib_ai_dms_v1';
  const GROUPS_KEY='rogervib_ai_groups_v1';
  const CORE_CHATS_KEY='rogervib_chats_v1';
  let mode='chats';

  const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback;}catch{return fallback;}};
  const write=(key,v)=>localStorage.setItem(key,JSON.stringify(v));
  const initials=s=>String(s||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'?';
  const uid=()=>crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function users(){return read(USERS_KEY,[]);} function groups(){return read(GROUPS_KEY,[]);} function dms(){return read(DMS_KEY,{});} function coreChats(){return read(CORE_CHATS_KEY,[]);} 
  function userById(id){return users().find(u=>u.id===id);} 

  function ensureTabs(){
    const sidebar=document.querySelector('.sidebar'); const newChat=document.getElementById('newChatButton'); if(!sidebar||!newChat)return null;
    let tabs=sidebar.querySelector('.rv-sidebar-tabs');
    if(!tabs){tabs=document.createElement('div');tabs.className='rv-sidebar-tabs';tabs.innerHTML='<button class="rv-sidebar-tab active" data-mode="chats">Chats</button><button class="rv-sidebar-tab" data-mode="users">Users</button>';newChat.insertAdjacentElement('afterend',tabs);tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));}
    return tabs;
  }

  function switchMode(next){
    mode=next==='users'?'users':'chats';
    const tabs=ensureTabs();tabs?.querySelectorAll('.rv-sidebar-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
    render();
  }

  function setSectionTitle(text){const el=document.querySelector('.sidebar-section-title');if(el)el.textContent=text;}
  function normalChatListVisible(visible){const list=document.getElementById('chatList');if(list)list.classList.toggle('rv-sidebar-hide',!visible);}
  function removeCustomLists(){document.querySelectorAll('.rv-sidebar-user-list,.rv-sidebar-chat-social,.rv-sidebar-create-user,.rv-sidebar-section-label').forEach(n=>n.remove());}

  function setMainChatVisible(visible){
    const main=document.querySelector('.main-panel');if(!main)return;
    const top=main.querySelector('.topbar');
    const conversation=document.getElementById('conversation');
    const composer=main.querySelector('.composer-wrap');
    if(top)top.classList.toggle('rv-users-hidden',!visible);
    if(conversation)conversation.classList.toggle('rv-users-hidden',!visible);
    if(composer)composer.classList.toggle('rv-users-hidden',!visible);
    if(visible)main.querySelector('.rv-users-main-page')?.remove();
  }

  function openSocialAnd(fn,...args){const api=window.RogerVIBAISocial;if(!api)return;api.open?.();setTimeout(()=>api[fn]?.(...args),0);}

  function editUserModal(existing){
    const models=[...(document.getElementById('modelPicker')?.options||[])].map(o=>o.value).filter(Boolean);
    const modal=document.createElement('div');modal.className='rv-sidebar-modal';
    modal.innerHTML='<div class="rv-sidebar-modal-card"><h2></h2><label>Name</label><input data-name><label>Model</label><select data-model></select><label>Personality / instructions</label><textarea rows="5" data-prompt></textarea><div class="rv-sidebar-modal-actions"><button data-cancel>Cancel</button><button class="primary" data-save>Save</button></div></div>';
    modal.querySelector('h2').textContent=existing?`Edit ${existing.name}`:'Create AI user';
    const name=modal.querySelector('[data-name]'),model=modal.querySelector('[data-model]'),prompt=modal.querySelector('[data-prompt]');
    for(const m of models){const o=document.createElement('option');o.value=m;o.textContent=m;model.append(o);}name.value=existing?.name||'';model.value=existing?.model||models[0]||'';prompt.value=existing?.prompt||'';
    modal.querySelector('[data-cancel]').onclick=()=>modal.remove();
    modal.querySelector('[data-save]').onclick=()=>{const n=name.value.trim(),m=model.value,p=prompt.value.trim();if(!n||!m)return;const list=users();if(existing){const u=list.find(x=>x.id===existing.id);if(u){u.name=n;u.model=m;u.prompt=p;}}else list.push({id:uid(),name:n,model:m,prompt:p});write(USERS_KEY,list);modal.remove();render();};
    modal.addEventListener('pointerdown',e=>{if(e.target===modal)modal.remove();});document.body.append(modal);name.focus();
  }

  function deleteUser(user){
    const list=users().filter(u=>u.id!==user.id);write(USERS_KEY,list);
    const dm=dms();delete dm[user.id];write(DMS_KEY,dm);
    const gs=groups();gs.forEach(g=>g.members=(g.members||[]).filter(id=>id!==user.id));write(GROUPS_KEY,gs);
    render();
  }

  function userCard(u,compact=false){
    const card=document.createElement('div');card.className=compact?'rv-sidebar-user':'rv-main-user-card';
    card.innerHTML=compact
      ? '<div class="rv-sidebar-user-main"><div class="rv-sidebar-avatar"></div><div class="rv-sidebar-user-text"><div class="rv-sidebar-user-name"></div><div class="rv-sidebar-user-model"></div></div></div><div class="rv-sidebar-user-actions"></div>'
      : '<div class="rv-main-user-top"><div class="rv-main-user-avatar"></div><div class="rv-main-user-info"><strong></strong><span></span></div></div><p class="rv-main-user-prompt"></p><div class="rv-main-user-actions"></div>';

    if(compact){
      card.querySelector('.rv-sidebar-avatar').textContent=initials(u.name);
      card.querySelector('.rv-sidebar-user-name').textContent=u.name;
      card.querySelector('.rv-sidebar-user-model').textContent=u.model;
    }else{
      card.querySelector('.rv-main-user-avatar').textContent=initials(u.name);
      card.querySelector('.rv-main-user-info strong').textContent=u.name;
      card.querySelector('.rv-main-user-info span').textContent=u.model;
      card.querySelector('.rv-main-user-prompt').textContent=u.prompt||'no custom personality yet';
    }

    const actions=card.querySelector(compact?'.rv-sidebar-user-actions':'.rv-main-user-actions');
    const chat=document.createElement('button');chat.textContent='Chat';chat.onclick=()=>{switchMode('chats');openSocialAnd('openDm',u.id);};
    const edit=document.createElement('button');edit.textContent='Edit';edit.onclick=()=>editUserModal(u);
    const del=document.createElement('button');del.textContent='Delete';del.className='danger';del.onclick=()=>deleteUser(u);
    actions.append(chat,edit,del);
    return card;
  }

  function renderUsersMain(){
    const main=document.querySelector('.main-panel');if(!main)return;
    setMainChatVisible(false);
    let page=main.querySelector('.rv-users-main-page');
    if(!page){page=document.createElement('section');page.className='rv-users-main-page';main.append(page);}
    page.innerHTML='';

    const hero=document.createElement('div');hero.className='rv-users-main-hero';
    hero.innerHTML='<div><div class="rv-users-eyebrow">AI USERS</div><h1>Your AI users</h1><p>Create separate AI identities with their own model and personality. Chat with them from the Chats page.</p></div>';
    const create=document.createElement('button');create.className='rv-users-create-main';create.textContent='+ New AI user';create.onclick=()=>editUserModal(null);hero.append(create);page.append(hero);

    const grid=document.createElement('div');grid.className='rv-main-user-grid';
    const list=users();
    if(!list.length){
      const empty=document.createElement('div');empty.className='rv-main-users-empty';empty.innerHTML='<div class="rv-main-users-empty-icon">R</div><h2>No AI users yet</h2><p>Make one, give it a model and personality, then start a chat.</p>';grid.append(empty);
    }else for(const u of list)grid.append(userCard(u,false));
    page.append(grid);
  }

  function renderUsers(){
    normalChatListVisible(false);setSectionTitle('Users');
    const sidebar=document.querySelector('.sidebar');const title=document.querySelector('.sidebar-section-title');if(!sidebar||!title)return;
    const create=document.createElement('button');create.className='rv-sidebar-create-user';create.textContent='+ New AI user';create.onclick=()=>editUserModal(null);title.insertAdjacentElement('afterend',create);
    const box=document.createElement('div');box.className='rv-sidebar-user-list';create.insertAdjacentElement('afterend',box);
    const list=users();if(!list.length)box.innerHTML='<div class="rv-sidebar-empty">no AI users yet</div>';else for(const u of list)box.append(userCard(u,true));
    renderUsersMain();
  }

  function addSocialChat(container,title,members,onClick){const b=document.createElement('button');b.className='rv-sidebar-social-chat';b.innerHTML='<div class="rv-sidebar-social-title"></div><div class="rv-sidebar-chat-members"></div>';b.querySelector('.rv-sidebar-social-title').textContent=title;b.querySelector('.rv-sidebar-chat-members').textContent=members;b.onclick=onClick;container.append(b);}

  function renderChats(){
    setMainChatVisible(true);normalChatListVisible(true);setSectionTitle('Chats');
    const list=document.getElementById('chatList');if(!list)return;
    const social=document.createElement('div');social.className='rv-sidebar-chat-social';list.insertAdjacentElement('afterend',social);
    const dmStore=dms();for(const u of users()){if(Array.isArray(dmStore[u.id])&&dmStore[u.id].length){addSocialChat(social,u.name,u.name,()=>openSocialAnd('openDm',u.id));}}
    for(const g of groups()){const names=(g.members||[]).map(id=>userById(id)?.name).filter(Boolean);addSocialChat(social,g.name,names.join(', ')||'no members',()=>openSocialAnd('openGroup',g.id));}
  }

  function render(){ensureTabs();removeCustomLists();if(mode==='users')renderUsers();else renderChats();}

  const observer=new MutationObserver(()=>{if(mode==='chats')render();});
  window.addEventListener('DOMContentLoaded',()=>{ensureTabs();render();const list=document.getElementById('chatList');if(list)observer.observe(list,{childList:true});});
  window.RogerVIBSidebarSocial={switchMode,render};
})();