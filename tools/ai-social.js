// RogerVIB AI social layer: persistent AI users, DMs, and group chats.
(() => {
  const OLLAMA_URL = 'http://localhost:11434/api/chat';
  const USERS_KEY = 'rogervib_ai_users_v1';
  const DMS_KEY = 'rogervib_ai_dms_v1';
  const GROUPS_KEY = 'rogervib_ai_groups_v1';
  const GROUP_MESSAGES_KEY = 'rogervib_ai_group_messages_v1';
  const id = () => crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const modelOptions = () => [...(document.getElementById('modelPicker')?.options || [])].map(o => o.value).filter(Boolean);
  const now = () => new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  const initials = s => String(s || '?').trim().split(/\s+/).slice(0,2).map(x => x[0]?.toUpperCase()).join('') || '?';

  let users = read(USERS_KEY, []);
  let dms = read(DMS_KEY, {});
  let groups = read(GROUPS_KEY, []);
  let groupMessages = read(GROUP_MESSAGES_KEY, {});
  let root = null;
  let currentView = {type:'users'};
  let runningController = null;

  function saveAll(){ write(USERS_KEY, users); write(DMS_KEY, dms); write(GROUPS_KEY, groups); write(GROUP_MESSAGES_KEY, groupMessages); }
  function userById(uid){ return users.find(u => u.id === uid); }
  function groupById(gid){ return groups.find(g => g.id === gid); }

  function ensureUi(){
    if(root) return root;
    root = document.createElement('div');
    root.className = 'rv-social-backdrop';
    root.hidden = true;
    root.innerHTML = `
      <section class="rv-social-shell">
        <aside class="rv-social-nav">
          <div class="rv-social-brand">AI SOCIAL</div>
          <button data-nav-users>AI Users</button>
          <button data-nav-groups>AI Group Chat</button>
          <div class="rv-social-list-title">DIRECT MESSAGES</div>
          <div data-dm-list></div>
          <div class="rv-social-list-title">GROUPS</div>
          <div data-group-list></div>
        </aside>
        <main class="rv-social-main">
          <header class="rv-social-top"><strong data-title>AI Users</strong><span class="rv-social-spacer"></span><button data-close>×</button></header>
          <div class="rv-social-content" data-content></div>
        </main>
      </section>`;
    document.body.appendChild(root);
    root.querySelector('[data-close]').onclick = () => { abortRunning(); root.hidden = true; };
    root.querySelector('[data-nav-users]').onclick = () => showUsers();
    root.querySelector('[data-nav-groups]').onclick = () => showGroups();
    return root;
  }

  function abortRunning(){ if(runningController) runningController.abort(); runningController = null; }

  function renderNav(){
    const ui = ensureUi();
    const dm = ui.querySelector('[data-dm-list]'); dm.innerHTML = '';
    for(const u of users){
      const b = document.createElement('button'); b.className = 'rv-social-nav-item'; b.textContent = u.name; b.onclick = () => openDm(u.id); dm.append(b);
    }
    const gl = ui.querySelector('[data-group-list]'); gl.innerHTML = '';
    for(const g of groups){
      const b = document.createElement('button'); b.className = 'rv-social-nav-item'; b.textContent = '# ' + g.name; b.onclick = () => openGroup(g.id); gl.append(b);
    }
  }

  function setTitle(text){ ensureUi().querySelector('[data-title]').textContent = text; }
  function content(){ const c = ensureUi().querySelector('[data-content]'); c.innerHTML=''; return c; }

  function showUsers(){
    currentView = {type:'users'}; setTitle('AI Users'); renderNav();
    const c = content();
    const toolbar = document.createElement('div'); toolbar.className='rv-social-toolbar';
    const add = document.createElement('button'); add.textContent='+ Create AI user'; add.onclick=()=>editUser(); toolbar.append(add); c.append(toolbar);
    const grid = document.createElement('div'); grid.className='rv-user-grid';
    if(!users.length){ grid.innerHTML='<div class="rv-social-empty">no AI users yet. create one and give a model an actual identity.</div>'; }
    for(const u of users){
      const card=document.createElement('div');card.className='rv-user-card';
      card.innerHTML=`<div class="rv-user-avatar">${initials(u.name)}</div><div class="rv-user-info"><strong></strong><span></span><p></p></div>`;
      card.querySelector('strong').textContent=u.name; card.querySelector('span').textContent=u.model; card.querySelector('p').textContent=u.prompt || 'no custom personality';
      const actions=document.createElement('div');actions.className='rv-user-actions';
      const chat=document.createElement('button');chat.textContent='Message';chat.onclick=()=>openDm(u.id);
      const edit=document.createElement('button');edit.textContent='Edit';edit.onclick=()=>editUser(u.id);
      const del=document.createElement('button');del.textContent='Delete';del.className='danger';del.onclick=()=>deleteUser(u.id);
      actions.append(chat,edit,del);card.append(actions);grid.append(card);
    }
    c.append(grid);
  }

  function editUser(uid){
    const existing = userById(uid);
    setTitle(existing ? `Edit ${existing.name}` : 'Create AI user');
    const c=content(); const models=modelOptions();
    const form=document.createElement('div');form.className='rv-social-form';
    form.innerHTML=`<label>Name<input data-name placeholder="Gemma"></label><label>Model<select data-model></select></label><label>Personality / instructions<textarea data-prompt rows="6" placeholder="who is this AI user? how should they talk?"></textarea></label><div class="rv-social-form-actions"><button data-cancel>Cancel</button><button class="primary" data-save>Save user</button></div>`;
    const modelSel=form.querySelector('[data-model]'); for(const m of models){const o=document.createElement('option');o.value=m;o.textContent=m;modelSel.append(o);}
    form.querySelector('[data-name]').value=existing?.name||''; modelSel.value=existing?.model||models[0]||''; form.querySelector('[data-prompt]').value=existing?.prompt||'';
    form.querySelector('[data-cancel]').onclick=showUsers;
    form.querySelector('[data-save]').onclick=()=>{
      const name=form.querySelector('[data-name]').value.trim(); const model=modelSel.value; const prompt=form.querySelector('[data-prompt]').value.trim(); if(!name||!model)return;
      if(existing){existing.name=name;existing.model=model;existing.prompt=prompt;} else users.push({id:id(),name,model,prompt});
      saveAll();showUsers();
    };
    c.append(form);
  }

  function deleteUser(uid){
    users=users.filter(u=>u.id!==uid); delete dms[uid];
    groups.forEach(g=>g.members=g.members.filter(id=>id!==uid)); saveAll(); showUsers();
  }

  function showGroups(){
    currentView={type:'groups'};setTitle('AI Group Chat');renderNav();const c=content();
    const toolbar=document.createElement('div');toolbar.className='rv-social-toolbar';const add=document.createElement('button');add.textContent='+ New group';add.onclick=()=>editGroup();toolbar.append(add);c.append(toolbar);
    const grid=document.createElement('div');grid.className='rv-group-grid';
    if(!groups.length)grid.innerHTML='<div class="rv-social-empty">no groups yet. create one and add AI users.</div>';
    for(const g of groups){const card=document.createElement('div');card.className='rv-group-card';const names=g.members.map(id=>userById(id)?.name).filter(Boolean);card.innerHTML='<strong></strong><span></span>';card.querySelector('strong').textContent='# '+g.name;card.querySelector('span').textContent=names.length?names.join(', '):'no members';const a=document.createElement('div');a.className='rv-user-actions';const open=document.createElement('button');open.textContent='Open';open.onclick=()=>openGroup(g.id);const edit=document.createElement('button');edit.textContent='Members';edit.onclick=()=>editGroup(g.id);const del=document.createElement('button');del.textContent='Delete';del.className='danger';del.onclick=()=>{groups=groups.filter(x=>x.id!==g.id);delete groupMessages[g.id];saveAll();showGroups();};a.append(open,edit,del);card.append(a);grid.append(card);} c.append(grid);
  }

  function editGroup(gid){
    const existing=groupById(gid);setTitle(existing?`Edit #${existing.name}`:'Create group');const c=content();const form=document.createElement('div');form.className='rv-social-form';
    form.innerHTML='<label>Group name<input data-name placeholder="general"></label><div class="rv-social-list-title">MEMBERS</div><div data-members class="rv-member-picker"></div><div class="rv-social-form-actions"><button data-cancel>Cancel</button><button class="primary" data-save>Save group</button></div>';
    form.querySelector('[data-name]').value=existing?.name||'';const selected=new Set(existing?.members||[]);const box=form.querySelector('[data-members]');
    for(const u of users){const row=document.createElement('label');row.className='rv-member-pick';const cb=document.createElement('input');cb.type='checkbox';cb.checked=selected.has(u.id);cb.dataset.id=u.id;const av=document.createElement('span');av.className='rv-mini-avatar';av.textContent=initials(u.name);const name=document.createElement('span');name.textContent=`${u.name} · ${u.model}`;row.append(cb,av,name);box.append(row);}
    if(!users.length)box.innerHTML='<div class="rv-social-empty">create AI users first.</div>';
    form.querySelector('[data-cancel]').onclick=showGroups;
    form.querySelector('[data-save]').onclick=()=>{const name=form.querySelector('[data-name]').value.trim();if(!name)return;const members=[...box.querySelectorAll('input:checked')].map(x=>x.dataset.id);if(existing){existing.name=name;existing.members=members;}else groups.push({id:id(),name,members});saveAll();showGroups();};c.append(form);
  }

  function renderChatHeader(c, title, sub, extraButton){
    const h=document.createElement('div');h.className='rv-chat-head';const text=document.createElement('div');text.innerHTML='<strong></strong><span></span>';text.querySelector('strong').textContent=title;text.querySelector('span').textContent=sub;h.append(text);if(extraButton)h.append(extraButton);c.append(h);
  }

  function renderMessages(box, messages){
    box.innerHTML=''; if(!messages.length){box.innerHTML='<div class="rv-social-empty">no messages yet.</div>';return;}
    for(const m of messages){const row=document.createElement('div');row.className='rv-social-message';const av=document.createElement('div');av.className='rv-user-avatar small';av.textContent=m.author==='Roger'?'R':initials(m.author);const body=document.createElement('div');const meta=document.createElement('div');meta.className='rv-ad-meta';meta.innerHTML='<span class="rv-ad-name"></span><span class="rv-ad-time"></span>';meta.querySelector('.rv-ad-name').textContent=m.author;meta.querySelector('.rv-ad-time').textContent=m.time||'';const txt=document.createElement('div');txt.className='rv-ad-body';txt.textContent=m.text;body.append(meta,txt);row.append(av,body);box.append(row);}box.scrollTop=box.scrollHeight;
  }

  async function streamUser(aiUser, history, liveMessage, onUpdate, modeNote=''){
    abortRunning();const controller=new AbortController();runningController=controller;
    const transcript=history.map(m=>`${m.author}: ${m.text}`).join('\n');
    const system=`You are ${aiUser.name}, an AI user inside RogerVIB. Your underlying model is ${aiUser.model}. Stay in your own identity; do not impersonate Roger or other AI users. ${aiUser.prompt||''}\n${modeNote}\nReply naturally to the conversation. Do not prefix your reply with your name.`;
    const payload={model:aiUser.model,stream:true,think:true,messages:[{role:'system',content:system},{role:'user',content:`Conversation:\n${transcript}\n\nSend your next message.`}]};
    let response=await fetch(OLLAMA_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    if(!response.ok&&response.status>=400&&response.status<500){delete payload.think;response=await fetch(OLLAMA_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});}
    if(!response.ok)throw new Error(`HTTP ${response.status}`);if(!response.body)throw new Error('no response body');
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',answer='';
    const consume=line=>{if(!line.trim())return;const data=JSON.parse(line),m=data?.message||{};if(m.content){answer+=String(m.content);liveMessage.text=answer;onUpdate();}};
    while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines)consume(line);if(done)break;}if(buffer.trim())consume(buffer);liveMessage.text=answer.trim()||'(empty response)';onUpdate();runningController=null;
  }

  function openDm(uid){
    const u=userById(uid);if(!u)return;currentView={type:'dm',id:uid};setTitle(u.name);renderNav();const c=content();renderChatHeader(c,u.name,u.model);
    const messages=dms[uid]||(dms[uid]=[]);const box=document.createElement('div');box.className='rv-social-messages';renderMessages(box,messages);c.append(box);
    const composer=document.createElement('div');composer.className='rv-social-composer';composer.innerHTML='<textarea rows="1" placeholder="Message"></textarea><button>Send</button>';const input=composer.querySelector('textarea');const send=async()=>{const text=input.value.trim();if(!text)return;messages.push({author:'Roger',text,time:now()});input.value='';renderMessages(box,messages);saveAll();const live={author:u.name,text:'thinking…',time:now()};messages.push(live);renderMessages(box,messages);try{await streamUser(u,messages.slice(0,-1),live,()=>renderMessages(box,messages),'This is a private DM with Roger.');}catch(e){live.text=`error: ${e.message}`;renderMessages(box,messages);}saveAll();};composer.querySelector('button').onclick=send;input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}};c.append(composer);input.focus();
  }

  function openGroup(gid){
    const g=groupById(gid);if(!g)return;currentView={type:'group',id:gid};setTitle('# '+g.name);renderNav();const c=content();const members=g.members.map(userById).filter(Boolean);const manage=document.createElement('button');manage.textContent='Members';manage.onclick=()=>editGroup(g.id);renderChatHeader(c,'# '+g.name,members.map(x=>x.name).join(', ')||'no members',manage);
    const messages=groupMessages[gid]||(groupMessages[gid]=[]);const box=document.createElement('div');box.className='rv-social-messages';renderMessages(box,messages);c.append(box);
    const composer=document.createElement('div');composer.className='rv-social-composer';composer.innerHTML='<textarea rows="1" placeholder="Message #group"></textarea><select data-replies><option value="1">1 AI reply</option><option value="2" selected>2 AI replies</option><option value="4">4 AI replies</option></select><button>Send</button>';const input=composer.querySelector('textarea');
    const send=async()=>{const text=input.value.trim();if(!text||!members.length)return;messages.push({author:'Roger',text,time:now()});input.value='';renderMessages(box,messages);saveAll();const count=Number(composer.querySelector('[data-replies]').value||2);for(let i=0;i<count;i++){const ai=members[i%members.length];const live={author:ai.name,text:'thinking…',time:now()};messages.push(live);renderMessages(box,messages);try{await streamUser(ai,messages.slice(0,-1),live,()=>renderMessages(box,messages),`This is group chat #${g.name}. Other members: ${members.filter(x=>x.id!==ai.id).map(x=>x.name).join(', ')||'none'}. Read and respond to the shared transcript, including other AI users.`);}catch(e){live.text=`error: ${e.message}`;renderMessages(box,messages);}saveAll();}};
    composer.querySelector('button').onclick=send;input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}};c.append(composer);input.focus();
  }

  function open(){ ensureUi();root.hidden=false;renderNav();showUsers(); }

  function installButtons(){
    const menu=document.querySelector('.rv-model-menu');if(!menu)return false;
    const old=menu.querySelector('[data-battle]');if(old){old.textContent='AI Group Chat';old.onclick=()=>{open();showGroups();};}
    if(!menu.querySelector('[data-ai-users]')){const lab=menu.querySelector('.rv-lab-buttons');if(lab){const btn=document.createElement('button');btn.className='rv-lab-button';btn.dataset.aiUsers='1';btn.textContent='AI Users';btn.onclick=open;lab.prepend(btn);}}
    return true;
  }

  window.addEventListener('DOMContentLoaded',()=>{ensureUi();let n=0;const t=setInterval(()=>{n++;if(installButtons()||n>50)clearInterval(t);},100);});
  window.RogerVIBAISocial={open,showUsers,showGroups,openDm,openGroup};
})();