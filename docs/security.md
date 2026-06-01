# Security Model

This project controls a live blog through SSH and exposes tools to AI agents. Security is not a polish task; it is part of the product.

## Security Goals

- Do not expose a public remote API by default.
- Keep credentials local.
- Make high-impact actions visible.
- Preserve rollback material before writes.
- Make AI tool access explicit and inspectable.
- Keep the remote runtime small enough to audit.

## Trust Boundaries

```text
AI Agent
  boundary: MCP tool policy
Local MCP Server
  boundary: local service API
Local Service
  boundary: SSH credential store
Remote PHP Agent
  boundary: Typecho files and database
Typecho
```

## Sensitive Assets

- SSH private keys
- SSH passwords
- Typecho database credentials
- remote site path
- unpublished drafts
- media uploads
- local snapshots
- MCP operation logs

## Credential Handling

The app should store credentials using the operating system credential store where possible.

Recommended:

- macOS Keychain
- Windows Credential Manager
- libsecret or compatible secret service on Linux

Avoid:

- plaintext passwords in config files
- writing private keys into project folders
- including credentials in logs
- passing passwords through shell command strings

## Local MCP Exposure

Default:

```text
stdio: enabled
Streamable HTTP: 127.0.0.1 only
remote network binding: disabled
```

If remote network binding is ever supported, require explicit configuration, authentication, and warning UI.

## Tool Risk Levels

### Low Risk

```text
site health check
list posts
get post
list taxonomy
read operation log
```

### Medium Risk

```text
create draft
update draft
upload media
ensure tags
sync cache
```

### High Risk

```text
publish post
schedule post
change permalink
modify published post
rollback published post
delete media
delete post
```

High-risk tools need policy checks.

## Publish Policy

Default mode:

```text
manual_approval
```

Publish policy options:

```text
manual_approval
trusted_agent
autopublish
```

All modes should still write audit logs. `trusted_agent` and `autopublish` should require rollback snapshots.

Current prototype behavior:

- `manual_approval` is the default.
- `posts.publish` requires `confirm=true` unless a looser policy is configured.
- The web console sends `confirm=true` because it is an explicit human action.
- MCP agents must pass `confirm=true`, use `trusted_agent`, or use `autopublish`.

## Remote Agent Safety

The remote agent should:

- validate all method names
- validate all input schemas
- reject path traversal
- keep stdout protocol-only
- log to stderr only
- avoid shell execution
- avoid public HTTP exposure by default
- restrict file operations to Typecho root, upload directory, and agent directory

## Path Safety

Every remote file path should be normalized and checked against allowed roots.

Allowed:

```text
<typecho-root>
<typecho-root>/usr/uploads
<typecho-root>/.typecho-mcp
~/.typecho-mcp/sites/<site-hash>
```

Rejected:

```text
/etc/passwd
../../config.inc.php
arbitrary absolute paths
symlink escapes
```

## Audit Logs

Each operation should record:

- operation id
- site id
- caller type: human, MCP, system
- client name when available
- tool name when applicable
- affected entity
- input summary
- result
- timestamps
- snapshot id
- error code

Do not log full secrets or private key paths beyond user-approved labels.

Current prototype stores local append-only audit events under:

```text
~/.typecho-mcp-workbench/audit/YYYY-MM-DD.jsonl
```

## Rollback

Before write operations:

```text
1. fetch current remote state
2. store local snapshot
3. execute remote write
4. verify final remote state
5. link operation log to snapshot
```

Rollback should be exposed as a separate high-risk operation.

## MCP Security References

The MCP spec recommends human visibility and approval for tool invocation patterns, especially for tools that can take actions. This project should follow that spirit even when a user later enables trusted-agent automation.

Useful references:

- [MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP security best practices](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices)

## Threats To Consider

### Malicious Prompt Causes Unwanted Publish

Mitigation:

- publish policy
- approval UI
- trusted client list
- audit logs
- rollback snapshots

### Compromised MCP Client Calls Tools

Mitigation:

- local allowlist
- per-client policy
- high-risk tool confirmation
- disable local HTTP by default where not needed

### Remote Agent Used Outside Local App

Mitigation:

- no public endpoint
- SSH-only execution
- optional request signature
- narrow method allowlist

### Bad Agent Version Corrupts Posts

Mitigation:

- release checksum
- health check before activation
- keep previous runtime
- rollback snapshots

### Logs Leak Secrets

Mitigation:

- structured redaction
- no env dump
- no command strings with passwords
- no full config file logging
