import {
  cacheSummary,
  clearReadCache,
  createDraft,
  getPost,
  getSiteInfo,
  healthCheck,
  listMedia,
  listPosts,
  listSnapshots,
  preparePublish,
  previewPostUpdate,
  previewSnapshot,
  publishPost,
  registerExternalAsset,
  rollbackPost,
  updatePost,
  uploadMedia
} from "../../local-ops/src/index.js";
import { listAuditEvents } from "../../audit-log/src/index.js";
import { createOperationId, serializeError } from "../../core/src/index.js";
import { writeRequestLog } from "../../request-log/src/index.js";
import { listOperationPolicies } from "../../policy/src/index.js";

export const serverInfo = {
  name: "typecho-mcp-workbench",
  version: "0.1.0"
};

export const tools = [
  {
    name: "typecho.site.health_check",
    description: "Check the configured Typecho site and remote PHP agent health.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." },
        forceRefresh: { type: "boolean", description: "Bypass local read cache and fetch from the remote site." }
      }
    }
  },
  {
    name: "typecho.site.get_info",
    description: "Get Typecho site metadata and database/runtime details.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." },
        forceRefresh: { type: "boolean", description: "Bypass local read cache and fetch from the remote site." }
      }
    }
  },
  {
    name: "typecho.posts.list",
    description: "List recent Typecho posts from the configured site.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
        status: { type: "string" },
        search: { type: "string" },
        includeHidden: { type: "boolean" },
        forceRefresh: { type: "boolean", description: "Bypass local read cache and fetch from the remote site." }
      }
    }
  },
  {
    name: "typecho.posts.get",
    description: "Read one Typecho post by cid.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." },
        cid: { type: "integer" },
        forceRefresh: { type: "boolean", description: "Bypass local read cache and fetch from the remote site." }
      },
      required: ["cid"]
    }
  },
  {
    name: "typecho.posts.create_draft",
    description: "Create a Typecho draft post.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." },
        title: { type: "string" },
        markdown: { type: "string" },
        slug: { type: "string" },
        categories: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
        excerpt: { type: "string" }
      },
      required: ["title", "markdown"]
    }
  },
  {
    name: "typecho.posts.update",
    description: "Update a Typecho post after taking a local snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." },
        cid: { type: "integer" },
        title: { type: "string" },
        markdown: { type: "string" },
        slug: { type: "string" },
        status: { type: "string", enum: ["draft", "publish", "hidden", "waiting"] },
        categories: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["cid"]
    }
  },
  {
    name: "typecho.posts.preview_update",
    description: "Preview field and Markdown changes before updating a Typecho post.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." },
        cid: { type: "integer" },
        title: { type: "string" },
        markdown: { type: "string" },
        slug: { type: "string" },
        status: { type: "string", enum: ["draft", "publish", "hidden", "waiting"] },
        categories: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["cid"]
    }
  },
  {
    name: "typecho.posts.publish",
    description: "Publish a Typecho post after taking a local snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." },
        cid: { type: "integer" },
        confirm: { type: "boolean" },
        client: { type: "string" }
      },
      required: ["cid"]
    }
  },
  {
    name: "typecho.posts.prepare_publish",
    description: "Prepare a publish readiness report without publishing the post.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." },
        cid: { type: "integer" },
        checkLinks: { type: "boolean", default: true }
      },
      required: ["cid"]
    }
  },
  {
    name: "typecho.media.list",
    description: "List recent Typecho media attachments.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        forceRefresh: { type: "boolean", description: "Bypass local read cache and fetch from the remote site." }
      }
    }
  },
  {
    name: "typecho.media.register_external_url",
    description: "Register an already-hosted image or file URL and return a Markdown reference without uploading to the blog server.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        title: { type: "string" },
        alt: { type: "string" },
        kind: { type: "string", enum: ["image", "file"], default: "image" }
      },
      required: ["url"]
    }
  },
  {
    name: "typecho.media.upload",
    description: "Upload a local media file to Typecho and return a Markdown image reference.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." },
        filePath: { type: "string" },
        filename: { type: "string" }
      },
      required: ["filePath"]
    }
  },
  {
    name: "typecho.audit.list",
    description: "List recent local audit events.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }
      }
    }
  },
  {
    name: "typecho.policy.list",
    description: "List shared operation policy risk tiers and confirmation requirements.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "typecho.cache.status",
    description: "Inspect local read cache status for the configured Typecho site.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." }
      }
    }
  },
  {
    name: "typecho.cache.clear",
    description: "Clear local read cache for the configured Typecho site. This does not mutate the remote blog.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." },
        namespaces: { type: "array", items: { type: "string" } }
      }
    }
  },
  {
    name: "typecho.snapshots.list",
    description: "List local rollback snapshots.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "typecho.snapshots.get",
    description: "Preview a local rollback snapshot before restoring it.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Required only when restoreDiff is true." },
        restoreDiff: { type: "boolean", description: "Compare the snapshot against current remote state." },
        snapshotId: { type: "string" }
      },
      required: ["snapshotId"]
    }
  },
  {
    name: "typecho.posts.rollback",
    description: "Restore a post from a local rollback snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "SSH host alias. Defaults to TYPECHO_MCP_HOST." },
        snapshotId: { type: "string" },
        confirm: { type: "boolean" },
        client: { type: "string" }
      },
      required: ["snapshotId"]
    }
  }
];

