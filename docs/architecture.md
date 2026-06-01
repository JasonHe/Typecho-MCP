# Architecture

Typecho MCP Workbench is a local-first publishing system. The remote Typecho server remains the source of truth for published content, while the local machine becomes the control plane for editing, automation, review, and agent access.

## High-Level Diagram

```text
┌────────────────────┐
│ Human Desktop UI   │
│ Markdown Workbench │
└─────────┬──────────┘
          │ local API
┌─────────▼──────────┐
│ Local Service      │
│ policy + sync + SSH│
└─────┬────────┬─────┘
      │        │
      │        │ local API
      │  ┌─────▼──────────┐
      │  │ Local MCP       │
      │  │ stdio / HTTP    │
      │  └─────────────────┘
      │
      │ SSH / SFTP
┌─────▼──────────────┐
│ Remote PHP Agent   │
│ ephemeral runtime  │
└─────┬──────────────┘
      │
┌─────▼──────────────┐
│ Typecho            │
│ files + database   │
└────────────────────┘
```

## Component Roles

### Desktop UI

The desktop UI is a human control surface. It should feel like a lightweight Markdown editor plus a mission control panel for AI publishing.

It should handle:

- site onboarding
- Markdown editing
- metadata editing
- media upload review
- publish diff
- approval prompts
- operation logs

It should not handle:

- raw SSH execution
- direct database access
- MCP protocol logic
- remote agent versioning

### Local MCP Server

The MCP server is the primary automation surface.

It exposes:

- tools for actions
- resources for current blog state
- prompts for repeatable editorial workflows

The MCP server should be local by default. For the first version, bind HTTP only to `127.0.0.1` and support stdio for clients that launch local servers as subprocesses.

### Local Service

The local service is the control plane.

It owns:

- site profiles
- credential references
- SSH lifecycle
- remote agent deployment
- content operation execution
- local cache
- publish policy
- rollback snapshots
- audit logs

It should expose an internal API that both UI and MCP call.

### SSH Connector

The SSH connector provides transport-level remote access.

It owns:

- SSH connection setup
- SFTP upload
- command execution
- shell quoting strategy
- timeouts and cancellation
- stdout/stderr collection

It should not know what a Typecho post is.

### Remote PHP Agent

The remote PHP agent is an ephemeral runtime uploaded by the local service.

It owns:

- Typecho root detection confirmation
- Typecho bootstrap loading
- controlled read/write operations
- media file operations
- JSON response formatting

It should avoid exposing a public endpoint. The first version should run through `php agent.php` over SSH.

For Docker deployments, the local service can execute the same agent through the host:

```text
ssh host "docker exec -i typecho-container php /app/.typecho-mcp/current/agent.php"
```

## Data Flow: First Connection

```text
1. User enters SSH host, port, user, auth method.
2. Local service opens SSH connection.
3. SSH connector probes remote environment.
4. Detection scans candidate directories for Typecho markers.
5. User confirms detected site if multiple candidates exist.
6. Local service uploads remote PHP agent.
7. Agent runs health check.
8. Local service stores site profile and remote manifest.
9. MCP tools and UI become available.
```

## Data Flow: AI Creates Draft

```text
1. AI calls MCP tool `create_draft`.
2. MCP server validates input schema.
3. Local service checks site profile and publish policy.
4. Local service writes a local operation log entry.
5. Remote runtime invokes PHP agent through SSH.
6. Agent creates a Typecho draft.
7. Local service stores remote snapshot.
8. MCP server returns post id, title, status, URL candidates, and warnings.
```

## Data Flow: AI Publishes Post

```text
1. AI calls `publish_post`.
2. MCP server passes the request to local service.
3. Local service checks publish policy.
4. In manual mode, UI receives an approval request.
5. Local service fetches current remote state.
6. Local service creates rollback snapshot.
7. Agent publishes the post.
8. Local cache and audit log are updated.
9. MCP returns a structured result with canonical URL.
```

## Publish Policies

### `manual_approval`

Default mode.

AI can draft, edit, upload, and prepare posts, but publishing requires human confirmation in the local UI.

### `trusted_agent`

A configured MCP client or agent identity can publish directly.

This requires:

- named client profile
- audit logging
- rollback snapshot
- optional daily publish limit

### `autopublish`

Fully automatic publishing.

This should be opt-in and should require:

- rollback enabled
- local audit logs enabled
- remote health check passing
- optional content validation workflow

## Local Data Ownership

Local machine stores:

- SSH connection profiles
- credential references
- encrypted tokens or key references
- local drafts
- operation logs
- remote snapshots
- MCP invocation history
- editor settings

Remote server stores:

- Typecho posts and pages
- Typecho media files
- minimal agent files
- optional remote manifest

## Error Philosophy

Errors should be actionable and typed.

Good error:

```json
{
  "code": "REMOTE_PHP_CLI_MISSING",
  "message": "PHP CLI was not found on the remote host.",
  "hint": "Install php-cli or enable HTTP fallback mode.",
  "retryable": false
}
```

Bad error:

```text
Command failed.
```

## Design Boundaries

The first version should avoid:

- direct scraping of Typecho admin pages
- public remote HTTP APIs
- remote long-running daemons
- multi-user collaboration
- complex visual page builders
- irreversible database writes

The first version should prioritize:

- reliable SSH onboarding
- Docker-hosted Typecho detection
- read-only remote introspection
- post draft and update operations
- local MCP server
- audit logs
- rollback snapshots
