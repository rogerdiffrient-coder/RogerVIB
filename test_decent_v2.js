global.window = global;

const registry = new Map();
global.RogerVIB = {
  models: registry,
  registerModel(model) { registry.set(model.id, model); },
  getModel(id) {
    if (registry.has(id)) return registry.get(id);
    if (id === 'brah') return { id: 'brah', async reply() { return 'BRAH_FALLBACK'; } };
    return null;
  },
  simpleMath() { return null; },
  normalize(text) { return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); },
  random(list) { return list[Math.floor(Math.random() * list.length)]; }
};

require('./decent-v2-config.js');
for (let i = 0; i < 12; i++) require(`./decent-v2-part${i}.js`);
require('./models/decent.js');

const decent = registry.get('decent');
if (!decent) throw new Error('Decent did not register');

const tests = [
  ['hello', /^(yo|sup|hello)$/i],
  ['hows it going', /(vibing|good)/i],
  ['who are you', /rogervib/i],
  ['my code is broken', /error message/i],
  ['capital of usa', /washington/i],
  ['you are dumb', /correct/i]
];

(async () => {
  for (const [input, expected] of tests) {
    const output = String(await decent.reply(input, { chat: { messages: [] }, chats: [] }));
    console.log(`${input} => ${output}`);
    if (output === 'BRAH_FALLBACK') throw new Error(`${input}: fell back to Brah`);
    if (!expected.test(output)) throw new Error(`${input}: unexpected output ${JSON.stringify(output)}`);
  }
  console.log('DECENT_V2_SMOKE_TEST_OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
