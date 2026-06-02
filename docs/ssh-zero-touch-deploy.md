# SSH Zero-Touch Deploy

Zero-touch deploy means the user does not manually install a Typecho plugin, edit server files, or expose a new public API. The local app connects through SSH and prepares everything it needs.

## Goals

- Support existing Typecho blogs with minimal assumptions.
- Require only SSH/SFTP access and PHP runtime compatibility.
- Keep the remote footprint small and removable.
- Avoid public-facing endpoints by default.
- Make every deployment step visible and reversible.

## Minimum Remote Requirements

- SSH access
- SFTP or SCP-compatible file upload
- readable Typecho installation directory, either directly on the host or through a Docker volume
- writable small runtime directory, preferably inside Typecho root or user home
- PHP CLI on the host, or Docker access to a PHP container that contains Typecho
- Typecho runtime compatible with PHP 7.2 or later

If host PHP CLI is unavailable, Docker execution should be attempted before falling back to future HTTP modes.

## Detection Strategy

The local service should detect candidate Typecho roots by looking for marker files and directories:

```text
config.inc.php
index.php
var/Typecho/
var/Widget/
usr/
usr/themes/
usr/plugins/
```

Suggested search roots:

```text
current SSH login directory
~/www
~/public_html
~/domains
/www/wwwroot
/var/www
/var/www/html
/home/*/www
/home/*/public_html
```

Detection should be bounded. Do not scan the entire filesystem by default.

## Detection Result

Return structured candidates:

```json
{
  "candidates": [
    {
      "root": "/www/wwwroot/blog.example.com",
      "confidence": 0.96,
      "markers": [
        "config.inc.php",
        "var/Typecho",
        "usr/themes"
      ],
      "typechoVersion": "1.2.1",
      "phpVersion": "8.2.12",
      "writable": true
    }
  ]
}
```

If there is exactly one high-confidence candidate, the local app can select it. If there are multiple candidates, ask the user to choose.

## Remote Runtime Location

Preferred location:

```text
<typecho-root>/.typecho-mcp/
```

Fallback location:

```text
~/.typecho-mcp/sites/<site-hash>/
```

The root-local path makes Typecho bootstrap easier. The home-directory path is safer when the web root is not writable.

## Deployment Steps

```text
1. Connect SSH.
2. Check remote shell, uname, php path, php version.
3. Detect Typecho root.
4. Resolve runtime directory.
5. Upload agent bundle to a temporary directory.
6. Verify checksum.
7. Move temp directory into active runtime directory atomically when possible.
8. Run `php agent.php health`.
9. Store manifest locally and remotely.
10. Mark site ready.
```

## Remote Manifest

The manifest should help the local service decide whether to update or reuse the agent.

```json
{
  "agentVersion": "0.1.0",
  "protocolVersion": "2026-05-31",
  "siteRoot": "/www/wwwroot/blog.example.com",
  "installedAt": "2026-05-31T09:30:00Z",
  "bundleSha256": "...",
  "capabilities": {
    "posts": true,
    "pages": true,
    "media": true,
    "taxonomy": true,
    "databaseCompatibility": true,
    "comments": false
  }
}
```

Current agent `0.1.1` reports runtime database compatibility from `system.health`.
SQLite is the only supported read/write backend today; other detected database kinds should be surfaced as unsupported rather than treated as partially working.

## Command Execution Pattern

Host PHP mode:

```text
ssh user@host 'php /path/to/.typecho-mcp/agent.php'
```

Docker mode:

```text
ssh user@host 'docker exec -i typecho-php-1 php /app/.typecho-mcp/current/agent.php'
```

The local side sends JSON through stdin and reads JSON from stdout. Remote logs go to stderr.

Important rule:

```text
stdout must contain protocol JSON only
stderr may contain logs
```

## Update Strategy

Agent updates should be safe:

```text
.typecho-mcp/
├── current -> releases/0.1.2/
├── releases/
│   ├── 0.1.1/
│   └── 0.1.2/
└── manifest.json
```

If symlinks are unavailable, use a `current/` directory and keep `previous/`.

Update flow:

```text
1. Upload new release directory.
2. Verify checksum.
3. Run health check against new release.
4. Switch current pointer.
5. Keep previous release for rollback.
```

## Uninstall

Uninstall should remove only project-owned files:

```text
<typecho-root>/.typecho-mcp/
~/.typecho-mcp/sites/<site-hash>/
```

Never remove Typecho files, themes, uploads, plugins, or database rows during uninstall.

## Failure Modes

### SSH Auth Fails

Show:

- host
- port
- username
- auth method
- whether DNS resolved
- whether TCP connection opened

Do not print private keys or passwords.

### PHP CLI Missing

MVP behavior:

- stop onboarding
- explain that PHP CLI is required
- offer future HTTP fallback as unavailable

### Typecho Root Ambiguous

Show candidates and confidence. Let user choose.

### Runtime Directory Not Writable

Try fallback under home directory. If both fail, stop.

### Agent Health Check Fails

Keep uploaded files in release directory but do not mark active. Show stderr and structured error output.

## Compatibility Notes

The first version should target common Linux hosts. Windows remote servers and constrained shared hosting can be explored after the core SSH path is stable.
