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
        { title: 'Secondary test result', snippet: 'Geometry Dash is a rhythm platformer.', url: 'https://example.test/secondary' }
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

const manifest = require('./smarter-v06-manifest.json');
if (manifest.params !== 11170944) throw new Error(`wrong parameter count: ${manifest.params}`);
if (manifest.releaseChannel !== 'alpha') throw new Error(`wrong release channel: ${manifest.releaseChannel}`);

require('./smarter-v06-config.js');
for (let i = 0; i < manifest.parts; i++) require(`./smarter-v06-part${i}.js`);
require('./models/smarter-runtime.js');

const smarter = registry.get('smarter');
if (!smarter) throw new Error('Smarter alpha did not register');
if (global.SMARTER_V06_CONFIG.context < 512) throw new Error('Smarter context regressed');

async function ask(input, messages = []) {
  const chatMessages = [...messages, { role: 'user', text: input }];
  const output = String(await smarter.reply(input, { chat: { messages: chatMessages }, chats: [] }));
  console.log(`User: ${input}\nBot: ${output}`);
  if (!output || output === 'DECENT_FALLBACK') throw new Error(`${input}: model fell back`);
  if (/^\d{2,4}$/.test(output.trim())) throw new Error(`${input}: integer attractor detected: ${output}`);
  return output;
}

(async () => {
  toolCalls.length = 0;
  const identity = await ask('who made you');
  if (!/\broger\b/i.test(identity)) throw new Error(`creator fact missing: ${identity}`);
  if (toolCalls.length) throw new Error('identity unexpectedly used a tool');

  const france = await ask('what is the capital of france');
  if (!/paris/i.test(france)) throw new Error(`France fact failed: ${france}`);

  // Regressions reported from the live alpha should not collapse to mystery integers.
  const roger = await ask('i am roger');
  if (!/roger|hey|sup|yo|nice|cool|okay|real/i.test(roger)) throw new Error(`i am roger still looks odd: ${roger}`);

  const advice = await ask('what should i do');
  if (advice.length < 2 || /^\d+$/.test(advice.trim())) throw new Error(`advice still collapsed: ${advice}`);

  const gd = await ask('what is geometry dash');
  if (!/geometry|dash|square|cube|platform/i.test(gd)) throw new Error(`Geometry Dash answer regressed: ${gd}`);

  toolCalls.length = 0;
  const research = await ask('research geometry dash');
  if (!toolCalls.some(call => call.name === 'web_search')) throw new Error('research geometry dash did not call web_search');
  if (!research.toLowerCase().includes(MARKER) && !/geometry dash/i.test(research)) throw new Error(`research ignored tool evidence: ${research}`);

  // Feeding a previous weird integer back should not create an integer loop.
  await ask('740');

  console.log('SMARTER_ALPHA_SMOKE_TEST_OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
