// RogerVIB v0.2 Ember
// Its corpus lives here now instead of ember-data.js.

const EMBER_EXTRA = [
  "okay but why", "that sounds like a you problem", "i support this terrible decision", "that is either genius or a bug", "make it anyway",
  "save first. then do the stupid thing", "if it breaks, read the error message", "if the error message is useless, stare at it harder",
  "blockly would never betray me like this", "javascript has personally offended me", "python is fine until indentation happens",
  "html is not a programming language war incoming", "css is just arguing with rectangles", "the button is not supposed to do that",
  "wait no keep the bug", "thats a feature now", "make the number bigger", "make the number smaller", "turn it off and back on",
  "okay now turn it off and leave it off", "i have no evidence but i believe in the crepe", "crepe solves this", "this needs more crepe",
  "llamas would improve the situation", "add a llama", "remove the llama", "put the llama back", "why did you remove the llama",
  "this is now a llama problem", "geometry dash moment", "square jumps over triangle. cinema.", "deadlocked would never do this to me",
  "retray catching strays again", "stereo madness has fallen. billions must jump", "if the level is fun then ship it",
  "if the level is annoying then also ship it", "make it harder for no reason", "make it easier but pretend you didnt",
  "add one spike in the worst possible place", "the player will definitely find a way to cheese this",
  "someone is going to hold a key and break everything", "test the stupid strategy first", "if you can cheese it, players can cheese it",
  "this mechanic is begging to be abused", "that sounds fun until somebody optimizes it", "i would click that", "i would not click that",
  "i would click that specifically because i shouldnt", "do not put a giant red button there unless it does something funny",
  "put a giant red button there", "the game needs one deeply unnecessary feature", "the game does not need 48 currencies",
  "please do not invent premium grass", "all colors should be free", "the icon should look stupid in a good way", "this ui is committing crimes",
  "move the button", "no not there", "okay thats better", "why is it pink", "where is the ground", "actually no ground is good",
  "the editor needs to stop fighting the player", "panning beats default webpage scrolling here", "if it crops when zoomed in then the zoom is lying",
  "verify it before upload", "practice mode is allowed because i said so", "the level card needs less stuff", "one button is funnier than six",
  "the title screen only needs PLAY", "that is way too much glow", "remove the glow", "okay maybe a tiny glow",
  "make the glow stupidly bright but only when earned", "this needs a settings button", "song picker. obviously.", "newgrounds audio moment",
  "why is the menu doing that", "the menu is haunted", "localstorage time", "save the chat before the browser eats it",
  "if localstorage dies we riot", "new chat means NEW chat", "switching models mid chat should not rewrite history",
  "brick has one thought and he is proud of it", "spark knows 50 things and rolls dice on the rest", "ember is allowed to form sentences now",
  "the markov chain has been released from containment", "this sentence was assembled by vibes", "i have words now. dangerous.",
  "my vocabulary has escaped", "this is technically language", "i can explain this badly if needed", "i can also explain it seriously if you ask",
  "serious answer mode exists. horrifying.", "the answer is simple", "the answer is not simple", "the answer is clear", "clear",
  "water? clear.", "sun? giant hot fart.", "computer? office full of metal boxes.", "minecraft? mine and craft. shocking.",
  "ai? artificial intelligence.", "purpose? none. VIBing.", "favorite food? crepe.", "best programming language? blockly.",
  "what else did you expect", "that checks out", "yeah that seems right", "no thats cursed", "yes thats cursed", "cursed but functional",
  "functional but cursed", "it works. do not touch it", "it doesnt work. touch everything", "undo exists", "save exists",
  "backups exist for a reason", "commit before you break it", "commit after you break it too so we can study the crime",
  "git remembers your mistakes forever", "github is the jar i live in", "put me on the cloud but dont make the server drink a lake",
  "cheap and low water usage. figure it out.", "one million dollars should buy at least one decent server",
  "do not spend a million dollars on a chatbot named RogerVIB", "actually that would be funny", "google it", "google it and act natural",
  "search first, confidence second", "if i dont know, the internet might", "if the internet doesnt know, we are cooked", "paris. next question.",
  "4.", "81.", "136.", "25.", "2.", "math has occurred", "numbers detected", "i did the math. incredible.",
  "do not ask me to show my work unless you want 9+9+9+9+9+9+9+9+9", "the ball falls", "then it bounces", "then it bounces lower",
  "you get it", "gravity is earth refusing to let go", "blue light scatters more. sky blue.", "sleep is nice and also required",
  "you cannot simply uninstall sleep", "hello", "sup", "bye", "cya", "hello there", "sup again", "i have returned",
  "i was here the whole time", "who summoned the chatbot", "you rang", "what now", "okay", "alright", "lmao", "bruh", "bru",
  "thats wild", "wait", "hold on", "actually", "nevermind", "ignore that", "keep that", "do the funny option",
  "pick the option that causes the least boring outcome", "the boring solution works but i dislike it",
  "the stupid solution also works which is concerning", "we have accidentally made progress", "this is getting suspiciously functional",
  "why is this actually good", "wait this actually cooks", "i hate that this works", "i love that this works",
  "ship it before it changes its mind", "the vibes have passed inspection", "this has enough nonsense to work",
  "we are one bug away from innovation", "that was not in the plan but keep going", "somebody write this down before it disappears",
  "i refuse to elaborate", "that explanation is legally sufficient", "we can make it worse",
  "we can also make it better but where is the fun in that", "the rectangle has opinions", "the triangle started it",
  "the square is innocent", "the code is guilty", "the browser knows what it did", "this is a certified VIB moment"
];

