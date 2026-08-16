from pathlib import Path

cool_path = Path('models/cool.js')
cool = cool_path.read_text()
needle = "    const result = await tools.run(tool.name, args);\n\n    // Search text is useful, but it must not evict the whole conversation or leave\n"
replacement = "    const result = await tools.run(tool.name, args);\n\n    // Calculator output is already exact. Do not let the tiny language model rewrite it.\n    if (tool.name === 'calculator' && result?.ok) return String(result.result);\n\n    // Search text is useful, but it must not evict the whole conversation or leave\n"
if needle not in cool:
    raise SystemExit('Could not find Cool tool-result insertion point')
cool_path.write_text(cool.replace(needle, replacement, 1))

test_path = Path('test_cool_v1.js')
test = test_path.read_text()
if '18107742' not in test:
    raise SystemExit('Could not find old calculator expectation')
test_path.write_text(test.replace('18107742', '18137742', 1))

print('Patched Cool to return exact calculator results and corrected the CI arithmetic expectation.')
