# Local Service

The local service is the control plane for SSH detection, remote agent deployment, sync, policy, and audit logs.

Current prototype commands:

```bash
node apps/local-service/src/cli.js probe --host your-ssh-alias
node apps/local-service/src/cli.js agent:health --host your-ssh-alias
node apps/local-service/src/cli.js posts:list --host your-ssh-alias --limit 10
node apps/local-service/src/cli.js posts:get --host your-ssh-alias --cid <post-id>
node apps/local-service/src/cli.js posts:create-draft --host your-ssh-alias --title "Hello" --markdown "# Hello"
node apps/local-service/src/cli.js posts:update --host your-ssh-alias --cid <post-id> --status draft
node apps/local-service/src/cli.js posts:publish --host your-ssh-alias --cid <post-id>
```

Start the localhost workbench:

```bash
TYPECHO_MCP_HOST=your-ssh-alias node apps/local-service/src/server.js
```
