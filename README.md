# Typecho MCP Workbench

Local-first Typecho MCP Workbench for humans and AI agents.

Typecho MCP Workbench connects to an existing remote Typecho blog through SSH, deploys a tiny remote runtime automatically, and exposes two local interfaces:

- a local Markdown writing/review workbench for humans
- a local MCP server for AI agents that draft, revise, publish, and maintain posts

The remote server stays simple. No public API is exposed, no Typecho admin panel operation is required, and no long-running remote service is needed for the first version.

## Why This Exists

Typecho is small, fast, and loved by many independent bloggers. Modern writing workflows are changing: more drafts, revisions, media preparation, SEO checks, and publishing tasks are now handled by AI agents. A normal web admin panel is not the best interface for that.

This project turns a Typecho blog into an agent-operable publishing system while keeping the blog itself lightweight.

## Product Shape

```text
Human writer
  -> Local Workbench UI
  -> Backend adapter
  -> Local service today / Tauri commands later
  -> SSH
  -> Remote PHP agent
  -> Typecho

AI agent
  -> Local MCP server
  -> Local service
  -> SSH
  -> Remote PHP agent
  -> Typecho
```

The local operation layer is the center of the system. The human UI, MCP server, CLI, and future Tauri backend must call the same operation semantics, so permissions, audit logs, rollback snapshots, SSH state, and publishing rules stay consistent.

## Core Principles

- MCP-first: AI agents are first-class users, not an afterthought.
- Local-first control: secrets, cache, drafts, logs, and approvals stay on the user's machine.
- Zero-touch remote setup: the desktop client connects over SSH and deploys the remote runtime automatically.
- Tiny remote footprint: the first version uses an ephemeral PHP agent instead of a public HTTP API.
- Reversible operations: destructive writes should have snapshots, diffs, and rollback paths.
- Human supervision where it matters: draft operations can be automated; publishing can require approval or trusted-agent policy.
- SQLite-first release honesty: the current working target is SQLite; broader Typecho database compatibility must be explicit and tested before it is advertised.
- Tauri-first desktop direction: Electron is not the main product architecture.

## Planned Features

- Connect to a remote Typecho server over SSH.
- Detect Typecho root paths automatically.
- Deploy and update a small PHP remote agent.
- Read, create, edit, publish, schedule, and rollback posts.
- Upload media and insert Markdown image references.
- Register external image/file URLs from image hosts, file beds, object storage, or CDN links.
- Manage categories, tags, slugs, excerpts, cover images, and publish times.
- Maintain a local SQLite cache for drafts, remote snapshots, and operation logs.
- Expose MCP tools over stdio and local Streamable HTTP.
- Provide a lightweight Markdown editor with preview, outline, front matter, media insertion, and publish diff.

## Documentation

- [Project Structure](docs/project-structure.md)
- [Architecture](docs/architecture.md)
- [SSH Zero-Touch Deploy](docs/ssh-zero-touch-deploy.md)
- [Remote Agent Protocol](docs/remote-agent-protocol.md)
- [MCP Tools](docs/mcp-tools.md)
- [Asset Providers](docs/asset-providers.md)
- [Markdown Editor](docs/markdown-editor.md)
- [Security Model](docs/security.md)
- [Roadmap](docs/roadmap.md)
- [GitHub Launch Plan](docs/github-launch.md)

## Proposed Repository Layout

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
├── tests/
└── scripts/
```

## Prototype Quick Start

The current prototype is dependency-free and can run with Node.js only.

Probe a remote Typecho site through an SSH alias:

```bash
node apps/local-service/src/cli.js probe --host typecho-host
```

Deploy the tiny PHP agent and run a health check:

```bash
node apps/local-service/src/cli.js agent:health --host typecho-host
```

List recent posts in read-only mode:

```bash
node apps/local-service/src/cli.js posts:list --host typecho-host --limit 10
```

Read one post by Typecho `cid`:

```bash
node apps/local-service/src/cli.js posts:get --host typecho-host --cid 83
```

Launch the minimal MCP stdio prototype:

```bash
TYPECHO_MCP_HOST=typecho-host node packages/mcp-server/src/server.js
```

Launch the local human workbench:

```bash
TYPECHO_MCP_HOST=typecho-host node apps/local-service/src/server.js
```

Then open `http://127.0.0.1:4783`.

