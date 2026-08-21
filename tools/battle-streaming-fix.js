// Make Model Battle use the same streaming Ollama path as normal RogerVIB chat.
(() => {
  const OLLAMA_URL = 'http://localhost:11434/api/chat';

  async function streamBattleModel(model, prompt, output, label) {
    label.textContent = model;
    output.textContent = '';

    const payload = {
      model,
      stream: true,
      think: true,
      messages: [
        { role: 'system', content: 'You are RogerVIB.' },
        { role: 'user', content: prompt }
      ]
    };

    let response;
    try {
      response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (firstError) {
      // Some cloud routes get upset when two requests start at exactly the same moment.
      await new Promise(resolve => setTimeout(resolve, 300));
      response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    // Match normal chat behavior: if a model rejects explicit thinking, retry without it.
    if (!response.ok && response.status >= 400 && response.status < 500) {
      const fallback = { ...payload };
      delete fallback.think;
      response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fallback)
      });
    }

    if (!response.ok) {
      let detail = '';
      try {
        const data = await response.json();
        if (data?.error) detail = `: ${data.error}`;
      } catch {}
      throw new Error(`Ollama HTTP ${response.status}${detail}`);
    }
    if (!response.body) throw new Error('Ollama returned no streaming body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let thinking = '';

    const render = () => {
      output.textContent = answer || (thinking ? `thinking…\n\n${thinking}` : 'thinking…');
    };

    const consume = line => {
      if (!line.trim()) return;
      const data = JSON.parse(line);
      const message = data?.message || {};
      if (message.thinking) thinking += String(message.thinking);
      if (message.content) answer += String(message.content);
      render();
    };

    render();
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) consume(line);
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!answer.trim()) output.textContent = thinking.trim() || '(empty response)';
  }

  function install() {
    const battle = document.querySelector('.rv-battle');
    if (!battle) return false;
    const run = battle.querySelector('.rv-battle-run');
    if (!run || run.dataset.streamingFix === '1') return true;
    run.dataset.streamingFix = '1';

    run.onclick = async () => {
      const prompt = battle.querySelector('[data-prompt]')?.value.trim();
      if (!prompt) return;
      const modelA = battle.querySelector('[data-a]')?.value;
      const modelB = battle.querySelector('[data-b]')?.value;
      const outA = battle.querySelector('[data-out-a]');
      const outB = battle.querySelector('[data-out-b]');
      const labelA = battle.querySelector('[data-label-a]');
      const labelB = battle.querySelector('[data-label-b]');

      run.disabled = true;
      run.textContent = 'FIGHTING…';
      outA.textContent = 'connecting…';
      outB.textContent = 'connecting…';

      const lane = async (model, out, label) => {
        try {
          await streamBattleModel(model, prompt, out, label);
        } catch (error) {
          console.error('RogerVIB battle lane failed:', model, error);
          out.textContent = `error: ${error?.message || error}`;
        }
      };

      await Promise.all([
        lane(modelA, outA, labelA),
        lane(modelB, outB, labelB)
      ]);

      run.disabled = false;
      run.textContent = 'FIGHT';
    };
    return true;
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (!install()) setTimeout(install, 100);
  });
})();
