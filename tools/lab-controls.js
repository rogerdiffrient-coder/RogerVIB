// RogerVIB AI Lab: personas, temperature, context meter, raw tool logs, config presets, and model battles.
(() => {
  const PERSONA_KEY = 'rogervib_persona_v1';
  const TEMP_KEY = 'rogervib_temperature_v1';
  const TOOL_LOG_KEY = 'rogervib_tool_logs_visible_v1';
  const PRESETS_KEY = 'rogervib_lab_presets_v1';
  const MODEL_KEY = 'rogervib_preferred_model_v1';
  const CONTEXT_GUESS = 131072;

  const personas = {
    rogervib: {name:'RogerVIB', prompt:'use the normal rogervib personality and vibe.'},
    chaos: {name:'absolute chaos', prompt:'lean hard into chaotic funny chat energy. stay useful and truthful, but weird jokes and unhinged phrasing are welcome.'},
    corporate: {name:'corporate drone', prompt:'use polished professional grammar, restrained tone, and boring corporate-assistant energy. do not use slang.'},
    zen: {name:'zen master', prompt:'be extremely concise, calm, low-sass, and direct. usually one or two sentences unless detail is necessary.'},
    nerd: {name:'lab nerd', prompt:'be curious, technical, precise, and enthusiastic about how things work. explain mechanisms when useful without becoming corporate.'}
  };

  const readTemp = () => {
    const n = Number(localStorage.getItem(TEMP_KEY));
    return Number.isFinite(n) ? Math.max(0,Math.min(1.5,n)) : 0.7;
  };
  const readPersona = () => personas[localStorage.getItem(PERSONA_KEY)] ? localStorage.getItem(PERSONA_KEY) : 'rogervib';
  const readPresets = () => { try { const x=JSON.parse(localStorage.getItem(PRESETS_KEY)||'[]'); return Array.isArray(x)?x:[]; } catch { return []; } };
  const savePresets = value => localStorage.setItem(PRESETS_KEY,JSON.stringify(value));
  const emitChanged = () => window.dispatchEvent(new CustomEvent('rogervib:lab-settings-changed'));

  let contextUi = null;
  let toolDrawer = null;
  let battle = null;
  let toolLogs = [];

  function updateContext(messages=[]) {
    const chars = JSON.stringify(messages || []).length;
    const tokens = Math.max(1,Math.round(chars/4));
    const pct = Math.max(0,Math.min(100,(tokens/CONTEXT_GUESS)*100));
    if (contextUi) {
      contextUi.fill.style.width = `${pct}%`;
      contextUi.value.textContent = `≈ ${tokens.toLocaleString()} / ${CONTEXT_GUESS.toLocaleString()} tokens`;
    }
    window.RogerVIBContextEstimate = {tokens,max:CONTEXT_GUESS,pct};
  }

  function installFetchLayer() {
    const previousFetch = window.fetch.bind(window);
    window.fetch = async function RogerVIBLabFetch(input, init={}) {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('localhost:11434/api/chat') && typeof init?.body === 'string') {
        try {
          const payload = JSON.parse(init.body);
          payload.options = {...(payload.options || {}), temperature:readTemp()};
          if (Array.isArray(payload.messages)) updateContext(payload.messages);
          init = {...init,body:JSON.stringify(payload)};
        } catch {}
      }
      return previousFetch(input,init);
    };
  }

  function installToolLogger() {
    const tools = window.RogerVIBTools;
    if (!tools || tools.__labWrapped) return;
    const originalRun = tools.run.bind(tools);
    tools.run = async (name,args={}) => {
      const started = performance.now();
      const result = await originalRun(name,args);
      toolLogs.unshift({time:new Date().toLocaleTimeString(),name,args,result,ms:Math.round(performance.now()-started)});
      toolLogs = toolLogs.slice(0,100);
      renderToolLogs();
      return result;
    };
    tools.__labWrapped = true;
  }

  function ensureToolDrawer() {
    if (toolDrawer) return toolDrawer;
    toolDrawer = document.createElement('aside');
    toolDrawer.className='rv-tool-log-drawer';
    toolDrawer.hidden = localStorage.getItem(TOOL_LOG_KEY) !== '1';
    toolDrawer.innerHTML='<div class="rv-tool-log-head"><span>RAW TOOL LOGS</span><div class="rv-tool-log-actions"><button data-clear>clear</button><button data-close>×</button></div></div><div class="rv-tool-log-body"></div>';
    toolDrawer.querySelector('[data-clear]').onclick=()=>{toolLogs=[];renderToolLogs();};
    toolDrawer.querySelector('[data-close]').onclick=()=>{toolDrawer.hidden=true;localStorage.setItem(TOOL_LOG_KEY,'0');};
    document.body.appendChild(toolDrawer);
    renderToolLogs();
    return toolDrawer;
  }

  function renderToolLogs() {
    if (!toolDrawer) return;
    const body=toolDrawer.querySelector('.rv-tool-log-body'); body.innerHTML='';
    if (!toolLogs.length) { body.innerHTML='<div class="rv-lab-value">no tool calls yet</div>'; return; }
    for (const log of toolLogs) {
      const entry=document.createElement('div'); entry.className='rv-tool-log-entry';
      const meta=document.createElement('div'); meta.className='rv-tool-log-meta'; meta.innerHTML=`<span>${log.name}</span><span>${log.time} · ${log.ms}ms</span>`;
      const pre=document.createElement('pre'); pre.textContent=JSON.stringify({arguments:log.args,result:log.result},null,2);
      entry.append(meta,pre); body.append(entry);
    }
  }

  function snapshotConfig() {
    return {
      model:document.getElementById('modelPicker')?.value || localStorage.getItem(MODEL_KEY) || '',
      persona:readPersona(), temperature:readTemp(),
      sass:Number(localStorage.getItem('rogervib_sass_v1')||5),
      length:localStorage.getItem('rogervib_reply_length_v1')||'normal',
      thinkingDepth:localStorage.getItem('rogervib_thinking_depth_v1')||'normal',
      showThinking:localStorage.getItem('rogervib_show_thinking_v1')!=='0'
    };
  }

  function applyConfig(config={}) {
    if (config.persona) localStorage.setItem(PERSONA_KEY,config.persona);
    if (config.temperature !== undefined) localStorage.setItem(TEMP_KEY,String(config.temperature));
    if (config.sass !== undefined) localStorage.setItem('rogervib_sass_v1',String(config.sass));
    if (config.length) localStorage.setItem('rogervib_reply_length_v1',config.length);
    if (config.thinkingDepth) localStorage.setItem('rogervib_thinking_depth_v1',config.thinkingDepth);
    if (config.showThinking !== undefined) localStorage.setItem('rogervib_show_thinking_v1',config.showThinking?'1':'0');
    if (config.model) {
      localStorage.setItem(MODEL_KEY,config.model);
      const select=document.getElementById('modelPicker');
      if (select && [...select.options].some(o=>o.value===config.model)) { select.value=config.model; select.dispatchEvent(new Event('change',{bubbles:true})); }
    }
    emitChanged();
  }

  function ensureBattle() {
    if (battle) return battle;
    battle=document.createElement('div'); battle.className='rv-battle-backdrop'; battle.hidden=true;
    battle.innerHTML=`<section class="rv-battle"><div class="rv-battle-head"><strong>MODEL BATTLE</strong><button class="rv-battle-close">×</button></div><div class="rv-battle-controls"><select data-a></select><select data-b></select><input data-prompt placeholder="send the same prompt to both models"><button class="rv-battle-run">FIGHT</button></div><div class="rv-battle-grid"><div class="rv-battle-side"><div class="rv-battle-model" data-label-a>model A</div><div class="rv-battle-output" data-out-a>waiting...</div></div><div class="rv-battle-side"><div class="rv-battle-model" data-label-b>model B</div><div class="rv-battle-output" data-out-b>waiting...</div></div></div></section>`;
    battle.querySelector('.rv-battle-close').onclick=()=>battle.hidden=true;
    battle.addEventListener('pointerdown',e=>{if(e.target===battle)battle.hidden=true;});
    battle.querySelector('.rv-battle-run').onclick=runBattle;
    document.body.appendChild(battle); return battle;
  }

  function battleModels() {
    const select=document.getElementById('modelPicker');
    return select ? [...select.options].map(o=>o.value).filter(Boolean) : [];
  }

  function openBattle() {
    const ui=ensureBattle(), models=battleModels();
    const a=ui.querySelector('[data-a]'), b=ui.querySelector('[data-b]');
    for (const sel of [a,b]) { sel.innerHTML=''; for(const m of models){const o=document.createElement('option');o.value=m;o.textContent=m;sel.append(o);} }
    const current=document.getElementById('modelPicker')?.value;
    if(models.includes(current))a.value=current;
    if(models.length>1)b.value=models.find(m=>m!==a.value)||models[0];
    ui.hidden=false; ui.querySelector('[data-prompt]').focus();
  }

  async function battleAsk(model,prompt,out,label) {
    label.textContent=model; out.textContent='thinking...';
    try {
      const response=await fetch('http://localhost:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-RogerVIB-Battle':'1'},body:JSON.stringify({model,stream:false,think:false,messages:[{role:'system',content:'You are RogerVIB.'},{role:'user',content:prompt}]})});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json(); out.textContent=data?.message?.content||'(empty response)';
    } catch(error){out.textContent=`error: ${error.message}`;}
  }

  async function runBattle() {
    const ui=ensureBattle(), prompt=ui.querySelector('[data-prompt]').value.trim(); if(!prompt)return;
    const a=ui.querySelector('[data-a]').value,b=ui.querySelector('[data-b]').value;
    await Promise.all([
      battleAsk(a,prompt,ui.querySelector('[data-out-a]'),ui.querySelector('[data-label-a]')),
      battleAsk(b,prompt,ui.querySelector('[data-out-b]'),ui.querySelector('[data-label-b]'))
    ]);
  }

  function installMenu() {
    const menu=document.querySelector('.rv-model-menu'); if(!menu || menu.querySelector('.rv-lab-section')) return false;
    const section=document.createElement('div'); section.className='rv-lab-section';
    section.innerHTML=`<div class="rv-lab-title">AI LAB</div>
      <div><div class="rv-lab-row"><span class="rv-lab-label">Persona</span><span class="rv-lab-value" data-persona-label></span></div><select class="rv-lab-select" data-persona></select></div>
      <div><div class="rv-lab-row"><span class="rv-lab-label">Temperature</span><span class="rv-lab-value" data-temp-value></span></div><input class="rv-lab-range" data-temp type="range" min="0" max="1.5" step="0.05"><div class="rv-lab-row"><span class="rv-lab-value">0 deterministic</span><span class="rv-lab-value">1.5 chaos</span></div></div>
      <div><div class="rv-lab-row"><span class="rv-lab-label">Context</span><span class="rv-lab-value" data-context-value>≈ 0 tokens</span></div><div class="rv-context-track"><div class="rv-context-fill"></div></div></div>
      <div class="rv-lab-buttons"><button class="rv-lab-button" data-tools>Tool inspector</button><button class="rv-lab-button primary" data-battle>Model battle</button></div>
      <div><div class="rv-lab-row"><span class="rv-lab-label">Config library</span><span class="rv-lab-value">save the whole setup</span></div><div class="rv-lab-buttons"><input class="rv-lab-input" data-preset-name placeholder="Sassy Gemma v1"><button class="rv-lab-button" data-save>Save</button></div><div class="rv-preset-list" data-presets></div></div>`;
    const persona=section.querySelector('[data-persona]');
    for(const [id,p] of Object.entries(personas)){const o=document.createElement('option');o.value=id;o.textContent=p.name;persona.append(o);}
    const temp=section.querySelector('[data-temp]');
    contextUi={fill:section.querySelector('.rv-context-fill'),value:section.querySelector('[data-context-value]')};

    function render() {
      persona.value=readPersona(); section.querySelector('[data-persona-label]').textContent=personas[readPersona()].name;
      temp.value=String(readTemp()); section.querySelector('[data-temp-value]').textContent=Number(readTemp()).toFixed(2);
      const list=section.querySelector('[data-presets]'); list.innerHTML='';
      readPresets().forEach((p,i)=>{const row=document.createElement('div');row.className='rv-preset-item';const use=document.createElement('button');use.textContent=p.name;use.onclick=()=>{applyConfig(p.config);render();};const del=document.createElement('button');del.textContent='×';del.onclick=()=>{const ps=readPresets();ps.splice(i,1);savePresets(ps);render();};row.append(use,del);list.append(row);});
    }
    persona.onchange=()=>{localStorage.setItem(PERSONA_KEY,persona.value);render();emitChanged();};
    temp.oninput=()=>{localStorage.setItem(TEMP_KEY,temp.value);render();emitChanged();};
    section.querySelector('[data-tools]').onclick=()=>{const d=ensureToolDrawer();d.hidden=!d.hidden;localStorage.setItem(TOOL_LOG_KEY,d.hidden?'0':'1');};
    section.querySelector('[data-battle]').onclick=openBattle;
    section.querySelector('[data-save]').onclick=()=>{const input=section.querySelector('[data-preset-name]');const name=input.value.trim();if(!name)return;const ps=readPresets();ps.unshift({name,config:snapshotConfig()});savePresets(ps.slice(0,20));input.value='';render();};
    menu.insertBefore(section,menu.querySelector('.rv-menu-footer'));
    render(); updateContext([]); return true;
  }

  window.addEventListener('DOMContentLoaded',()=>{
    installFetchLayer(); installToolLogger(); ensureToolDrawer(); ensureBattle();
    if(!installMenu()) setTimeout(installMenu,50);
  });
  window.addEventListener('rogervib:lab-settings-changed',()=>setTimeout(installMenu,0));
  window.RogerVIBLab={personas,readPersona,readTemp,snapshotConfig,applyConfig,openBattle,updateContext};
})();