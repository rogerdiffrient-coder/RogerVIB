(() => {
  if (!window.RogerVIBTools) throw new Error('RogerVIBTools must load before calculator tool');

  RogerVIBTools.register({
    name: 'calculator',
    description: 'Evaluate a basic arithmetic expression.',
    async run(args) {
      const expression = String(args?.expression || '').trim();
      if (!expression) throw new Error('missing expression');
      if (!/^[0-9+\-*/().%\s]+$/.test(expression)) throw new Error('unsupported calculator expression');
      // The input is restricted to numbers/operators/parentheses before Function is used.
      const value = Function(`"use strict"; return (${expression})`)();
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('calculator produced a non-finite result');
      return String(Number.isInteger(value) ? value : Number(value.toFixed(10)));
    }
  });
})();