The first working path supports Docker-hosted Typecho deployments where SSH reaches the Docker host and the Typecho app is mounted into a PHP container.

Run the release-candidate safety gate:

```bash
node apps/local-service/src/cli.js release:check --host typecho-host
```

This performs safe read checks and verifies that publishing without confirmation is denied.

## Current Compatibility Boundary

The current release candidate is **SQLite-first**.

Supported and verified now:

- Typecho running on SQLite.
- SSH access to the Typecho host.
- Docker/Dockge deployments where Typecho is mounted into a PHP container.
- Posts list/detail, draft creation, post update, publish with confirmation, rollback snapshots, media upload/list, external asset URL registration, audit logs, diagnostics, cache, debug bundles, and the local Web workbench.

Detected but not yet supported for read/write operations:

- MySQL / MariaDB.
- PostgreSQL.

The remote PHP agent reports database compatibility in health/site info and Debug Bundle output. Non-SQLite databases should be surfaced as unsupported instead of being treated as partially working. MySQL/MariaDB support is planned as read-only first, then write support only after adapter tests, policy, snapshots, audit, cache invalidation, and Typecho hook-compatibility risks are addressed.

## Desktop Direction

The final human app should be an independent desktop application, not just a browser page.

Architecture decision:

- Tauri is the long-term desktop direction.
- Electron is not the main path.
- The current local service remains the MCP/CLI/reference backend during migration.
- The Web workbench now calls a backend adapter so it can later run against Tauri commands.

## MCP Positioning

The MCP server is the primary automation surface. It should expose tools for content operations, resources for blog state, and prompts for reusable editorial workflows.

The first version should support:

- stdio transport for local MCP clients
- Streamable HTTP on `127.0.0.1` for local multi-client usage
- explicit publish policy modes: `manual_approval`, `trusted_agent`, and `autopublish`

MCP references:

- [MCP specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18)
- [MCP transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

## Typecho Compatibility Target

The first implementation should target Typecho 1.2.x and later, with runtime detection for older installations where possible. The remote agent should avoid depending on public admin pages and should prefer loading Typecho bootstrap code or using the configured database through Typecho-compatible models.

Typecho references:

- [Typecho install requirements](https://docs.typecho.org/install)
- [Typecho plugin documentation](https://docs.typecho.org/plugins)
- [Typecho releases](https://github.com/typecho/typecho/releases)

## Status

This repository is in SQLite-first release-candidate preparation.

Implemented now:

- SSH-based remote detection
- Docker Typecho target detection
- zero-touch PHP agent upload
- remote agent health check
- SQLite site info, post listing, post detail, and write operations
- draft create, post update, publish, rollback snapshots
- media upload into Typecho's upload directory with Markdown references
- external image/file URL insertion for off-server asset hosting
- local audit log for write, publish, rollback, and media operations
- publish policy with manual approval as the default
- dependency-free MCP stdio server with read/write tools
- local human workbench with Activity Bar, Writing Workspace, Focus mode, Inspector, Operations Panel, Status Bar, Diff Preview, Snapshot Preview, Review/Confirm sheets, diagnostics, cache, policy, request logs, and Debug Bundle export
- database compatibility reporting for SQLite-supported and non-SQLite-unsupported states
- Tauri-first desktop architecture decision and frontend backend adapter

The next engineering milestone is a first full usable SQLite-first release:

1. finish release notes and compatibility wording,
2. add targeted tests for policy/cache/preview/database compatibility,
3. improve request-log filtering and failed-operation notes,
4. start Tauri scaffolding only after the adapter boundary remains stable,
5. plan MySQL/MariaDB read-only compatibility without claiming write support early.

## License

License is not chosen yet. MIT or Apache-2.0 are good candidates for broad adoption, but the decision should be made before public launch.
