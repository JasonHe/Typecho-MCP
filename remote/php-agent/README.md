# PHP Agent

Tiny remote runtime uploaded by the local service.

The agent is executed over SSH, normally through one of these modes:

```bash
php /path/to/.typecho-mcp/current/agent.php
docker exec -i typecho-php-1 php /app/.typecho-mcp/current/agent.php
```

It reads a JSON request from stdin and writes a JSON response to stdout. Logs must go to stderr.

