global.window = global;

const registry = new Map();
const toolCalls = [];
global.RogerVIBTools = {
  async run(name, args) {
    toolCalls.push({ name, args });
    if (name === 'calculator') {
      const expression = String(args.expression || '').replace(/[^0-9+\-*/().% ]/g, '');
      return { ok: true, name, result: String(Function(`return (${expression})`)()) };
    }
    if (name === 'web_search') {
      return { ok: true, name, result: { mode: 'test-web', results: [
        { title: 'Official Geometry Dash update notes', snippet: 'A current primary-source-style result describing a recent Geometry Dash update.', url: 'https://example.test/gd-official' },
        { title: 'Geometry Dash follow-up notes', snippet: 'A second dated result with more details about recent changes.', url: 'https://example.test/gd-notes' }
      ] } };
    }
    return { ok: false, name, error: 'unknown test tool' };
  }
};

global.RogerVIB = {
  models: registry,
  registerModel(model) { registry.set(model.id, model); },
  getModel(id) {
    if (registry.has(id)) return registry.get(id);
    if (id === 'decent') return { id: 'decent', async reply() { return 'DECENT_FALLBACK'; } };
    return null;
  },
  normalize(text) { return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); },
  random(list) { return list[Math.floor(Math.random() * list.length)]; }
};

const manifest = require('./cool-v1-manifest.json');
require('./cool-v1-config.js');
for (let i = 0; i < manifest.parts; i++) require(`./cool-v1-part${i}.js`);
require('./models/cool.js');

const cool = registry.get('cool');
if (!cool) throw new Error('Cool did not register');

const messages = [];
async function chat(input) {
  messages.push({ role: 'user', text: input });
  const output = String(await cool.reply(input, { chat: { messages }, chats: [] }));
  console.log(`User: ${input}\nBot: ${output}`);
  if (!output || output === 'DECENT_FALLBACK') throw new Error(`${input}: Cool fell back instead of answering`);
  messages.push({ role: 'bot', text: output });
  return output;
}

(async () => {
  // Casual multi-turn conversation: it should remain responsive instead of collapsing immediately.
  const casualInputs = ['hi', 'hows it going', 'what do you think about chatgpt', 'okay', 'i beat a geometry dash level'];
  const casualOutputs = [];
  for (const input of casualInputs) casualOutputs.push(await chat(input));

  if (!/\b(sup|yo|hello)\b/i.test(casualOutputs[0])) throw new Error(`greeting looked wrong: ${JSON.stringify(casualOutputs[0])}`);
  if (casualOutputs.some(text => text.length > 320)) throw new Error('casual response was suspiciously long');
  const lastThree = casualOutputs.slice(-3).map(x => x.toLowerCase());
  if (new Set(lastThree).size === 1) throw new Error(`casual conversation collapsed into a repeated response: ${lastThree[0]}`);

  // Exact arithmetic must use the calculator and preserve the exact result.
  toolCalls.length = 0;
  const math = await chat('19482 * 931');
  if (!toolCalls.some(call => call.name === 'calculator')) throw new Error('calculator tool was not called');
  if (!/18137742/.test(math)) throw new Error(`calculator answer was not exact: ${JSON.stringify(math)}`);

  // Geometry Dash research: must actually search, then produce a non-empty answer from the tool context.
  toolCalls.length = 0;
  const research = await chat('research the latest Geometry Dash update and summarize what changed');
  const searches = toolCalls.filter(call => call.name === 'web_search');
  if (!searches.length) throw new Error('Geometry Dash research did not call web_search');
  if (!/geometry|dash/i.test(JSON.stringify(searches[0].args))) throw new Error('web search query lost the Geometry Dash topic');
  if (research.length < 3) throw new Error('Geometry Dash research answer was empty/useless');

  console.log('COOL_OVERNIGHT_SMOKE_TEST_OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
