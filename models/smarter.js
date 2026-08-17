// RogerVIB v0.6 Smarter Alpha lazy loader.
(() => {
  let loadPromise = null;
  const version = '0.6.0-alpha.1';
  const partUrls = [
    'smarter-v06-part0.js?v=0.6.0-alpha.1',
      'smarter-v06-part1.js?v=0.6.0-alpha.1',
      'smarter-v06-part2.js?v=0.6.0-alpha.1',
      'smarter-v06-part3.js?v=0.6.0-alpha.1',
      'smarter-v06-part4.js?v=0.6.0-alpha.1',
      'smarter-v06-part5.js?v=0.6.0-alpha.1',
      'smarter-v06-part6.js?v=0.6.0-alpha.1',
      'smarter-v06-part7.js?v=0.6.0-alpha.1',
      'smarter-v06-part8.js?v=0.6.0-alpha.1',
      'smarter-v06-part9.js?v=0.6.0-alpha.1',
      'smarter-v06-part10.js?v=0.6.0-alpha.1',
      'smarter-v06-part11.js?v=0.6.0-alpha.1',
      'smarter-v06-part12.js?v=0.6.0-alpha.1',
      'smarter-v06-part13.js?v=0.6.0-alpha.1',
      'smarter-v06-part14.js?v=0.6.0-alpha.1',
      'smarter-v06-part15.js?v=0.6.0-alpha.1',
      'smarter-v06-part16.js?v=0.6.0-alpha.1',
      'smarter-v06-part17.js?v=0.6.0-alpha.1',
      'smarter-v06-part18.js?v=0.6.0-alpha.1',
      'smarter-v06-part19.js?v=0.6.0-alpha.1',
      'smarter-v06-part20.js?v=0.6.0-alpha.1',
      'smarter-v06-part21.js?v=0.6.0-alpha.1',
      'smarter-v06-part22.js?v=0.6.0-alpha.1',
      'smarter-v06-part23.js?v=0.6.0-alpha.1',
      'smarter-v06-part24.js?v=0.6.0-alpha.1',
      'smarter-v06-part25.js?v=0.6.0-alpha.1',
      'smarter-v06-part26.js?v=0.6.0-alpha.1',
      'smarter-v06-part27.js?v=0.6.0-alpha.1',
      'smarter-v06-part28.js?v=0.6.0-alpha.1',
      'smarter-v06-part29.js?v=0.6.0-alpha.1',
      'smarter-v06-part30.js?v=0.6.0-alpha.1',
      'smarter-v06-part31.js?v=0.6.0-alpha.1',
      'smarter-v06-part32.js?v=0.6.0-alpha.1',
      'smarter-v06-part33.js?v=0.6.0-alpha.1',
      'smarter-v06-part34.js?v=0.6.0-alpha.1',
      'smarter-v06-part35.js?v=0.6.0-alpha.1',
      'smarter-v06-part36.js?v=0.6.0-alpha.1',
      'smarter-v06-part37.js?v=0.6.0-alpha.1',
      'smarter-v06-part38.js?v=0.6.0-alpha.1',
      'smarter-v06-part39.js?v=0.6.0-alpha.1',
      'smarter-v06-part40.js?v=0.6.0-alpha.1',
      'smarter-v06-part41.js?v=0.6.0-alpha.1',
      'smarter-v06-part42.js?v=0.6.0-alpha.1',
      'smarter-v06-part43.js?v=0.6.0-alpha.1',
      'smarter-v06-part44.js?v=0.6.0-alpha.1',
      'smarter-v06-part45.js?v=0.6.0-alpha.1',
      'smarter-v06-part46.js?v=0.6.0-alpha.1',
      'smarter-v06-part47.js?v=0.6.0-alpha.1',
      'smarter-v06-part48.js?v=0.6.0-alpha.1',
      'smarter-v06-part49.js?v=0.6.0-alpha.1',
      'smarter-v06-part50.js?v=0.6.0-alpha.1',
      'smarter-v06-part51.js?v=0.6.0-alpha.1',
      'smarter-v06-part52.js?v=0.6.0-alpha.1',
      'smarter-v06-part53.js?v=0.6.0-alpha.1',
      'smarter-v06-part54.js?v=0.6.0-alpha.1',
      'smarter-v06-part55.js?v=0.6.0-alpha.1',
      'smarter-v06-part56.js?v=0.6.0-alpha.1',
      'smarter-v06-part57.js?v=0.6.0-alpha.1',
      'smarter-v06-part58.js?v=0.6.0-alpha.1',
      'smarter-v06-part59.js?v=0.6.0-alpha.1',
      'smarter-v06-part60.js?v=0.6.0-alpha.1',
      'smarter-v06-part61.js?v=0.6.0-alpha.1',
      'smarter-v06-part62.js?v=0.6.0-alpha.1',
      'smarter-v06-part63.js?v=0.6.0-alpha.1',
      'smarter-v06-part64.js?v=0.6.0-alpha.1',
      'smarter-v06-part65.js?v=0.6.0-alpha.1',
      'smarter-v06-part66.js?v=0.6.0-alpha.1',
      'smarter-v06-part67.js?v=0.6.0-alpha.1',
      'smarter-v06-part68.js?v=0.6.0-alpha.1',
      'smarter-v06-part69.js?v=0.6.0-alpha.1',
      'smarter-v06-part70.js?v=0.6.0-alpha.1',
      'smarter-v06-part71.js?v=0.6.0-alpha.1',
      'smarter-v06-part72.js?v=0.6.0-alpha.1',
      'smarter-v06-part73.js?v=0.6.0-alpha.1',
      'smarter-v06-part74.js?v=0.6.0-alpha.1',
      'smarter-v06-part75.js?v=0.6.0-alpha.1'
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(script);
    });
  }

  async function loadRealModel() {
    if (!loadPromise) loadPromise = (async () => {
      await loadScript('smarter-v06-config.js?v=' + version);
      const batchSize = 8;
      for (let i = 0; i < partUrls.length; i += batchSize) {
        await Promise.all(partUrls.slice(i, i + batchSize).map(loadScript));
      }
      await loadScript('models/smarter-runtime.js?v=' + version);
      const model = RogerVIB.getModel('smarter');
      if (!model || model === proxy) throw new Error('Smarter runtime did not register');
      return model;
    })();
    return loadPromise;
  }

  const proxy = {
    id: 'smarter',
    name: 'Smarter',
    order: 60,
    alpha: true,
    params: 11170944,
    context: 512,
    status: 'alpha',
    knownIssues: 'experimental; first reply loads about 11 MB of model weights',
    description: 'RogerVIB v0.6 Smarter Alpha — 11,170,944 parameters, 10 layers, 512-token context, and grounded tools.',
    async reply(input, context) {
      try {
        const model = await loadRealModel();
        return await model.reply(input, context);
      } catch (error) {
        console.error('Smarter alpha failed to load:', error);
        return 'smarter alpha failed to load. incredible.';
      }
    }
  };
  RogerVIB.registerModel(proxy);
})();
