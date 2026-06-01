# Remote Agent Protocol

The remote PHP agent is not an MCP server. It is a small command runner controlled by the local service over SSH.

This separation keeps MCP local, avoids exposing public remote services, and makes the remote runtime easy to audit.

## Transport

The preferred transport is SSH command execution:

```text
local service
  -> ssh exec: php agent.php
  -> stdin: JSON request
  <- stdout: JSON response
  <- stderr: logs
```

The payload can use a JSON-RPC-like envelope, but the agent does not need to implement the full MCP lifecycle.

Current prototype methods:

```text
system.health
site.info
posts.list
posts.get
posts.createDraft
posts.update
posts.publish
media.upload
```

The current agent supports SQLite-backed Typecho installations. Write operations should be called through the local operations layer so snapshots are captured before updates and publishes.

## Envelope

Request:

```json
{
  "jsonrpc": "2.0",
  "id": "op_01HX...",
  "method": "posts.get",
  "params": {
    "cid": 123
  }
}
```

Success:

```json
{
  "jsonrpc": "2.0",
  "id": "op_01HX...",
  "result": {
    "post": {
      "cid": 123,
      "title": "Hello Typecho",
      "status": "publish"
    }
  }
}
```

Error:

```json
{
  "jsonrpc": "2.0",
  "id": "op_01HX...",
  "error": {
    "code": "POST_NOT_FOUND",
    "message": "Post 123 was not found.",
    "retryable": false
  }
}
```

## Method Groups

### `system.*`

```text
system.health
system.detect
system.version
system.capabilities
```

### `site.*`

```text
site.info
site.options
site.routes
```

### `posts.*`

```text
posts.list
posts.search
posts.get
posts.create
posts.update
posts.publish
posts.schedule
posts.delete
posts.restore
```

`posts.delete` should be disabled in the first MCP-facing release unless rollback is fully implemented.

### `pages.*`

```text
pages.list
pages.get
pages.create
pages.update
```

### `media.*`

```text
media.list
media.upload
media.get
media.delete
```

### `taxonomy.*`

```text
taxonomy.listCategories
taxonomy.listTags
taxonomy.ensureCategory
taxonomy.ensureTags
taxonomy.setPostTerms
```

### `comments.*`

```text
comments.list
comments.get
comments.approve
comments.spam
comments.delete
```

Comments can wait until after the post workflow is stable.

## Agent Capabilities

The agent should report capabilities at runtime:

```json
{
  "database": {
    "status": "supported",
    "supported": true,
    "readSupported": true,
    "writeSupported": true,
    "supportedKinds": ["sqlite"],
    "message": "SQLite read/write access is available."
  },
  "posts": {
    "read": true,
    "write": true,
    "publish": true,
    "schedule": true,
    "rollback": false
  },
  "media": {
    "upload": true,
    "delete": false
  },
  "taxonomy": {
    "read": true,
    "write": true
  }
}
```

MCP tools should be enabled or disabled based on these capabilities.

Current implementation note:

- Agent `0.1.1` reports database compatibility explicitly.
- SQLite is the only supported read/write backend today.
- Non-SQLite databases should return `DATABASE_NOT_SUPPORTED` with details including detected adapter, kind, operation, and supported kinds.

## Post Model

Remote post payload:

```json
{
  "cid": 123,
  "type": "post",
  "title": "Post title",
  "slug": "post-title",
  "text": "Markdown or HTML content",
  "status": "draft",
  "created": "2026-05-31T09:30:00Z",
  "modified": "2026-05-31T10:00:00Z",
  "published": null,
  "authorId": 1,
  "categories": ["AI"],
  "tags": ["typecho", "mcp"],
  "excerpt": "Short summary",
  "cover": null,
  "permalink": null
}
```

## Snapshots

Before any write operation, the local service should request the current remote object and store it locally.

Snapshot metadata:

```json
{
  "snapshotId": "snap_01HX...",
  "siteId": "site_01HX...",
  "entityType": "post",
  "entityId": "123",
  "createdAt": "2026-05-31T10:00:00Z",
  "reason": "before_update",
  "operationId": "op_01HX..."
}
```

The remote agent does not need to store snapshots for MVP. Local snapshots are enough for first rollback support.

## Idempotency

All write calls should include an operation id:

```json
{
  "operationId": "op_01HX...",
  "idempotencyKey": "site_abc:create_draft:hash"
}
```

The local service should prevent accidental duplicate calls. The remote agent can remain stateless in the first version.

## Logging

Remote agent logs must go to stderr.

Log format:

```json
{"level":"info","event":"typecho_bootstrap_loaded","time":"2026-05-31T09:30:00Z"}
```

Never write logs to stdout, because stdout is reserved for protocol responses.

## PHP Runtime Rules

The agent should:

- use strict JSON input and output
- set a deterministic timezone if needed
- avoid echoing incidental output
- catch PHP warnings and convert them into structured errors where possible
- avoid remote shell calls unless absolutely required
- validate file paths before reading or writing

## Bootstrap Strategy

Preferred:

```text
1. locate Typecho root
2. include config.inc.php
3. load Typecho bootstrap
4. use Typecho classes or database layer where possible
```

Fallback:

```text
1. parse config.inc.php constants
2. use PDO-compatible database operations
3. preserve Typecho table prefix and schema rules
```

Direct database fallback should be treated carefully because it may bypass hooks or caches.
