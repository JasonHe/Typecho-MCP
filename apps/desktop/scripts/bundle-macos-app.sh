#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP="$ROOT/apps/desktop/src-tauri/target/release/bundle/macos/Typecho MCP Workbench.app"
BIN="$ROOT/apps/desktop/src-tauri/target/release/typecho-mcp-desktop"

if [[ ! -x "$BIN" ]]; then
  echo "Missing release binary: $BIN" >&2
  echo "Run: cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml --release --offline" >&2
  exit 1
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/typecho-mcp-desktop"
cp "$ROOT/apps/desktop/src-tauri/icons/icon.png" "$APP/Contents/Resources/icon.png"
chmod +x "$APP/Contents/MacOS/typecho-mcp-desktop"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>typecho-mcp-desktop</string>
  <key>CFBundleIdentifier</key>
  <string>com.okjason.typecho-mcp-workbench</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Typecho MCP Workbench</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0-alpha.1</string>
  <key>CFBundleVersion</key>
  <string>0.1.0-alpha.1</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

echo "$APP"
