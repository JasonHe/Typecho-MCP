# Contributing

Thanks for considering a contribution.

This project is early, so the most valuable contributions are practical ones:

- test against real Typecho deployments
- improve SSH detection across hosting providers
- harden the PHP remote agent
- design MCP tools that agents can use reliably
- improve documentation and examples
- build focused UI pieces for review and publishing

## Development Principles

- Keep remote code tiny and auditable.
- Keep MCP local by default.
- Prefer reversible operations.
- Add typed errors with useful hints.
- Do not log secrets.
- Do not expose public network services unless explicitly configured.

## Suggested First Contributions

- Add a deployment note for your hosting provider.
- Add a fixture for a Typecho version you use.
- Improve error messages in docs.
- Implement a read-only remote agent command.
- Add tests for protocol response parsing.

## Commit Style

Use short, scoped commit messages:

```text
docs: explain ssh deploy flow
mcp: add posts list tool
agent: add health check command
security: redact ssh config logs
```

## Security Issues

Please do not open public issues for credential leaks, remote execution bugs, path traversal, or publish-policy bypasses before maintainers have a chance to respond.

Until a formal security policy exists, report sensitive findings privately to the maintainer.
