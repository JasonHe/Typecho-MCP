# MCP Server

Minimal dependency-free MCP stdio prototype.

Set `TYPECHO_MCP_HOST` to an SSH host alias before launching:

```bash
TYPECHO_MCP_HOST=your-ssh-alias node packages/mcp-server/src/server.js
```

This prototype implements basic JSON-RPC stdio handling with read, draft, update, publish, media upload, and rollback tools. It should move to the official MCP SDK once package management is available in the development environment.
