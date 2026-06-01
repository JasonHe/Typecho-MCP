#!/usr/bin/env bash
set -euo pipefail

node -c apps/local-service/src/cli.js
node -c apps/local-service/src/server.js
node -c packages/ssh-connector/src/index.js
node -c packages/remote-runtime/src/index.js
node -c packages/local-ops/src/index.js
node -c packages/mcp-server/src/protocol.js
node -c packages/mcp-server/src/server.js
node -c packages/policy/src/index.js
node -c packages/core/src/index.js
node -c packages/editor/src/index.js
node -c packages/request-log/src/index.js

node apps/local-service/src/cli.js policy:list >/dev/null
node apps/local-service/src/cli.js requests:list --limit 5 >/dev/null

if [[ -n "${TYPECHO_MCP_HOST:-}" ]]; then
  node apps/local-service/src/cli.js probe --host "$TYPECHO_MCP_HOST" >/dev/null
  node apps/local-service/src/cli.js agent:health --host "$TYPECHO_MCP_HOST" >/dev/null
  node apps/local-service/src/cli.js posts:list --host "$TYPECHO_MCP_HOST" --limit 2 >/dev/null
  node apps/local-service/src/cli.js cache:status --host "$TYPECHO_MCP_HOST" >/dev/null
  node apps/local-service/src/cli.js release:check --host "$TYPECHO_MCP_HOST" >/dev/null
else
  echo "TYPECHO_MCP_HOST is not set; skipped remote SSH smoke checks."
fi
