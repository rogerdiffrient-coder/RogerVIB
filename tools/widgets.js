// RogerVIB safe widget + lightweight game system.
// Ollama models can request prebuilt UI, but never supply raw HTML/JS/CSS.
(() => {
  if (!window.RogerVIBTools) throw new Error('RogerVIBTools must load before widgets');

  const WIDGET_STORAGE_KEY = 'rogervib_widgets_v1';
  const GAME_STORAGE_KEY = 'rogervib_games_v1';
  const ACTIVE_CHAT_KEY = 'rogervib_active_chat_v1';
  const PIECES = {
    K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙',
    k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟'
  };

  const clean = value => String(value ?? '').slice(0, 12000);
  const activeChatId = () => localStorage.getItem(ACTIVE_CHAT_KEY) || 'default';

  function readStore(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  function writeStore(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function saveWidget(spec) {
    const store = readStore(WIDGET_STORAGE_KEY);
    const chatId = activeChatId();
    const list = Array.isArray(store[chatId]) ? store[chatId] : [];
    const widget = {
      id: (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`),
      createdAt: Date.now(),
      ...spec
    };
    list.push(widget);
    store[chatId] = list.slice(-40);
    writeStore(WIDGET_STORAGE_KEY, store);
    queueRender();
    return widget;
  }

  function escapeHtml(text) {
    return clean(text).replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
    })[ch]);
  }

  function tinyMarkdown(text) {
    let html = escapeHtml(text);
    html = html
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^[-*] (.+)$/gm, '<div class="rv-md-li">• $1</div>')
      .replace(/\n/g, '<br>');
    return html;
  }

  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function actionButton(label, message = label) {
    const button = make('button', 'rv-widget-action', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      const input = document.getElementById('messageInput');
      const form = document.getElementById('chatForm');
      if (!input || !form) return;
      input.value = message;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
    });
    return button;
  }

  function widgetShell(kind, title) {
    const shell = make('section', `rv-widget rv-widget-${kind}`);
    const top = make('div', 'rv-widget-top');
    top.append(make('span', 'rv-widget-kicker', kind.replaceAll('_', ' ').toUpperCase()));
    if (title) top.append(make('strong', 'rv-widget-title', clean(title).slice(0, 100)));
    shell.append(top);
    return shell;
  }

  function renderCalculator(data) {
    const shell = widgetShell('calculator', data.title || 'Calculator');
    const body = make('div', 'rv-calc-body');
    body.append(make('div', 'rv-calc-expression', `${clean(data.expression).slice(0, 180)} =`));
    body.append(make('div', 'rv-calc-result', clean(data.result).slice(0, 220)));
    if (data.steps) body.append(make('div', 'rv-calc-steps', clean(data.steps).slice(0, 1000)));
    shell.append(body);
    return shell;
  }

  function renderMarkdown(data) {
    const shell = widgetShell('markdown', data.title || 'Document');
    const content = make('div', 'rv-markdown-content');
    content.innerHTML = tinyMarkdown(data.content || '');
    shell.append(content);
    return shell;
  }

  function renderWordle(shell, data) {
    const length = Math.max(3, Math.min(8, Number(data.word_length) || 5));
    const rows = Array.isArray(data.rows) ? data.rows.slice(0, 6) : [];
    const grid = make('div', 'rv-wordle-grid');
    for (let r = 0; r < 6; r++) {
      const row = rows[r] || {};
      const text = clean(row.text || '').toUpperCase().slice(0, length);
      const marks = clean(row.marks || '').toLowerCase();
      for (let c = 0; c < length; c++) {
        const tile = make('div', 'rv-wordle-tile', text[c] || '');
        const mark = marks[c];
        if (mark === 'g') tile.classList.add('correct');
        if (mark === 'y') tile.classList.add('present');
        if (mark === 'b' || mark === 'x') tile.classList.add('absent');
        grid.append(tile);
      }
    }
    shell.append(grid);
  }

  function fenBoard(fen) {
    const part = clean(fen || '').trim().split(/\s+/)[0];
    const rows = part.split('/');
    if (rows.length !== 8) return null;
    const board = [];
    for (const row of rows) {
      const out = [];
      for (const ch of row) {
        if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push('');
        else if (PIECES[ch]) out.push(ch);
      }
      if (out.length !== 8) return null;
      board.push(out);
    }
    return board;
  }

  function renderChess(shell, data) {
    let board = fenBoard(data.fen);
    if (!board && Array.isArray(data.board) && data.board.length === 8) {
      board = data.board.map(row => clean(row).slice(0, 8).padEnd(8, '.').split('').map(ch => PIECES[ch] ? ch : ''));
    }
    if (!board) board = fenBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
    const grid = make('div', 'rv-chess-board');
    board.forEach((row, r) => row.forEach((piece, c) => {
      const cell = make('div', `rv-chess-cell ${(r + c) % 2 ? 'dark' : 'light'}`, PIECES[piece] || '');
      grid.append(cell);
    }));
    shell.append(grid);
  }

  function renderGame(data) {
    const game = clean(data.game || 'text_adventure').toLowerCase();
    const shell = widgetShell(`game-${game}`, data.title || game.replaceAll('_', ' '));

    if (data.status) shell.append(make('div', 'rv-game-status', clean(data.status).slice(0, 500)));
    if (data.score !== undefined && data.score !== '') shell.append(make('div', 'rv-game-score', `Score: ${clean(data.score).slice(0, 60)}`));

    if (game === 'wordle') renderWordle(shell, data);
    else if (game === 'chess') renderChess(shell, data);
    else {
      const mainText = data.scene || data.question || data.prompt || data.pattern || '';
      if (mainText) shell.append(make('div', 'rv-game-main', clean(mainText).slice(0, 5000)));

      if (game === 'hangman') {
        if (data.wrong_guesses) shell.append(make('div', 'rv-game-meta', `Wrong guesses: ${clean(data.wrong_guesses)}`));
        if (data.lives !== undefined && data.lives !== '') shell.append(make('div', 'rv-game-meta', `Lives: ${clean(data.lives)}`));
      }
      if (game === 'twenty_questions' && data.question_number) {
        shell.append(make('div', 'rv-game-meta', `Question ${clean(data.question_number)} / 20`));
      }
      if (Array.isArray(data.inventory) && data.inventory.length) {
        const inv = make('div', 'rv-game-chips');
        data.inventory.slice(0, 12).forEach(item => inv.append(make('span', 'rv-game-chip', clean(item).slice(0, 60))));
        shell.append(inv);
      }
    }

    let actions = Array.isArray(data.actions) ? data.actions.slice(0, 8) : [];
    if (!actions.length && game === 'twenty_questions') actions = ['Yes', 'No', 'Sometimes / Maybe', 'Unknown'];
    if (actions.length) {
      const controls = make('div', 'rv-widget-actions');
      actions.forEach(action => {
        const label = typeof action === 'string' ? action : clean(action?.label || 'Choose');
        const message = typeof action === 'string' ? action : clean(action?.message || action?.label || '');
        controls.append(actionButton(label.slice(0, 80), message.slice(0, 300)));
      });
      shell.append(controls);
    }
    return shell;
  }

  function renderWidget(spec) {
    if (spec.type === 'calculator') return renderCalculator(spec.data || {});
    if (spec.type === 'markdown') return renderMarkdown(spec.data || {});
    if (spec.type === 'game') return renderGame(spec.data || {});
    return null;
  }

  let rendering = false;
  let renderTimer = null;
  function renderActiveWidgets() {
    if (rendering) return;
    const conversation = document.getElementById('conversation');
    if (!conversation) return;
    rendering = true;
    conversation.querySelectorAll('.rogervib-widget-row').forEach(node => node.remove());
    const store = readStore(WIDGET_STORAGE_KEY);
    const list = Array.isArray(store[activeChatId()]) ? store[activeChatId()] : [];
    for (const spec of list) {
      const widget = renderWidget(spec);
      if (!widget) continue;
      const row = make('div', 'rogervib-widget-row');
      row.dataset.widgetId = spec.id;
      row.append(widget);
      conversation.append(row);
    }
    rendering = false;
  }

  function queueRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderActiveWidgets, 20);
  }

  window.addEventListener('DOMContentLoaded', () => {
    const conversation = document.getElementById('conversation');
    const chatList = document.getElementById('chatList');
    if (conversation) new MutationObserver(() => { if (!rendering) queueRender(); }).observe(conversation, { childList: true });
    if (chatList) new MutationObserver(() => queueRender()).observe(chatList, { childList: true, subtree: true, attributes: true });
    queueRender();
  });

  // --- Lightweight deterministic game state for games where rules should not be improvised. ---
  function gameStore() {
    const all = readStore(GAME_STORAGE_KEY);
    const chat = activeChatId();
    if (!all[chat] || typeof all[chat] !== 'object') all[chat] = {};
    return { all, chat, games: all[chat] };
  }

  function saveGames(ref) { writeStore(GAME_STORAGE_KEY, ref.all); }

  function wordleMarks(secret, guess) {
    const marks = Array(secret.length).fill('b');
    const remaining = {};
    for (let i = 0; i < secret.length; i++) {
      if (guess[i] === secret[i]) marks[i] = 'g';
      else remaining[secret[i]] = (remaining[secret[i]] || 0) + 1;
    }
    for (let i = 0; i < secret.length; i++) {
      if (marks[i] === 'g') continue;
      if (remaining[guess[i]] > 0) { marks[i] = 'y'; remaining[guess[i]]--; }
    }
    return marks.join('');
  }

  RogerVIBTools.register({
    name: 'show_calculator_widget',
    description: 'Render a polished calculator result card inline in RogerVIB. Use after calculator when a visual math result would be nicer than plain text. This does not calculate anything; pass the verified result from calculator.',
    parameters: {
      type:'object', required:['expression','result'],
      properties:{
        expression:{type:'string', description:'The math expression already evaluated.'},
        result:{type:'string', description:'The verified calculator result.'},
        steps:{type:'string', description:'Optional brief explanation or steps.'},
        title:{type:'string', description:'Optional short title.'}
      }
    },
    async run(args) {
      const widget = saveWidget({ type:'calculator', data:{
        expression: clean(args.expression), result: clean(args.result), steps: clean(args.steps), title: clean(args.title)
      }});
      return { displayed:true, widget_id:widget.id, note:'The calculator widget is now visible to the user.' };
    }
  });

  RogerVIBTools.register({
    name: 'show_markdown_widget',
    description: 'Open a safe pre-made Markdown/document card inline. Use for longer guides, notes, structured explanations, or content that benefits from a document-like panel. Markdown is sanitized; raw HTML/JS/CSS is not supported.',
    parameters: {
      type:'object', required:['content'],
      properties:{ title:{type:'string'}, content:{type:'string', description:'Markdown-like text. Supports headings, bold, inline code, and simple bullet lines.'} }
    },
    async run(args) {
      const widget = saveWidget({ type:'markdown', data:{ title:clean(args.title), content:clean(args.content) }});
      return { displayed:true, widget_id:widget.id, note:'The Markdown widget is now visible to the user.' };
    }
  });

  RogerVIBTools.register({
    name: 'show_game_widget',
    description: 'Render an inline game panel. Supported game values: text_adventure, trivia, twenty_questions, wordle, hangman, chess, guess_number, rock_paper_scissors. Use this to PRESENT current game state, not to fake rule results. For Wordle/Hangman/Guess Number/RPS, use game_engine for real rule/state updates first. Chess is display-only until a chess-engine backend is connected. Buttons send their action back as the next user message.',
    parameters: {
      type:'object', required:['game'],
      properties:{
        game:{type:'string', enum:['text_adventure','trivia','twenty_questions','wordle','hangman','chess','guess_number','rock_paper_scissors']},
        title:{type:'string'}, status:{type:'string'}, score:{type:['string','number']},
        scene:{type:'string'}, question:{type:'string'}, prompt:{type:'string'}, pattern:{type:'string'},
        question_number:{type:['string','number']}, lives:{type:['string','number']}, wrong_guesses:{type:'string'},
        word_length:{type:'integer'}, fen:{type:'string', description:'Chess FEN. Chess widget display only.'},
        board:{type:'array', items:{type:'string'}, description:'Optional 8 chess board rows using KQRBNP/kqrbnp and dots.'},
        inventory:{type:'array', items:{type:'string'}},
        rows:{type:'array', items:{type:'object', properties:{text:{type:'string'}, marks:{type:'string', description:'For Wordle: g=correct, y=present, b=absent.'}}}},
        actions:{type:'array', items:{oneOf:[{type:'string'},{type:'object', properties:{label:{type:'string'}, message:{type:'string'}}}]}}
      }
    },
    async run(args) {
      const allowed = new Set(['text_adventure','trivia','twenty_questions','wordle','hangman','chess','guess_number','rock_paper_scissors']);
      const game = clean(args.game).toLowerCase();
      if (!allowed.has(game)) throw new Error('unsupported game widget');
      const data = JSON.parse(JSON.stringify(args));
      data.game = game;
      const widget = saveWidget({ type:'game', data });
      return { displayed:true, widget_id:widget.id, game, note:'The game widget is now visible to the user.' };
    }
  });

  RogerVIBTools.register({
    name: 'game_engine',
    description: 'Deterministic local game rules/state for Wordle, Hangman, Guess Number, and Rock Paper Scissors. Use this instead of inventing outcomes. Actions: start, guess, play, status, reset. Wordle start requires secret; Hangman start requires secret; Guess Number start accepts min/max; RPS uses play with choice. After this tool returns, present the state with show_game_widget.',
    parameters: {
      type:'object', required:['game','action'],
      properties:{
        game:{type:'string', enum:['wordle','hangman','guess_number','rock_paper_scissors']},
        action:{type:'string', enum:['start','guess','play','status','reset']},
        secret:{type:'string', description:'Secret word for Wordle/Hangman start. Do not reveal it to the user.'},
        guess:{type:'string', description:'Word/letter/number guess.'},
        choice:{type:'string', enum:['rock','paper','scissors']},
        min:{type:'integer'}, max:{type:'integer'}
      }
    },
    async run(args) {
      const game = clean(args.game).toLowerCase();
      const action = clean(args.action).toLowerCase();
      const ref = gameStore();
      if (action === 'reset') { delete ref.games[game]; saveGames(ref); return { game, reset:true }; }

      if (game === 'wordle') {
        if (action === 'start') {
          const secret = clean(args.secret).toLowerCase().replace(/[^a-z]/g,'');
          if (secret.length < 3 || secret.length > 8) throw new Error('Wordle secret must be 3-8 letters');
          ref.games.wordle = { secret, rows:[], maxGuesses:6, done:false };
        }
        const state = ref.games.wordle;
        if (!state) throw new Error('Wordle has not been started');
        if (action === 'guess') {
          if (state.done) throw new Error('Wordle game is already over');
          const guess = clean(args.guess).toLowerCase().replace(/[^a-z]/g,'');
          if (guess.length !== state.secret.length) throw new Error(`guess must be ${state.secret.length} letters`);
          const marks = wordleMarks(state.secret, guess);
          state.rows.push({ text:guess, marks });
          if (guess === state.secret) state.done = true;
          if (state.rows.length >= state.maxGuesses) state.done = true;
        }
        saveGames(ref);
        return { game:'wordle', rows:state.rows, word_length:state.secret.length, done:state.done, won:state.rows.at(-1)?.text === state.secret, guesses_left:Math.max(0, state.maxGuesses-state.rows.length), reveal_secret:state.done ? state.secret : undefined };
      }

      if (game === 'hangman') {
        if (action === 'start') {
          const secret = clean(args.secret).toLowerCase().replace(/[^a-z ]/g,'').trim();
          if (!secret) throw new Error('Hangman needs a secret word or phrase');
          ref.games.hangman = { secret, guessed:[], wrong:[], lives:6, done:false };
        }
        const state = ref.games.hangman;
        if (!state) throw new Error('Hangman has not been started');
        if (action === 'guess') {
          if (state.done) throw new Error('Hangman game is already over');
          const guess = clean(args.guess).toLowerCase().replace(/[^a-z ]/g,'').trim();
          if (!guess) throw new Error('empty guess');
          if (guess.length === 1) {
            if (!state.guessed.includes(guess) && !state.wrong.includes(guess)) {
              if (state.secret.includes(guess)) state.guessed.push(guess);
              else { state.wrong.push(guess); state.lives--; }
            }
          } else if (guess === state.secret) {
            [...new Set(state.secret.replace(/ /g,'').split(''))].forEach(ch => { if (!state.guessed.includes(ch)) state.guessed.push(ch); });
          } else { state.lives--; state.wrong.push(guess); }
        }
        const pattern = state.secret.split('').map(ch => ch === ' ' ? '  ' : (state.guessed.includes(ch) ? ch.toUpperCase() : '_')).join(' ');
        const won = [...state.secret].every(ch => ch === ' ' || state.guessed.includes(ch));
        state.done = won || state.lives <= 0;
        saveGames(ref);
        return { game:'hangman', pattern, wrong_guesses:state.wrong.join(', '), lives:state.lives, done:state.done, won, reveal_secret:state.done ? state.secret : undefined };
      }

      if (game === 'guess_number') {
        if (action === 'start') {
          let min = Number.isFinite(Number(args.min)) ? Math.floor(Number(args.min)) : 1;
          let max = Number.isFinite(Number(args.max)) ? Math.floor(Number(args.max)) : 100;
          if (max <= min) [min,max] = [1,100];
          const secret = Math.floor(Math.random() * (max-min+1)) + min;
          ref.games.guess_number = { min,max,secret,attempts:0,done:false };
        }
        const state = ref.games.guess_number;
        if (!state) throw new Error('Guess Number has not been started');
        let hint = '';
        if (action === 'guess') {
          const guess = Number(args.guess);
          if (!Number.isFinite(guess)) throw new Error('guess must be a number');
          state.attempts++;
          if (guess === state.secret) { state.done = true; hint = 'correct'; }
          else hint = guess < state.secret ? 'higher' : 'lower';
        }
        saveGames(ref);
        return { game:'guess_number', min:state.min, max:state.max, attempts:state.attempts, done:state.done, hint, reveal_secret:state.done ? state.secret : undefined };
      }

      if (game === 'rock_paper_scissors') {
        if (action !== 'play' && action !== 'status') throw new Error('RPS uses play or status');
        if (action === 'status') return { game, note:'Choose rock, paper, or scissors.' };
        const choice = clean(args.choice).toLowerCase();
        if (!['rock','paper','scissors'].includes(choice)) throw new Error('invalid RPS choice');
        const bot = ['rock','paper','scissors'][Math.floor(Math.random()*3)];
        const win = (choice === 'rock' && bot === 'scissors') || (choice === 'paper' && bot === 'rock') || (choice === 'scissors' && bot === 'paper');
        const outcome = choice === bot ? 'tie' : (win ? 'win' : 'lose');
        return { game, player:choice, opponent:bot, outcome };
      }

      throw new Error('unsupported game');
    }
  });

  window.RogerVIBWidgets = { renderActiveWidgets, saveWidget };
})();