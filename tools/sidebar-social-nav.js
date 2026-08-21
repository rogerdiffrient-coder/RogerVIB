// First-class Chats / Users navigation in RogerVIB's left sidebar.
(() => {
  const USERS_KEY='rogervib_ai_users_v1';
  const DMS_KEY='rogervib_ai_dms_v1';
  const GROUPS_KEY='rogervib_ai_groups_v1';
  let mode='chats';

  const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback;}catch{return fallback;}};
  const write=(key,v)=>localStorage.setItem(key,JSON.stringify(v));
  const initials=s=>String(s||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('').slice(0,2)||'?';
  const uid=()=>crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const avatarText=u=>(String(u?.avatarText||'').trim().slice(0,2)||initials(u?.name)).toUpperCase();
  const avatarColor=u=>u?.avatarColor||'#5b5bd6';

  function users(){return read(USERS_KEY,[]);}
  function groups(){return read(GROUPS_KEY,[]);}
  function dms(){return read(DMS_KEY,{});}

  function ensureTabs(){
    const sidebar=document.querySelector('.sidebar');
    const newChat=document.getElementById('newChatButton');
    if(!sidebar||!newChat)return null;
    let tabs=sidebar.querySelector('.rv-sidebar-tabs');
    if(!tabs){
      tabs=document.createElement('div');
      tabs.className='rv-sidebar-tabs';
      tabs.innerHTML='<button class="rv-sidebar-tab active" data-mode="chats">Chats</button><button class="rv-sidebar-tab" data-mode="users">Users</button>';
      newChat.insertAdjacentElement('afterend',tabs);
      tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));
    }
    return tabs;
  }

  function switchMode(next){
    mode=next==='users'?'users':'chats';
    document.querySelector('.rv-social-backdrop')?.remove();
    const tabs=ensureTabs();
    tabs?.querySelectorAll('.rv-sidebar-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
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

  function editUserModal(existing){
    const models=[...(document.getElementById('modelPicker')?.options||[])].map(o=>o.value).filter(Boolean);
    const modal=document.createElement('div');modal.className='rv-sidebar-modal';
    modal.innerHTML='<div class="rv-sidebar-modal-card"><h2></h2><label>Name</label><input data-name><label>Model</label><select data-model></select><label>Profile picture</label><div class="rv-avatar-editor"><div class="rv-avatar-preview" data-preview></div><input data-avatar maxlength="2" placeholder="AI" aria-label="2 character avatar"><input data-color type="color" aria-label="Avatar background color"></div><small class="rv-avatar-help">2 characters on any background color</small><label>Personality / instructions</label><textarea rows="5" data-prompt></textarea><div class="rv-sidebar-modal-actions"><button data-cancel>Cancel</button><button class="primary" data-save>Save</button></div></div>';
    modal.querySelector('h2').textContent=existing?`Edit ${existing.name}`:'Create AI user';
    const name=modal.querySelector('[data-name]'),model=modal.querySelector('[data-model]'),prompt=modal.querySelector('[data-prompt]');
    const avatar=modal.querySelector('[data-avatar]'),color=modal.querySelector('[data-color]'),preview=modal.querySelector('[data-preview]');
    for(const m of models){const o=document.createElement('option');o.value=m;o.textContent=m;model.append(o);}
    name.value=existing?.name||'';model.value=existing?.model||models[0]||'';prompt.value=existing?.prompt||'';
    avatar.value=existing?.avatarText||initials(existing?.name||'AI');color.value=existing?.avatarColor||'#5b5bd6';
    const updatePreview=()=>{preview.textContent=(avatar.value.trim().slice(0,2)||initials(name.value||'AI')).toUpperCase();preview.style.background=color.value;};
    name.addEventListener('input',()=>{if(!avatar.value.trim())updatePreview();});avatar.addEventListener('input',updatePreview);color.addEventListener('input',updatePreview);updatePreview();
    modal.querySelector('[data-cancel]').onclick=()=>modal.remove();
    modal.querySelector('[data-save]').onclick=()=>{
      const n=name.value.trim(),m=model.value,p=prompt.value.trim();if(!n||!m)return;
      const list=users();const a=(avatar.value.trim().slice(0,2)||initials(n)).toUpperCase(),c=color.value;
      if(existing){const u=list.find(x=>x.id===existing.id);if(u){u.name=n;u.model=m;u.prompt=p;u.avatarText=a;u.avatarColor=c;}}
      else list.push({id:uid(),name:n,model:m,prompt:p,avatarText:a,avatarColor:c});
      write(USERS_KEY,list);modal.remove();render();window.dispatchEvent(new CustomEvent('rogervib-ai-users-changed'));
    };
    modal.addEventListener('pointerdown',e=>{if(e.target===modal)modal.remove();});
    document.body.append(modal);name.focus();
  }

  function deleteUser(user){
    write(USERS_KEY,users().filter(u=>u.id!==user.id));
    const dm=dms();delete dm[user.id];write(DMS_KEY,dm);
    const gs=groups();gs.forEach(g=>g.members=(g.members||[]).filter(id=>id!==user.id));write(GROUPS_KEY,gs);
    render();window.dispatchEvent(new CustomEvent('rogervib-ai-users-changed'));
  }

  function userCard(u,compact=false){
    const card=document.createElement('div');card.className=compact?'rv-sidebar-user':'rv-main-user-card';
    card.innerHTML=compact
      ? '<div class="rv-sidebar-user-main"><div class="rv-sidebar-avatar"></div><div class="rv-sidebar-user-text"><div class="rv-sidebar-user-name"></div><div class="rv-sidebar-user-model"></div></div></div><div class="rv-sidebar-user-actions"></div>'
      : '<div class="rv-main-user-top"><div class="rv-main-user-avatar"></div><div class="rv-main-user-info"><strong></strong><span></span></div></div><p class="rv-main-user-prompt"></p><div class="rv-main-user-actions"></div>';
    const avatarNode=card.querySelector(compact?'.rv-sidebar-avatar':'.rv-main-user-avatar');avatarNode.textContent=avatarText(u);avatarNode.style.background=avatarColor(u);
    if(compact){card.querySelector('.rv-sidebar-user-name').textContent=u.name;card.querySelector('.rv-sidebar-user-model').textContent=u.model;}
    else{card.querySelector('.rv-main-user-info strong').textContent=u.name;card.querySelector('.rv-main-user-info span').textContent=u.model;card.querySelector('.rv-main-user-prompt').textContent=u.prompt||'no custom personality yet';}
    const actions=card.querySelector(compact?'.rv-sidebar-user-actions':'.rv-main-user-actions');
    const edit=document.createElement('button');edit.textContent='Edit';edit.onclick=()=>editUserModal(u);
    const del=document.createElement('button');del.textContent='Delete';del.className='danger';del.onclick=()=>deleteUser(u);
    actions.append(edit,del);return card;
  }

  function renderUsersMain(){
    const main=document.querySelector('.main-panel');if(!main)return;setMainChatVisible(false);
    let page=main.querySelector('.rv-users-main-page');if(!page){page=document.createElement('section');page.className='rv-users-main-page';main.append(page);}page.innerHTML='';
    const hero=document.createElement('div');hero.className='rv-users-main-hero';hero.innerHTML='<div><div class="rv-users-eyebrow">AI USERS</div><h1>Your AI users</h1><p>Create separate AI identities with their own model, personality, and profile picture.</p></div>';
    const create=document.createElement('button');create.className='rv-users-create-main';create.textContent='+ New AI user';create.onclick=()=>editUserModal(null);hero.append(create);page.append(hero);
    const grid=document.createElement('div');grid.className='rv-main-user-grid';const list=users();
    if(!list.length){const empty=document.createElement('div');empty.className='rv-main-users-empty';empty.innerHTML='<div class="rv-main-users-empty-icon">AI</div><h2>No AI users yet</h2><p>Make one and give it a model, personality, and avatar.</p>';grid.append(empty);}else for(const u of list)grid.append(userCard(u,false));page.append(grid);
  }

  function renderUsers(){
    document.querySelector('.rv-social-backdrop')?.remove();normalChatListVisible(false);setSectionTitle('Users');
    const title=document.querySelector('.sidebar-section-title');if(!title)return;
    const create=document.createElement('button');create.className='rv-sidebar-create-user';create.textContent='+ New AI user';create.onclick=()=>editUserModal(null);title.insertAdjacentElement('afterend',create);
    const box=document.createElement('div');box.className='rv-sidebar-user-list';create.insertAdjacentElement('afterend',box);const list=users();
    if(!list.length)box.innerHTML='<div class="rv-sidebar-empty">no AI users yet</div>';else for(const u of list)box.append(userCard(u,true));renderUsersMain();
  }

  function renderChats(){document.querySelector('.rv-social-backdrop')?.remove();setMainChatVisible(true);normalChatListVisible(true);setSectionTitle('Chats');}
  function render(){ensureTabs();removeCustomLists();if(mode==='users')renderUsers();else renderChats();}

  window.addEventListener('DOMContentLoaded',()=>{document.querySelector('.rv-social-backdrop')?.remove();ensureTabs();render();const observer=new MutationObserver(()=>document.querySelector('.rv-social-backdrop')?.remove());observer.observe(document.body,{childList:true,subtree:false});});
  window.RogerVIBSidebarSocial={switchMode,render};
})();