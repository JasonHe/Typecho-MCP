# Typecho MCP Desktop

This is the first Tauri desktop alpha for the human writing workbench.

It is intentionally a transitional shell:

- The UI is the existing Workbench served by `apps/local-service`.
- The Tauri app tries to start the local service on `127.0.0.1:4783`.
- The Tauri bundle references the existing `apps/web-console/public` renderer assets so the source tree stays single-renderer.
- The long-term direction is still a Tauri-native backend command boundary, not a permanent hidden-localhost architecture.

## Build

Official Tauri bundle verification runs from the repository root after npm dependencies are installed:

```bash
npm run desktop:build
```

The root script dispatches into the desktop package so Tauri runs with `apps/desktop` as its working directory. The desktop package then uses the repo-local Tauri CLI declared in the root `package.json` and the config at:

```text
src-tauri/tauri.conf.json
```

Clean-machine preflight and bundle verification can be run with:

```bash
bash scripts/verify-desktop-bundle.sh --preflight
bash scripts/verify-desktop-bundle.sh
```

The preflight requires a normal system Node toolchain that provides `node`, `npm`, and `npx`; the Codex bundled Node is not treated as a complete npm toolchain. If `npm` is missing, record the command, exit status, PATH/tool versions, and tooling limitation instead of falling back to `npx` or a global `tauri`.

The macOS app bundle is expected under:

```text
apps/desktop/src-tauri/target/release/bundle/macos/Typecho MCP Workbench.app
```

Do not commit that `.app`, `target/`, generated schemas, signing material, logs, env files, or debug bundles.

## Manual Alpha Fallback

The manual alpha bundle exists only as a fallback when the official Tauri CLI/toolchain is unavailable:

```bash
. "$HOME/.cargo/env"
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml --release --offline
bash apps/desktop/scripts/bundle-macos-app.sh
```

It writes to the same macOS bundle path:

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

The official path is `npm run desktop:build`, or `bash scripts/verify-desktop-bundle.sh` when a clean-machine preflight plus artifact hygiene scan is needed. If it fails because `npm`, the repo-local Tauri CLI, project npm dependencies, or the platform toolchain is missing, record the command, exit status, short error summary, and whether the failure is a tooling limitation. Do not retry indefinitely and do not treat the manual alpha fallback as proof that the official Tauri bundle path passed.
