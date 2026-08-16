import json, re
from pathlib import Path

VERSION = '0.5.0'
manifest = json.loads(Path('cool-v1-manifest.json').read_text())
parts = int(manifest['parts'])

loader = [
    "// Generated loader for RogerVIB v0.5 Cool.\n",
    "// document.write is intentional here: model weight scripts must finish before models/cool.js executes.\n",
    f"document.write('<script src=\"cool-v1-config.js?v={VERSION}\"><\\/script>');\n",
]
for i in range(parts):
    loader.append(f"document.write('<script src=\"cool-v1-part{i}.js?v={VERSION}\"><\\/script>');\n")
Path('cool-v1-loader.js').write_text(''.join(loader))

# Make the newest model the default.
main_path = Path('main.js')
main = main_path.read_text()
main = re.sub(r"const DEFAULT_MODEL = '[^']+';", "const DEFAULT_MODEL = 'cool';", main, count=1)
main_path.write_text(main)

index_path = Path('index.html')
index = index_path.read_text()
# Bump existing cache query strings.
index = re.sub(r'v=0\.4\.5', f'v={VERSION}', index)
index = re.sub(r'v=0\.4\.\d+', f'v={VERSION}', index)

# Remove any previous Cool/tool wiring before inserting the canonical block.
index = re.sub(r'\n\s*<!-- RogerVIB v0\.5 Cool tools \+ weights -->.*?<!-- End Cool v0\.5 -->\s*', '\n', index, flags=re.S)
index = re.sub(r'\n\s*<script src="models/cool\.js[^>]*></script>\s*', '\n', index)

cool_block = f'''\n  <!-- RogerVIB v0.5 Cool tools + weights -->
  <script src="tools/tools.js?v={VERSION}"></script>
  <script src="tools/calculator.js?v={VERSION}"></script>
  <script src="tools/web-search.js?v={VERSION}"></script>
  <script src="cool-v1-loader.js?v={VERSION}"></script>
  <!-- End Cool v0.5 -->
'''
marker = '  <!-- Brah\'s trained intent weights remain for the older model/fallback. -->'
if marker not in index:
    marker = '  <!-- Brah keeps its compiled learned intent weights separate too. -->'
if marker not in index:
    raise SystemExit('Could not find Brah model marker in index.html')
index = index.replace(marker, cool_block + '\n' + marker, 1)

# Load Cool after Decent so its larger order value places it first in the picker.
decent_line = f'  <script src="models/decent.js?v={VERSION}"></script>'
if decent_line not in index:
    # Normalize whatever cache version is currently there.
    index = re.sub(r'<script src="models/decent\.js\?v=[^"]+"></script>', decent_line.strip(), index, count=1)
if 'models/cool.js' not in index:
    index = index.replace(decent_line, decent_line + f'\n  <script src="models/cool.js?v={VERSION}"></script>', 1)

index_path.write_text(index)
print(f'Wired Cool v0.5 with {parts} weight chunks; default model is cool.')
