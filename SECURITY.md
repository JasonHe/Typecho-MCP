# Security Policy

Typecho MCP Workbench controls live blogs through SSH and exposes local tools to AI agents. Please treat security reports with care.

## Supported Versions

The project is pre-release. Security fixes should target the latest main branch until stable releases exist.

## Reporting A Vulnerability

Please do not open public issues for:

- credential leaks
- path traversal
- remote command execution
- publish-policy bypasses
- local MCP exposure issues

Use GitHub private vulnerability reporting once the repository is public. While the repository is private, report findings directly to the maintainer.

## Security Expectations

- Remote APIs are not public by default.
- MCP HTTP transport should bind to `127.0.0.1` by default.
- Publishing and destructive tools should be policy-gated.
- Remote agent file access must stay inside allowed Typecho/runtime paths.
- Logs must redact secrets.

