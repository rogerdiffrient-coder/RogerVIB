(() => {
  if (!window.RogerVIBTools) throw new Error('RogerVIBTools must load before calculator tool');

  RogerVIBTools.register({
    name: 'calculator',
    description: 'Calculate arithmetic exactly. Use this instead of doing arithmetic mentally when the user asks for a calculation or when precise math is needed. RogerVIB automatically shows the result in a calculator widget, so do not call a second calculator display tool unless the user specifically asks for another panel.',
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
      const result = String(Number.isInteger(value) ? value : Number(value.toFixed(10)));

      // Visual results are owned by RogerVIB, not left up to the model to remember.
      // Anchor the widget at creation time so repeated calculations cannot lose
      // their card while the generic placement layer is still settling.
      try {
        if (window.RogerVIBWidgets?.saveWidget) {
          const currentAnchor = window.RogerVIBCurrentToolAnchor;
          window.RogerVIBWidgets.saveWidget({
            type: 'calculator',
            anchorBotIndex: Number.isInteger(currentAnchor?.botIndex) ? currentAnchor.botIndex : undefined,
            data: { expression, result, title: 'Calculator' }
          });
          requestAnimationFrame(() => window.RogerVIBPlaceToolUI?.());
        }
      } catch (error) {
        console.warn('Calculator result worked, but its widget could not be shown:', error);
      }

      return result;
    }
  });
})();