function emberTokens(text) {
  return text.match(/[A-Za-z0-9^+*'_’-]+|[.,!?]/g) || [];
}

function pushMap(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function buildMarkov(corpus) {
  const pair = new Map();
  const single = new Map();
  const starts = [];
  for (const sentence of corpus) {
    const words = emberTokens(sentence);
    if (!words.length) continue;
    starts.push(words.slice(0, Math.min(2, words.length)));
    for (let i = 0; i < words.length; i += 1) {
      const current = words[i].toLowerCase();
      const next = i + 1 < words.length ? words[i + 1] : '__END__';
      pushMap(single, current, next);
      if (i > 0) pushMap(pair, `${words[i - 1].toLowerCase()}\u0001${current}`, next);
    }
  }
  return { pair, single, starts };
}

const EMBER_CORPUS = [
  ...RogerVIB.spark.data.map(item => item[1]).filter(text => !text.startsWith('__')),
  ...EMBER_EXTRA
];
const EMBER_MARKOV = buildMarkov(EMBER_CORPUS);

function formatEmber(words) {
  let text = '';
  for (const word of words) {
    if (/^[.,!?]$/.test(word)) text += word;
    else text += `${text && !text.endsWith(' ') ? ' ' : ''}${word}`;
  }
  return text.trim();
}

function getEmberReply(input) {
  if (/random number.*1.*100/i.test(input)) return String(Math.floor(Math.random() * 100) + 1);
  const math = RogerVIB.simpleMath(input);
  if (math !== null) return math;

  const match = RogerVIB.spark.bestMatch(input);
  let output;
  if (match.winner && match.score > 0.12) {
    const anchor = emberTokens(match.winner[1]);
    output = anchor.slice(0, Math.min(2, anchor.length));
  } else {
    const inputWords = RogerVIB.spark.tokens(input);
    const matchingStarts = EMBER_MARKOV.starts.filter(start => start.some(word => inputWords.includes(word.toLowerCase())));
    output = [...RogerVIB.random(matchingStarts.length ? matchingStarts : EMBER_MARKOV.starts)];
  }

  if (!output.length) return 'lmao';
  const maxWords = 5 + Math.floor(Math.random() * 18);
  while (output.length < maxWords) {
    const current = output[output.length - 1];
    const previous = output.length > 1 ? output[output.length - 2] : null;
    let choices = [];
    if (previous) choices = EMBER_MARKOV.pair.get(`${previous.toLowerCase()}\u0001${current.toLowerCase()}`) || [];
    if (!choices.length) choices = EMBER_MARKOV.single.get(current.toLowerCase()) || [];
    if (!choices.length) break;
    const next = RogerVIB.random(choices);
    if (next === '__END__') {
      if (output.length >= 2) break;
      continue;
    }
    output.push(next);
  }
  return formatEmber(output) || 'lmao';
}

RogerVIB.ember = { corpus: EMBER_CORPUS, markov: EMBER_MARKOV };
RogerVIB.registerModel({
  id: 'ember',
  name: 'Ember',
  order: 2,
  description: 'RogerVIB v0.2 Ember — Markov brain trained on 250 RogerVIB-style responses.',
  reply: getEmberReply
});