export async function handleMcpMessage(message, context = {}) {
  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: {}
        },
        serverInfo
      }
    };
  }

  if (message.method === "notifications/initialized") {
    return null;
  }

  if (message.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        tools
      }
    };
  }

  if (message.method === "tools/call") {
    const name = message.params?.name;
    const tool = tools.find((candidate) => candidate.name === name);

    if (!tool) {
      return {
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32602,
          message: `Unknown tool: ${name}`
        }
      };
    }

    return {
      jsonrpc: "2.0",
      id: message.id,
      result: await callTool(name, message.params?.arguments || {}, context)
    };
  }

  return {
    jsonrpc: "2.0",
    id: message.id,
    error: {
      code: -32601,
      message: `Unknown method: ${message.method}`
    }
  };
}

async function callTool(name, args = {}, context = {}) {
  const host = args.host || process.env.TYPECHO_MCP_HOST;
  const operationId = context.operationId || createOperationId("mcp");

  const hostlessTools = new Set([
    "typecho.snapshots.list",
    "typecho.snapshots.get",
    "typecho.audit.list",
    "typecho.policy.list"
  ]);
  if (!host && !hostlessTools.has(name)) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "Missing SSH host. Pass host in tool arguments or set TYPECHO_MCP_HOST."
        }
      ],
      structuredContent: {
        operationId,
        code: "HOST_REQUIRED"
      }
    };
  }

  const startedAt = Date.now();
  try {
    const result = await invokeToolOperation({ name, host, args, operationId });
    await writeRequestLog({
      operationId,
      surface: "mcp",
      host,
      tool: name,
      durationMs: Date.now() - startedAt,
      timings: result.timings,
      ok: true
    }).catch(() => {});

    return {
      content: [
        {
          type: "text",
          text: toolText(name, result)
        }
      ],
      structuredContent: {
        operationId,
        ...result
      }
    };
  } catch (error) {
    const serializedError = {
      ...serializeError(error, "TOOL_CALL_FAILED"),
      operationId
    };
    await writeRequestLog({
      operationId,
      surface: "mcp",
      host,
      tool: name,
      durationMs: Date.now() - startedAt,
      timings: serializedError.timings,
      ok: false,
      error: serializedError
    }).catch(() => {});
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: error.message
        }
      ],
      structuredContent: {
        ...serializedError,
        operationId
      }
    };
  }
}

