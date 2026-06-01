# Request Log

Append-only local request log for HTTP, MCP, and CLI operations.

The log is intentionally metadata-only:

- operation id
- surface
- command/path/tool
- host
- duration
- status/error code

Do not store request bodies, full article text, tokens, private keys, or media payloads here.
