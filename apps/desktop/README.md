# Typecho MCP Desktop

This is the first Tauri desktop alpha for the human writing workbench.

It is intentionally a transitional shell:

- The UI is the existing Workbench served by `apps/local-service`.
- The Tauri app tries to start the local service on `127.0.0.1:4783`.
- The Tauri bundle references the existing `apps/web-console/public` renderer assets so the source tree stays single-renderer.
- The long-term direction is still a Tauri-native backend command boundary, not a permanent hidden-localhost architecture.

## Build

```bash
. "$HOME/.cargo/env"
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml --release --offline
bash apps/desktop/scripts/bundle-macos-app.sh
```

The macOS app bundle is expected under:

```text
apps/desktop/src-tauri/target/release/bundle/macos/Typecho MCP Workbench.app
```

## Current Alpha Behavior

When launched, the app:

1. Checks `http://127.0.0.1:4783/api/health`.
2. Starts `node apps/local-service/src/server.js` if the service is not already running.
3. Opens the workbench URL in a native Tauri window.
4. Stops the child service when the app exits, if it started that service.

If another process is already serving the workbench port, the app reuses it.

## Logs

Desktop startup logs are written to:

```text
~/Library/Logs/Typecho MCP Workbench/desktop.log
~/Library/Logs/Typecho MCP Workbench/service.log
```

The alpha can also be pointed at explicit local paths:

```bash
TYPECHO_MCP_PROJECT_ROOT=/path/to/typecho-mcp TYPECHO_MCP_NODE=/path/to/node \
  "apps/desktop/src-tauri/target/release/bundle/macos/Typecho MCP Workbench.app/Contents/MacOS/typecho-mcp-desktop"
```

## Official Tauri Bundle

The manual alpha bundle exists so the project can produce a first executable while the local Tauri CLI toolchain is still being finalized.

Once `cargo tauri` is installed, the intended command is:

```bash
cargo tauri build --config apps/desktop/src-tauri/tauri.conf.json
```
