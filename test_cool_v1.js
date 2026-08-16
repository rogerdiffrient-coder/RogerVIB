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
        { title: 'Geometry Dash update', snippet: 'A current search result about the latest Geometry Dash update.', url: 'https://example.test/gd' }
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

async function ask(input) {
  const output = String(await cool.reply(input, { chat: { messages: [{ role: 'user', text: input }] }, chats: [] }));
  console.log(`${input} => ${output}`);
  if (!output || output === 'DECENT_FALLBACK') throw new Error(`${input}: Cool fell back instead of answering`);
  return output;
}

(async () => {
  const hello = await ask('hello');
  if (!/\b(sup|yo|hello)\b/i.test(hello)) throw new Error(`hello: suspicious output ${JSON.stringify(hello)}`);

  const identity = await ask('who are you');
  if (!/rogervib/i.test(identity)) throw new Error(`identity: suspicious output ${JSON.stringify(identity)}`);

  toolCalls.length = 0;
  const math = await ask('19482 * 931');
  if (!toolCalls.some(call => call.name === 'calculator')) throw new Error('calculator tool was not called');
  if (!/18107742/.test(math)) throw new Error(`calculator answer did not use result: ${JSON.stringify(math)}`);

  toolCalls.length = 0;
  await ask('search for the latest geometry dash update');
  if (!toolCalls.some(call => call.name === 'web_search')) throw new Error('web_search tool was not called');

  console.log('COOL_V1_SMOKE_TEST_OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
