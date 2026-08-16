from pathlib import Path

cool_path = Path('models/cool.js')
cool = cool_path.read_text()

# 1) Exact calculator output should bypass neural rewriting.
needle = "    const result = await tools.run(tool.name, args);\n\n    // Search text is useful, but it must not evict the whole conversation or leave\n"
replacement = "    const result = await tools.run(tool.name, args);\n\n    // Calculator output is already exact. Do not let the language model rewrite it.\n    if (tool.name === 'calculator' && result?.ok) return String(result.result);\n\n    // Search text is useful, but it must not evict the whole conversation or leave\n"
if needle in cool:
    cool = cool.replace(needle, replacement, 1)

# 2) For obvious arithmetic, always use the original user expression rather than a model-generated tool query.
old = "        if (!tool && obviousMath(input)) tool = { name: 'calculator', token: TOOL_CALC, query: input.replace(/^(what(?:'s| is)?|calculate)\\s+/i, '').replace(/\\?$/, ''), ids: [TOOL_CALC, ...encode(input), TOOL_END] };"
new = "        if (obviousMath(input)) tool = { name: 'calculator', token: TOOL_CALC, query: input.replace(/^(what(?:'s| is)?|calculate)\\s+/i, '').replace(/\\?$/, ''), ids: [TOOL_CALC, ...encode(input), TOOL_END] };"
if old in cool:
    cool = cool.replace(old, new, 1)

cool_path.write_text(cool)

# Correct the old smoke-test arithmetic expectation if it is still present.
test_path = Path('test_cool_v1.js')
test = test_path.read_text().replace('18107742', '18137742')
test_path.write_text(test)

print('Prepared Cool runtime: exact calculator results + original-expression math routing.')
