# Project Structure

This project should use a TypeScript monorepo plus a small PHP remote runtime.

The important rule is simple: UI, MCP, SSH, and remote execution must not duplicate blog logic. Blog semantics live in `packages/core`; local orchestration lives in `apps/local-service`; remote execution stays tiny.

## Target Layout

```text
typecho-mcp/
├── apps/
│   ├── desktop/
│   ├── local-service/
│   └── web-console/
├── packages/
│   ├── core/
│   ├── editor/
│   ├── mcp-server/
│   ├── asset-providers/
│   ├── remote-runtime/
│   ├── ssh-connector/
│   ├── sync-store/
│   ├── ui/
│   └── config/
├── remote/
│   └── php-agent/
├── docs/
├── scripts/
├── tests/
├── package.json
└── README.md
```

## App Packages

### `apps/desktop`

The human-facing desktop app.

Recommended stack:

- Tauri for desktop shell
- React and TypeScript for UI
- local service client for all Typecho operations
- no direct SSH implementation in UI components

Primary responsibilities:

- connection setup and site onboarding
- Markdown editing and preview
- media insertion
- draft review
- publish confirmation
- task and audit log display

### `apps/local-service`

The local control plane.

This is the heart of the project. It should run as a local process that the desktop app and MCP server can call.

Primary responsibilities:

- store site profiles and encrypted credentials
- manage SSH sessions and remote runtime versions
- run deployment detection
- coordinate sync jobs
- execute content operations
- enforce publish policy
- write audit logs
- expose a local API to UI and MCP modules

The local service should be able to run without the desktop UI, because AI agents may use the MCP server directly.

### `apps/web-console`

Optional localhost management UI.

This can be useful later for headless use, remote desktop, or debugging. It should not be part of the first milestone unless it helps development speed.

## Shared Packages

### `packages/core`

Domain model and publishing rules.

Expected contents:

- `Post`
- `Page`
- `MediaAsset`
- `Category`
- `Tag`
- `Comment`
- `SiteProfile`
- `RemoteSnapshot`
- `PublishPolicy`
- `SyncJob`
- `OperationLog`

This package should not import Tauri, React, SSH libraries, SQLite drivers, or MCP SDKs.

### `packages/ssh-connector`

SSH, SFTP, and optional tunnel primitives.

Expected features:

- connect with password or key
- test PHP CLI availability
- upload files through SFTP
- execute remote commands with timeouts
- stream stdout and stderr separately
- normalize remote shell differences
- support jump host later

This package should not understand Typecho post semantics. It only knows remote machines.

### `packages/remote-runtime`

Local wrapper around the remote PHP agent protocol.

Expected features:

- package the agent files
- compute agent checksums
- compare remote manifest
- invoke remote commands
- parse JSON responses
- map remote errors into typed local errors
- detect host PHP execution targets
- detect Docker execution targets such as `typecho-php-1:/app`

This package understands the remote agent protocol but does not implement UI or MCP behavior.

### `packages/sync-store`

Local persistence.

Recommended storage:

- SQLite for desktop/local service
- migration files checked into the repo
- append-only operation log for auditability

Expected data:

- site profiles
- encrypted credential references
- local drafts
- remote post snapshots
- media upload cache
- pending operations
- MCP invocation history

### `packages/mcp-server`

The local MCP server.

Expected transports:

- stdio for local MCP clients
- Streamable HTTP on `127.0.0.1` for local multi-client use

This package should call `apps/local-service` or a local service SDK, not SSH directly.

### `packages/asset-providers`

Provider abstraction for images and files.

Expected providers:

- Typecho local uploads
- external URLs
- S3-compatible object storage
- Cloudflare R2
- WebDAV
- OpenList/AList

The goal is to keep large files and high-traffic images off the blog server when the user wants a separate image host or file bed.

### `packages/editor`

Markdown editor domain and adapters.

Expected features:

- Markdown document model
- front matter model
- outline extraction
- preview pipeline
- image insertion helpers
- post metadata panel schema

The actual UI components can live here or in `packages/ui`, depending on how shared the editor becomes.

### `packages/ui`

Shared React components.

This package should stay boring and practical:

- layout shells
- buttons
- toolbars
- dialogs
- tables
- status badges
- logs
- form controls

### `packages/config`

Shared monorepo configuration:

- TypeScript config
- ESLint config
- Prettier config
- test config
- build config

## Remote Package

### `remote/php-agent`

The auto-deployed PHP runtime.

It should be intentionally small:

- no public HTTP endpoint in the first version
- no persistent process by default
- no separate database
- no bundled composer dependency if avoidable
- communicate through stdin/stdout JSON

Expected files:

```text
remote/php-agent/
├── agent.php
├── src/
│   ├── Bootstrap.php
│   ├── DetectTypecho.php
│   ├── Posts.php
│   ├── Media.php
│   ├── Taxonomy.php
│   └── Response.php
└── manifest.json
```

## Dependency Direction

Allowed direction:

```text
apps/desktop
  -> packages/ui
  -> packages/editor
  -> packages/core

packages/mcp-server
  -> local-service client
  -> packages/core

apps/local-service
  -> packages/core
  -> packages/sync-store
  -> packages/ssh-connector
  -> packages/remote-runtime
```

Avoid:

- UI importing SSH packages directly
- MCP tools writing database rows directly
- remote PHP agent knowing MCP concepts
- `core` importing implementation packages

## First Commit Scope

The first public commit should include:

- project README
- architecture docs
- empty package folders with `README.md`
- basic package manager setup
- contribution guide
- issue templates

This gives visitors confidence that the project has a real shape before the first working release.

The current private prototype already goes beyond this baseline with a dependency-free SSH detector, PHP agent, local web console, and MCP stdio server with read/write tools.
