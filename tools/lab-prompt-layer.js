// Tiny post-processing layer for AI Lab persona presets.
// Load BEFORE ollama-tool-context.js so the core request preparer calls into this after building its prompt.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const PERSONA_KEY = 'rogervib_persona_v1';
  const personaPrompts = {
    rogervib: 'use the normal rogervib personality and vibe.',
    chaos: 'persona preset: absolute chaos. lean hard into chaotic funny chat energy. stay useful and truthful, but weird jokes and unhinged phrasing are welcome.',
    corporate: 'persona preset: corporate drone. use polished professional grammar, restrained tone, and boring corporate-assistant energy. do not use slang.',
    zen: 'persona preset: zen master. be extremely concise, calm, low-sass, and direct. usually one or two sentences unless detail is necessary.',
    nerd: 'persona preset: lab nerd. be curious, technical, precise, and enthusiastic about how things work. explain mechanisms when useful without becoming corporate.'
  };

  window.fetch = async function RogerVIBLabPromptFetch(input, init={}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.includes('localhost:11434/api/chat') || typeof init?.body !== 'string') return nativeFetch(input,init);
    try {
      const payload=JSON.parse(init.body);
      const key=localStorage.getItem(PERSONA_KEY)||'rogervib';
      const prompt=personaPrompts[key]||personaPrompts.rogervib;
      const system=Array.isArray(payload.messages) ? payload.messages.find(m=>m?.role==='system') : null;
      if(system && key!=='rogervib') system.content=`${system.content}\n\nCURRENT PERSONA PRESET — REAL USER CONTROL:\n${prompt}\nfollow this preset unless it conflicts with truthfulness, tool rules, or safety.`;
      return nativeFetch(input,{...init,body:JSON.stringify(payload)});
    } catch { return nativeFetch(input,init); }
  };
})();