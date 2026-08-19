(() => {
  if (!window.RogerVIBTools) throw new Error('RogerVIBTools must load before calculator tool');

  RogerVIBTools.register({
    name: 'calculator',
    description: 'Calculate arithmetic exactly. Use this instead of doing arithmetic mentally when the user asks for a calculation or when precise math is needed.',
    parameters: {
      type: 'object',
      required: ['expression'],
      properties: {
        expression: {
          type: 'string',
          description: 'Arithmetic expression using numbers, parentheses, +, -, *, /, and %; for example (48+52)*2.'
        }
      }
    },
    async run(args) {
      const expression = String(args?.expression || '').trim();
      if (!expression) throw new Error('missing expression');
      if (!/^[0-9+\-*/().%\s]+$/.test(expression)) throw new Error('unsupported calculator expression');
      const value = Function(`"use strict"; return (${expression})`)();
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('calculator produced a non-finite result');
      return String(Number.isInteger(value) ? value : Number(value.toFixed(10)));
    }
  });
})();