async function invokeToolOperation({ name, host, args, operationId }) {
  if (name === "typecho.site.health_check") {
    return healthCheck({ host, forceRefresh: Boolean(args.forceRefresh), operationId });
  }

  if (name === "typecho.site.get_info") {
    return getSiteInfo({ host, forceRefresh: Boolean(args.forceRefresh), operationId });
  }

  if (name === "typecho.posts.list") {
    return listPosts({
      host,
      limit: args.limit || 10,
      status: args.status,
      search: args.search,
      includeHidden: Boolean(args.includeHidden),
      forceRefresh: Boolean(args.forceRefresh),
      operationId
    });
  }

  if (name === "typecho.posts.get") {
    return getPost({ host, cid: args.cid, forceRefresh: Boolean(args.forceRefresh), operationId });
  }

  if (name === "typecho.posts.create_draft") {
    return createDraft({
      host,
      title: args.title,
      markdown: args.markdown,
      slug: args.slug,
      categories: args.categories || [],
      tags: args.tags || [],
      excerpt: args.excerpt,
      operationId
    });
  }

  if (name === "typecho.posts.update") {
    return updatePost({
      host,
      cid: args.cid,
      patch: {
        title: args.title,
        markdown: args.markdown,
        slug: args.slug,
        status: args.status,
        categories: args.categories,
        tags: args.tags
      },
      operationId
    });
  }

  if (name === "typecho.posts.preview_update") {
    return previewPostUpdate({
      host,
      cid: args.cid,
      patch: compactPatch({
        title: args.title,
        markdown: args.markdown,
        slug: args.slug,
        status: args.status,
        categories: args.categories,
        tags: args.tags
      }),
      operationId
    });
  }

  if (name === "typecho.posts.publish") {
    return publishPost({
      host,
      cid: args.cid,
      confirm: Boolean(args.confirm),
      client: args.client || "mcp",
      operationId
    });
  }

  if (name === "typecho.posts.prepare_publish") {
    return preparePublish({
      host,
      cid: args.cid,
      checkLinks: args.checkLinks !== false,
      operationId
    });
  }

  if (name === "typecho.media.list") {
    return listMedia({ host, limit: args.limit || 20, forceRefresh: Boolean(args.forceRefresh), operationId });
  }

  if (name === "typecho.media.register_external_url") {
    return registerExternalAsset({
      url: args.url,
      title: args.title,
      alt: args.alt,
      kind: args.kind || "image",
      operationId
    });
  }

  if (name === "typecho.media.upload") {
    return uploadMedia({ host, filePath: args.filePath, filename: args.filename, operationId });
  }

  if (name === "typecho.cache.status") {
    return cacheSummary({ host });
  }

  if (name === "typecho.cache.clear") {
    return clearReadCache({
      host,
      namespaces: Array.isArray(args.namespaces) ? args.namespaces : undefined,
      operationId
    });
  }

  if (name === "typecho.policy.list") {
    return listOperationPolicies();
  }

  if (name === "typecho.snapshots.list") {
    return { snapshots: await listSnapshots() };
  }

  if (name === "typecho.snapshots.get") {
    return await previewSnapshot({
      snapshotId: args.snapshotId,
      host,
      includeRestoreDiff: Boolean(args.restoreDiff),
      operationId
    });
  }

  if (name === "typecho.audit.list") {
    return { events: await listAuditEvents({ limit: args.limit || 50 }) };
  }

  if (name === "typecho.posts.rollback") {
    return rollbackPost({
      host,
      snapshotId: args.snapshotId,
      confirm: Boolean(args.confirm),
      client: args.client || "mcp",
      operationId
    });
  }

  throw new Error(`No implementation for tool: ${name}`);
}

function toolText(name, result) {
  if (name === "typecho.posts.list") {
    return `Fetched ${result.posts.length} posts from ${result.site.title || "Typecho"}.`;
  }

  if (name === "typecho.site.get_info") {
    return `Fetched site info for ${result.title || result.site?.title || "Typecho"}.`;
  }

  if (name === "typecho.posts.get") {
    return `Fetched post #${result.post.cid}: ${result.post.title}`;
  }

  if (name === "typecho.posts.create_draft") {
    return `Draft created: #${result.post.cid} ${result.post.title}`;
  }

  if (name === "typecho.posts.update") {
    return `Post updated: #${result.post.cid} ${result.post.title}`;
  }

  if (name === "typecho.posts.preview_update") {
    return `Update preview for #${result.post.cid}: ${result.changed ? "changes detected" : "no changes"}.`;
  }

  if (name === "typecho.posts.publish") {
    return `Post published: #${result.post.cid} ${result.post.title}`;
  }

  if (name === "typecho.posts.prepare_publish") {
    return `Publish report for #${result.post.cid}: ${result.ready ? "ready" : "not ready"} (${result.summary.blockers} blockers, ${result.summary.warnings} warnings).`;
  }

  if (name === "typecho.media.upload") {
    return `Uploaded media: ${result.media.url}`;
  }

  if (name === "typecho.media.register_external_url") {
    return `Registered external ${result.media.kind}: ${result.media.url}`;
  }

  if (name === "typecho.media.list") {
    return `Fetched ${result.media.length} media attachments.`;
  }

  if (name === "typecho.cache.status") {
    return `Cache status: ${result.totalEntries} local read cache entries.`;
  }

  if (name === "typecho.cache.clear") {
    return `Cleared local read cache for ${result.host}.`;
  }

  if (name === "typecho.policy.list") {
    return `Fetched ${result.operations.length} operation policy entries.`;
  }

  if (name === "typecho.snapshots.list") {
    return `Fetched ${result.snapshots.length} local snapshots.`;
  }

  if (name === "typecho.snapshots.get") {
    return `Snapshot preview ${result.snapshotId}: ${result.post?.title || "no post data"}.`;
  }

  if (name === "typecho.posts.rollback") {
    return `Post restored from snapshot ${result.restoredFromSnapshotId}.`;
  }

  if (name === "typecho.audit.list") {
    return `Fetched ${result.events.length} audit events.`;
  }

  return `Typecho health check completed for ${result.site.title || result.root}.`;
}

function compactPatch(patch) {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}
