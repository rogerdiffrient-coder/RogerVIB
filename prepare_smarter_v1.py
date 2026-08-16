from pathlib import Path

path = Path('models/cool.js')
text = path.read_text()

text = text.replace('// RogerVIB v0.5 Cool\n// ~7M-parameter, 8-layer subword decoder-only Transformer with RoPE + tool use.',
                    '// RogerVIB v0.6 Smarter\n// Larger browser-side decoder-only Transformer with RoPE + grounded tool use.')

old = """    const answer = decode(generateIds(prompt, answerReserve));
    if (tool.name === 'web_search' && (!answer || answer.length < 8 || !/[a-z]/i.test(answer))) return formatToolResult(result);
    return answer;
"""
new = """    const answer = decode(generateIds(prompt, answerReserve));
    if (tool.name === 'web_search') {
      const formatted = formatToolResult(result);
      // Do not accept a fluent-but-unrelated summary. The answer must share meaningful
      // evidence words with the actual search result; otherwise return the evidence itself.
      const stop = new Set(['about', 'after', 'again', 'being', 'could', 'current', 'found', 'latest', 'newest', 'result', 'results', 'search', 'source', 'sources', 'there', 'these', 'this', 'those', 'update', 'using', 'with']);
      const evidence = new Set((formatted.toLowerCase().match(/[a-z0-9]{5,}/g) || []).filter(word => !stop.has(word)));
      const answerWords = new Set((answer.toLowerCase().match(/[a-z0-9]{5,}/g) || []).filter(word => !stop.has(word)));
      let overlap = 0;
      for (const word of answerWords) if (evidence.has(word)) overlap++;
      if (!answer || answer.length < 8 || !/[a-z]/i.test(answer) || overlap < 1) return formatted;
    }
    return answer;
"""
if old not in text:
    raise SystemExit('Could not find search answer fallback anchor in models/cool.js')
text = text.replace(old, new, 1)

old_desc = "description: `RogerVIB v0.5 Cool — ${M.params.toLocaleString()}-parameter, ${M.layers}-layer Transformer with tools, RoPE, and ${M.context}-token context.`,"
new_desc = "description: `RogerVIB v${M.version || '0.6.0'} Smarter — ${M.params.toLocaleString()}-parameter, ${M.layers}-layer Transformer with grounded tools, RoPE, and ${M.context}-token context.`,"
if old_desc not in text:
    raise SystemExit('Could not find model description anchor in models/cool.js')
text = text.replace(old_desc, new_desc, 1)

path.write_text(text)
print('Prepared v0.6 Smarter runtime with evidence-grounding fallback and updated model description.')
