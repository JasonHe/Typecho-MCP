# MCP Tools

The MCP server is the main interface for AI agents. It should be designed as a publishing API, not just a raw database wrapper.

The current MCP specification defines tools as model-controlled executable functions, while resources and prompts provide context and reusable workflows. This project should expose all three primitives.

Reference:

- [MCP server features](https://modelcontextprotocol.io/specification/2025-06-18/server/index)
- [MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

## Transports

### stdio

Use stdio for local clients that launch the server as a subprocess.

Example use cases:

- Claude Desktop-style local MCP integration
- Codex local tool integration
- editor-launched AI assistants

### Streamable HTTP

Use Streamable HTTP on `127.0.0.1` for local multi-client usage.

Example use cases:

- a local orchestrator
- a browser-based agent dashboard
- multiple local AI processes

Default bind address:

```text
127.0.0.1
```

Do not bind to `0.0.0.0` by default.

## Tool Naming

Use names that are clear to models and humans.

Recommended prefix:

```text
typecho.*
```

Examples:

```text
typecho.site.health_check
typecho.posts.search
typecho.posts.create_draft
typecho.posts.publish
```

## Tool Categories

### Site Tools

```text
typecho.site.detect
typecho.site.health_check
typecho.site.get_info
typecho.site.sync_cache
```

### Post Tools

```text
typecho.posts.list
typecho.posts.search
typecho.posts.get
typecho.posts.create_draft
typecho.posts.update
typecho.posts.preview
typecho.posts.publish
typecho.posts.schedule
typecho.posts.rollback
```

### Media Tools

```text
typecho.media.upload
typecho.media.list
typecho.media.register_external_url
typecho.media.get
typecho.media.insert_markdown_image
```

### Taxonomy Tools

```text
typecho.taxonomy.list_categories
typecho.taxonomy.list_tags
typecho.taxonomy.ensure_category
typecho.taxonomy.ensure_tags
typecho.taxonomy.set_post_terms
```

### Editorial Tools

These tools are local workflow tools. They may not call the remote server directly.

```text
typecho.editorial.create_outline
typecho.editorial.generate_excerpt
typecho.editorial.generate_slug
typecho.editorial.check_publish_readiness
typecho.editorial.prepare_publish_bundle
```

## MVP Tools

The first public alpha should include these tools:

```text
typecho.site.health_check
typecho.posts.list
typecho.posts.search
typecho.posts.get
typecho.posts.create_draft
typecho.posts.update
typecho.posts.preview
typecho.posts.publish
typecho.media.upload
typecho.media.register_external_url
typecho.taxonomy.ensure_tags
```

Current prototype tools:

```text
typecho.site.health_check
typecho.posts.list
typecho.posts.get
typecho.posts.create_draft
typecho.posts.update
typecho.posts.publish
typecho.media.upload
typecho.media.list
typecho.media.register_external_url
typecho.audit.list
typecho.snapshots.list
typecho.posts.rollback
```

These tools use a minimal dependency-free stdio JSON-RPC server. The production implementation should move to the official MCP SDK when package management is available.

## Example Tool: Create Draft

Input schema:

```json
{
  "type": "object",
  "properties": {
    "siteId": {
      "type": "string"
    },
    "title": {
      "type": "string",
      "minLength": 1
    },
    "markdown": {
      "type": "string",
      "minLength": 1
    },
    "slug": {
      "type": "string"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "categories": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "excerpt": {
      "type": "string"
    }
  },
  "required": ["siteId", "title", "markdown"]
}
```

Result:

```json
{
  "post": {
    "cid": 123,
    "title": "Local-first Typecho publishing with MCP",
    "status": "draft",
    "permalink": null
  },
  "warnings": []
}
```

## Example Tool: Publish Post

Input schema:

```json
{
  "type": "object",
  "properties": {
    "siteId": {
      "type": "string"
    },
    "cid": {
      "type": "integer"
    },
    "mode": {
      "type": "string",
      "enum": ["now", "schedule"]
    },
    "scheduledAt": {
      "type": "string",
      "format": "date-time"
    },
    "confirmRisk": {
      "type": "boolean"
    }
  },
  "required": ["siteId", "cid", "mode"]
}
```

Behavior:

- In `manual_approval`, create an approval request and return pending state.
- In `trusted_agent`, publish if the calling client is trusted.
- In `autopublish`, publish after readiness checks pass.

Result:

```json
{
  "status": "published",
  "post": {
    "cid": 123,
    "permalink": "https://blog.example.com/archives/123/"
  },
  "snapshotId": "snap_01HX..."
}
```

## Resources

Expose useful state as MCP resources:

```text
typecho://sites
typecho://site/{siteId}/posts/recent
typecho://site/{siteId}/post/{cid}
typecho://site/{siteId}/taxonomy
typecho://site/{siteId}/operation-log/recent
```

Resources should be read-only context.

## Prompts

Prompts should encode repeatable writing workflows.

Recommended prompts:

```text
draft_post_from_brief
revise_post_for_style
prepare_publish_review
turn_notes_into_article
update_old_post
create_series_plan
```

Example prompt intent:

```text
Use the site's recent posts, taxonomy, and style hints to draft a Typecho post from a short brief. Create it as a draft and return the draft id.
```

## Safety Rules

Publishing tools should be marked as high-impact in local policy.

Default behavior:

- draft creation allowed
- post update allowed with snapshot
- media upload allowed
- publish requires approval
- delete disabled

## Return Values

Tools should return structured content and human-readable summaries.

Good result:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Draft created: #123 Local-first Typecho publishing with MCP"
    }
  ],
  "structuredContent": {
    "cid": 123,
    "status": "draft",
    "warnings": []
  }
}
```

## Tool Error Handling

MCP tool execution errors should normally be returned in the tool result with `isError: true`, not as protocol-level failures.

Example:

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Remote PHP CLI is missing. Install php-cli or reconnect with another execution mode."
    }
  ],
  "structuredContent": {
    "code": "REMOTE_PHP_CLI_MISSING",
    "retryable": false
  }
}
```
