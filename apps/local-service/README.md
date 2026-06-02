# Local Service

The local service is the control plane for SSH detection, remote agent deployment, sync, policy, and audit logs.

Current prototype commands:

```bash
node apps/local-service/src/cli.js probe --host typecho-host
node apps/local-service/src/cli.js agent:health --host typecho-host
node apps/local-service/src/cli.js posts:list --host typecho-host --limit 10
node apps/local-service/src/cli.js posts:get --host typecho-host --cid 83
node apps/local-service/src/cli.js posts:create-draft --host typecho-host --title "Hello" --markdown "# Hello"
node apps/local-service/src/cli.js posts:update --host typecho-host --cid 84 --status draft
node apps/local-service/src/cli.js posts:publish --host typecho-host --cid 84
```

Start the localhost workbench:

```bash
TYPECHO_MCP_HOST=typecho-host node apps/local-service/src/server.js
```
