# Release Checklist

Target: first full usable SQLite-first release candidate.

## Release Positioning

This release is:

- local-first,
- MCP-first,
- SQLite-first,
- SSH zero-touch,
- human-approved for high-risk operations,
- Tauri-directed but not yet a final Tauri desktop build.

Do not claim broad Typecho database compatibility yet. MySQL/MariaDB are planned after database adapter and read-only tests.

## Must Pass

- `bash tests/smoke.sh`
- `node --check` for touched JS files.
- `git diff --check`.
- `node apps/local-service/src/cli.js agent:health --host typecho-host`
- `node apps/local-service/src/cli.js posts:list --host typecho-host --limit 5`
- `node apps/local-service/src/cli.js release:check --host typecho-host`
- Web workbench loads at `http://127.0.0.1:4783`.
- Debug Bundle includes database compatibility at top level.
- Publish without confirmation fails.
- Publish with confirmation only happens from an explicit human-approved path.
- Rollback requires snapshot preview and explicit confirmation.

## User-Facing Claims To Keep Accurate

Supported:

- SQLite Typecho.
- SSH + Docker/Dockge target detection.
- PHP agent zero-touch deployment.
- Posts list/detail/create draft/update/prepare/publish/rollback.
- Media list/upload and external URL registration.
- Audit, request logs, cache, diagnostics, debug bundle.
- MCP stdio server.
- Local Web workbench.

Not yet claimed:

- MySQL/MariaDB write support.
- PostgreSQL support.
- Final packaged Tauri desktop app.
- Plugin/theme/settings writes.
- Comment delete/reply automation.
- Autonomous publish by default.

## High-Risk Operations

These must stay behind policy and review/confirm:

- publish,
- rollback,
- delete,
- comment moderation writes,
- plugin enable/disable,
- theme switch,
- settings/permalink writes,
- user/account writes.

## Before Public Launch

- Choose license.
- Add screenshots/GIFs for README.
- Add install/run guide for non-Codex users.
- Add MCP client configuration examples.
- Add release notes with database compatibility boundary.
- Tag the release only after smoke and real `typecho-host` verification pass.
