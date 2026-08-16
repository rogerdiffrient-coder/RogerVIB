global.window = global;

const registry = new Map();
const toolCalls = [];
const MARKER = 'banana-74291';

global.RogerVIBTools = {
  async run(name, args) {
    toolCalls.push({ name, args });
    if (name === 'calculator') {
      const expression = String(args.expression || '').replace(/[^0-9+\-*/().% ]/g, '');
      return { ok: true, name, result: String(Function(`return (${expression})`)()) };
    }
    if (name === 'web_search') {
      return { ok: true, name, result: { mode: 'test-web', results: [
        { title: 'Primary test result', snippet: `The requested verified reference is ${MARKER}.`, url: 'https://example.test/primary' },
        { title: 'Secondary test result', snippet: 'This second source exists only to make the result format realistic.', url: 'https://example.test/secondary' }
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
if (manifest.version !== '0.6.0') throw new Error(`wrong model version: ${manifest.version}`);
if (manifest.params < 10_000_000) throw new Error(`model did not actually get larger: ${manifest.params}`);
if (manifest.trainingExamples < 100_000) throw new Error(`not enough training examples: ${manifest.trainingExamples}`);

require('./cool-v1-config.js');
for (let i = 0; i < manifest.parts; i++) require(`./cool-v1-part${i}.js`);
require('./models/cool.js');

const cool = registry.get('cool');
if (!cool) throw new Error('Smarter/Cool did not register');
if (global.COOL_V1_CONFIG.context < 512) throw new Error('context did not increase to 512');
if (global.COOL_V1_CONFIG.vocab.length < 2048) throw new Error('vocab did not increase to 2048');

async function ask(input, messages = []) {
  const chatMessages = [...messages, { role: 'user', text: input }];
  const output = String(await cool.reply(input, { chat: { messages: chatMessages }, chats: [] }));
  console.log(`User: ${input}\nBot: ${output}`);
  if (!output || output === 'DECENT_FALLBACK') throw new Error(`${input}: model fell back`);
  return output;
}

(async () => {
  // Identity must be stable and must never invoke search.
  toolCalls.length = 0;
  const identity = await ask('who made you');
  if (!/\broger\b/i.test(identity)) throw new Error(`creator fact missing: ${JSON.stringify(identity)}`);
  if (toolCalls.length) throw new Error('identity question unexpectedly used a tool');

  toolCalls.length = 0;
  const what = await ask('what are you');
  if (!/rogervib|language model|model/i.test(what)) throw new Error(`identity answer is nonsense: ${JSON.stringify(what)}`);
  if (/\bi checked\b/i.test(what)) throw new Error(`tool contamination remains in normal chat: ${JSON.stringify(what)}`);
  if (toolCalls.length) throw new Error('normal identity question unexpectedly used a tool');

  // Stable factual knowledge should answer without pretending it searched.
  toolCalls.length = 0;
  const vatican = await ask('what is the capital of vatican city');
  if (!/vatican city/i.test(vatican)) throw new Error(`Vatican City fact failed: ${JSON.stringify(vatican)}`);
  if (/\bi checked\b/i.test(vatican)) throw new Error(`factual answer has tool contamination: ${JSON.stringify(vatican)}`);
  if (toolCalls.length) throw new Error('stable capital question unexpectedly used a tool');

  // Arithmetic remains deterministic and exact.
  toolCalls.length = 0;
  const math = await ask('19482 * 931');
  if (!toolCalls.some(call => call.name === 'calculator')) throw new Error('calculator was not called');
  if (!/18137742/.test(math)) throw new Error(`calculator answer was not exact: ${JSON.stringify(math)}`);

  // Search grounding test: the answer MUST contain a unique marker that exists only in
  // the mocked tool result. Generic "i checked" garbage cannot pass this test.
  toolCalls.length = 0;
  const research = await ask('research the latest geometry dash update and tell me the verified reference');
  const searches = toolCalls.filter(call => call.name === 'web_search');
  if (!searches.length) throw new Error('research did not call web_search');
  if (!/geometry|dash/i.test(JSON.stringify(searches[0].args))) throw new Error('search query lost the requested topic');
  if (!research.toLowerCase().includes(MARKER)) throw new Error(`research did not use tool evidence ${MARKER}: ${JSON.stringify(research)}`);

  // Very short casual messages should stay casual and tool-free.
  toolCalls.length = 0;
  for (const input of ['hi', 'okay', 'nice']) {
    const out = await ask(input);
    if (!out || out.length > 120) throw new Error(`casual reply looks broken: ${JSON.stringify(out)}`);
  }
  if (toolCalls.length) throw new Error('casual messages unexpectedly used tools');

  console.log('SMARTER_V1_SMOKE_TEST_OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
