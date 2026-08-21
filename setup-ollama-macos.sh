#!/bin/bash
set -euo pipefail

ORIGIN="https://rogerdiffrient-coder.github.io"
PLIST="$HOME/Library/LaunchAgents/com.rogervib.ollama-origins.plist"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.rogervib.ollama-origins</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/launchctl</string>
    <string>setenv</string>
    <string>OLLAMA_ORIGINS</string>
    <string>${ORIGIN}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
EOF

launchctl bootout gui/$(id -u) "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap gui/$(id -u) "$PLIST"
launchctl kickstart -k gui/$(id -u)/com.rogervib.ollama-origins >/dev/null 2>&1 || true
launchctl setenv OLLAMA_ORIGINS "$ORIGIN"

osascript -e 'tell application "Ollama" to quit' >/dev/null 2>&1 || true
sleep 1
open -a Ollama

echo "RogerVIB Ollama access configured for: $ORIGIN"
echo "This will be restored automatically after login/reboot."
