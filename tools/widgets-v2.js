// RogerVIB safe inline widgets + deterministic mini-game layer.
// Widgets are templates owned by RogerVIB. Models only provide safe data.
(() => {
  if (!window.RogerVIBTools) throw new Error('RogerVIBTools must load before widgets-v2');

  const WIDGET_KEY = 'rogervib_widgets_v1';
  const GAME_KEY = 'rogervib_games_v1';
  const CHAT_KEY = 'rogervib_chats_v1';
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
  const WORDS = ['crane','train','stare','plant','stone','light','dream','ocean','bread','music','spice','candy','flame','house','green','world','smile','water','chair','cloud'];

  const clean = (value, max = 12000) => String(value ?? '').slice(0, max);
  const activeChatId = () => localStorage.getItem(ACTIVE_CHAT_KEY) || 'default';

  function read(key, fallback = {}) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '');
      return value ?? fallback;
    } catch { return fallback; }
  }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function makeId() { return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

  function widgetStore() {
    const all = read(WIDGET_KEY, {});
    const chat = activeChatId();
    if (!Array.isArray(all[chat])) all[chat] = [];
    return { all, chat, list: all[chat] };
  }

  function saveWidget(spec, { replaceGame = false } = {}) {
    const ref = widgetStore();
    if (replaceGame && spec.type === 'game' && spec.data?.game) {
      const existing = ref.list.find(item => item.type === 'game' && item.data?.game === spec.data.game && !item.closed);
      if (existing) {
        existing.data = spec.data;
        existing.closed = false;
        existing.updatedAt = Date.now();
        write(WIDGET_KEY, ref.all);
        renderActiveWidgets();
        return existing;
      }
    }
    const widget = { id: makeId(), createdAt: Date.now(), closed: false, ...spec };
    ref.list.push(widget);
    ref.all[ref.chat] = ref.list.slice(-40);
    write(WIDGET_KEY, ref.all);
    renderActiveWidgets();
    return widget;
  }

  function closeWidget(id) {
    const ref = widgetStore();
    const widget = ref.list.find(item => item.id === id);
    if (!widget) return;
    widget.closed = true;
    write(WIDGET_KEY, ref.all);
    renderActiveWidgets();
  }

  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function shell(spec, label, title) {
    const card = make('section', 'rv2-widget');
    const header = make('div', 'rv2-header');
    const heading = make('div', 'rv2-heading');
    heading.append(make('span', 'rv2-kicker', label));
    if (title) heading.append(make('strong', 'rv2-title', clean(title, 100)));
    const close = make('button', 'rv2-close', '×');
    close.type = 'button';
    close.title = 'Close panel';
    close.setAttribute('aria-label', 'Close panel');
    close.addEventListener('click', () => closeWidget(spec.id));
    header.append(heading, close);
    card.append(header);
    return card;
  }

  function escapeHtml(text) {
    return clean(text).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }

  function miniMarkdown(text) {
    let html = escapeHtml(text);
    return html
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^[-*] (.+)$/gm, '<div>• $1</div>')
      .replace(/\n/g, '<br>');
  }

  function renderCalculator(spec) {
    const data = spec.data || {};
    const card = shell(spec, 'CALCULATOR', data.title || 'Calculator');
    const body = make('div', 'rv2-calculator');
    body.append(make('div', 'rv2-expression', `${clean(data.expression, 180)} =`));
    body.append(make('div', 'rv2-result', clean(data.result, 220)));
    if (data.steps) body.append(make('div', 'rv2-muted', clean(data.steps, 1000)));
    card.append(body);
    return card;
  }

  function renderMarkdown(spec) {
    const data = spec.data || {};
    const card = shell(spec, 'MARKDOWN', data.title || 'Document');
    const body = make('div', 'rv2-markdown');
    body.innerHTML = miniMarkdown(data.content || '');
    card.append(body);
    return card;
  }

  function renderWordle(spec, card, data) {
    const length = Math.max(3, Math.min(8, Number(data.word_length) || 5));
    const rows = Array.isArray(data.rows) ? data.rows.slice(0, 6) : [];
    const grid = make('div', 'rv2-wordle');
    for (let r = 0; r < 6; r++) {
      const row = rows[r] || {};
      const text = clean(row.text, length).toUpperCase();
      const marks = clean(row.marks, length).toLowerCase();
      for (let c = 0; c < length; c++) {
        const tile = make('div', 'rv2-tile', text[c] || '');
        if (marks[c] === 'g') tile.classList.add('correct');
        else if (marks[c] === 'y') tile.classList.add('present');
        else if (marks[c] === 'b' || marks[c] === 'x') tile.classList.add('absent');
        grid.append(tile);
      }
    }
    card.append(grid);
    const hint = make('div', 'rv2-chat-hint', data.done ? (data.won ? 'You got it! 🎉' : `Game over — the word was ${String(data.reveal_secret || '').toUpperCase()}.`) : 'Type your guess in chat!');
    card.append(hint);
  }

  function renderGame(spec) {
    const data = spec.data || {};
    const game = clean(data.game, 40).toLowerCase();
    const card = shell(spec, `GAME • ${game.replaceAll('_',' ').toUpperCase()}`, data.title || game.replaceAll('_',' '));
    if (data.status) card.append(make('div', 'rv2-status', clean(data.status, 500)));
    if (game === 'wordle') renderWordle(spec, card, data);
    else {
      const text = data.scene || data.question || data.prompt || data.pattern || '';
      if (text) card.append(make('div', 'rv2-game-text', clean(text, 5000)));
      if (data.lives !== undefined && data.lives !== '') card.append(make('div', 'rv2-muted', `Lives: ${data.lives}`));
      if (data.wrong_guesses) card.append(make('div', 'rv2-muted', `Wrong guesses: ${clean(data.wrong_guesses, 500)}`));
    }
    return card;
  }

  function renderWidget(spec) {
    if (spec.type === 'calculator') return renderCalculator(spec);
    if (spec.type === 'markdown') return renderMarkdown(spec);
    if (spec.type === 'game') return renderGame(spec);
    return null;
  }

  let rendering = false;
  function renderActiveWidgets() {
    if (rendering) return;
    const conversation = document.getElementById('conversation');
    if (!conversation) return;
    rendering = true;
    conversation.querySelectorAll('.rogervib-widget-row').forEach(node => node.remove());
    const ref = widgetStore();
    for (const spec of ref.list) {
      if (spec.closed) continue;
      const widget = renderWidget(spec);
      if (!widget) continue;
      const row = make('div', 'rogervib-widget-row');
      row.dataset.widgetId = spec.id;
      row.append(widget);
      conversation.append(row);
    }
    rendering = false;
  }

  function gameRef() {
    const all = read(GAME_KEY, {});
    const chat = activeChatId();
    if (!all[chat] || typeof all[chat] !== 'object') all[chat] = {};
    return { all, chat, games: all[chat] };
  }
  function saveGames(ref) { write(GAME_KEY, ref.all); }

  function wordleMarks(secret, guess) {
    const marks = Array(secret.length).fill('b');
    const remaining = {};
    for (let i = 0; i < secret.length; i++) {
      if (guess[i] === secret[i]) marks[i] = 'g';
      else remaining[secret[i]] = (remaining[secret[i]] || 0) + 1;
    }
    for (let i = 0; i < secret.length; i++) {
      if (marks[i] === 'g') continue;
      if ((remaining[guess[i]] || 0) > 0) { marks[i] = 'y'; remaining[guess[i]]--; }
    }
    return marks.join('');
  }

  function wordleStatePublic(state) {
    const won = state.rows.at(-1)?.text === state.secret;
    return {
      game:'wordle', title:'Wordle Game', rows:state.rows, word_length:state.secret.length,
      done:state.done, won, guesses_left:Math.max(0, state.maxGuesses - state.rows.length),
      reveal_secret:state.done ? state.secret : undefined
    };
  }

  function startWordle(secret) {
    const ref = gameRef();
    const chosen = clean(secret || WORDS[Math.floor(Math.random() * WORDS.length)], 8).toLowerCase().replace(/[^a-z]/g,'');
    const finalSecret = chosen.length === 5 ? chosen : WORDS[Math.floor(Math.random() * WORDS.length)];
    ref.games.wordle = { secret:finalSecret, rows:[], maxGuesses:6, done:false };
    saveGames(ref);
    const pub = wordleStatePublic(ref.games.wordle);
    saveWidget({type:'game', data:pub}, {replaceGame:true});
    return pub;
  }

  function guessWordle(guess) {
    const ref = gameRef();
    const state = ref.games.wordle;
    if (!state) throw new Error('Wordle has not been started');
    if (state.done) throw new Error('Wordle game is already over');
    const word = clean(guess, 20).toLowerCase().replace(/[^a-z]/g,'');
    if (word.length !== state.secret.length) throw new Error(`guess must be ${state.secret.length} letters`);
    state.rows.push({text:word, marks:wordleMarks(state.secret, word)});
    if (word === state.secret || state.rows.length >= state.maxGuesses) state.done = true;
    saveGames(ref);
    const pub = wordleStatePublic(state);
    saveWidget({type:'game', data:pub}, {replaceGame:true});
    return pub;
  }

  function activeWordle() {
    const ref = gameRef();
    return ref.games.wordle || null;
  }

  function appendLocalChat(role, text) {
    const chats = read(CHAT_KEY, []);
    const id = activeChatId();
    const chat = Array.isArray(chats) ? chats.find(item => item.id === id) : null;
    if (chat) {
      if (!Array.isArray(chat.messages)) chat.messages = [];
      chat.messages.push({role, text, segments:role === 'bot' ? [{type:'text',text,round:0}] : undefined});
      write(CHAT_KEY, chats);
    }

    const conversation = document.getElementById('conversation');
    if (!conversation) return;
    const row = make('div', `message-row ${role}`);
    if (role === 'bot') row.append(make('div', 'bot-avatar', 'R'));
    const stack = make('div', 'message-stack');
    const bubble = make('div', 'message-bubble', text);
    stack.append(bubble); row.append(stack); conversation.append(row);
    conversation.scrollTop = conversation.scrollHeight;
  }

  function clearComposer() {
    const input = document.getElementById('messageInput');
    if (!input) return;
    input.value = '';
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.focus();
  }

  function handleLocalWordle(event) {
    const input = document.getElementById('messageInput');
    if (!input) return false;
    const text = input.value.trim();
    if (!text) return false;

    if (/\b(play|start|lets play|let's play)\b.*\bwordle\b/i.test(text) || /^wordle$/i.test(text)) {
      event.preventDefault(); event.stopImmediatePropagation();
      appendLocalChat('user', text);
      const state = startWordle();
      appendLocalChat('bot', `Wordle started — ${state.word_length} letters, 6 guesses. Type your guess in chat!`);
      clearComposer();
      return true;
    }

    const state = activeWordle();
    if (!state || state.done) return false;
    const normalized = text.toLowerCase().replace(/[^a-z]/g,'');
    if (normalized.length !== state.secret.length || !/^[a-z]+$/.test(normalized)) return false;

    event.preventDefault(); event.stopImmediatePropagation();
    appendLocalChat('user', text);
    try {
      const result = guessWordle(normalized);
      if (result.won) appendLocalChat('bot', `Yep — ${normalized.toUpperCase()} is the word! 🎉`);
      else if (result.done) appendLocalChat('bot', `Out of guesses. The word was ${String(result.reveal_secret).toUpperCase()}.`);
      else appendLocalChat('bot', `${result.guesses_left} guess${result.guesses_left === 1 ? '' : 'es'} left.`);
    } catch (error) {
      appendLocalChat('bot', `Wordle: ${error.message}`);
    }
    clearComposer();
    return true;
  }

  // Model-callable safe widget tools.
  RogerVIBTools.register({
    name:'show_calculator_widget',
    description:'Show a closable inline calculator card. Use only after calculator has produced a verified result.',
    parameters:{type:'object',required:['expression','result'],properties:{expression:{type:'string'},result:{type:'string'},steps:{type:'string'},title:{type:'string'}}},
    async run(args) {
      const widget = saveWidget({type:'calculator',data:{expression:clean(args.expression),result:clean(args.result),steps:clean(args.steps),title:clean(args.title)}});
      return {displayed:true,widget_id:widget.id};
    }
  });

  RogerVIBTools.register({
    name:'show_markdown_widget',
    description:'Show a closable sanitized Markdown document panel. Normal chat already supports Markdown; use this only when a separate document-like panel is useful.',
    parameters:{type:'object',required:['content'],properties:{title:{type:'string'},content:{type:'string'}}},
    async run(args) {
      const widget = saveWidget({type:'markdown',data:{title:clean(args.title),content:clean(args.content)}});
      return {displayed:true,widget_id:widget.id};
    }
  });

  RogerVIBTools.register({
    name:'show_game_widget',
    description:'Show or update a closable inline game panel. Wordle input is typed directly in chat; do not add a Make a Guess button.',
    parameters:{type:'object',required:['game'],properties:{game:{type:'string'},title:{type:'string'},status:{type:'string'},scene:{type:'string'},question:{type:'string'},prompt:{type:'string'},pattern:{type:'string'},rows:{type:'array'},word_length:{type:'integer'},done:{type:'boolean'},won:{type:'boolean'},reveal_secret:{type:'string'},lives:{type:'integer'},wrong_guesses:{type:'string'}}},
    async run(args) {
      const data = JSON.parse(JSON.stringify(args));
      data.game = clean(args.game,40).toLowerCase();
      const widget = saveWidget({type:'game',data}, {replaceGame:true});
      return {displayed:true,widget_id:widget.id,game:data.game};
    }
  });

  RogerVIBTools.register({
    name:'game_engine',
    description:'Deterministic Wordle state. Use start to create a game and guess to score a word. RogerVIB also intercepts guesses typed directly in chat.',
    parameters:{type:'object',required:['game','action'],properties:{game:{type:'string',enum:['wordle']},action:{type:'string',enum:['start','guess','status','reset']},secret:{type:'string'},guess:{type:'string'}}},
    async run(args) {
      if (args.game !== 'wordle') throw new Error('only Wordle is implemented in game_engine v2');
      if (args.action === 'start') return startWordle(args.secret);
      if (args.action === 'guess') return guessWordle(args.guess);
      if (args.action === 'reset') {
        const ref = gameRef(); delete ref.games.wordle; saveGames(ref); return {game:'wordle',reset:true};
      }
      const state = activeWordle();
      if (!state) throw new Error('Wordle has not been started');
      return wordleStatePublic(state);
    }
  });

  window.addEventListener('DOMContentLoaded', () => {
    renderActiveWidgets();
    const form = document.getElementById('chatForm');
    if (form) form.addEventListener('submit', handleLocalWordle, true);

    const conversation = document.getElementById('conversation');
    if (conversation) {
      new MutationObserver(mutations => {
        const meaningful = mutations.some(m => [...m.addedNodes, ...m.removedNodes].some(node => node.nodeType !== 1 || !node.classList?.contains('rogervib-widget-row')));
        if (meaningful) setTimeout(renderActiveWidgets, 0);
      }).observe(conversation, {childList:true});
    }
  });

  window.RogerVIBWidgets = { renderActiveWidgets, saveWidget, closeWidget, startWordle, guessWordle };
})();
