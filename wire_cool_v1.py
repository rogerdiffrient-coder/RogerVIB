import json, re
from pathlib import Path

VERSION = '0.6.0'
manifest = json.loads(Path('cool-v1-manifest.json').read_text())
parts = int(manifest['parts'])
model_version = manifest.get('version', VERSION)

loader = [
    "// Generated loader for RogerVIB v0.6 Smarter.\n",
    "// document.write is intentional here: model weight scripts must finish before models/cool.js executes.\n",
    f"document.write('<script src=\"cool-v1-config.js?v={VERSION}\"><\\/script>');\n",
]
for i in range(parts):
    loader.append(f"document.write('<script src=\"cool-v1-part{i}.js?v={VERSION}\"><\\/script>');\n")
Path('cool-v1-loader.js').write_text(''.join(loader))

# Keep the upgraded Transformer as the default model.
main_path = Path('main.js')
main = main_path.read_text()
main = re.sub(r"const DEFAULT_MODEL = '[^']+';", "const DEFAULT_MODEL = 'cool';", main, count=1)
main_path.write_text(main)

index_path = Path('index.html')
index = index_path.read_text()
# Bump every older RogerVIB model/cache query so browsers cannot keep the stale v0.5 runtime.
index = re.sub(r'v=0\.4\.\d+', f'v={VERSION}', index)
index = re.sub(r'v=0\.5\.\d+', f'v={VERSION}', index)

# Remove any previous Cool/Smarter tool wiring before inserting the canonical block.
index = re.sub(r'\n\s*<!-- RogerVIB v0\.5 Cool tools \+ weights -->.*?<!-- End Cool v0\.5 -->\s*', '\n', index, flags=re.S)
index = re.sub(r'\n\s*<!-- RogerVIB v0\.6 Smarter tools \+ weights -->.*?<!-- End Smarter v0\.6 -->\s*', '\n', index, flags=re.S)
index = re.sub(r'\n\s*<script src="models/cool\.js[^>]*></script>\s*', '\n', index)

cool_block = f'''\n  <!-- RogerVIB v0.6 Smarter tools + weights -->
  <script src="tools/tools.js?v={VERSION}"></script>
  <script src="tools/calculator.js?v={VERSION}"></script>
  <script src="tools/web-search.js?v={VERSION}"></script>
  <script src="cool-v1-loader.js?v={VERSION}"></script>
  <!-- End Smarter v0.6 -->
'''
marker = '  <!-- Brah\'s trained intent weights remain for the older model/fallback. -->'
if marker not in index:
    marker = '  <!-- Brah keeps its compiled learned intent weights separate too. -->'
if marker not in index:
    raise SystemExit('Could not find Brah model marker in index.html')
index = index.replace(marker, cool_block + '\n' + marker, 1)

# Load the upgraded model after Decent so its larger order value places it first in the picker.
decent_match = re.search(r'\s*<script src="models/decent\.js\?v=[^"]+"></script>', index)
if not decent_match:
    raise SystemExit('Could not find Decent model script in index.html')
decent_line = decent_match.group(0).strip()
if 'models/cool.js' not in index:
    index = index.replace(decent_match.group(0), '\n  ' + decent_line + f'\n  <script src="models/cool.js?v={VERSION}"></script>', 1)

index_path.write_text(index)
print(f'Wired RogerVIB {model_version} with {parts} weight chunks; default model is cool.')
