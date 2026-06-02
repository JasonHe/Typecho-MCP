#!/usr/bin/env node

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createOperationId, serializeError } from "../../../packages/core/src/index.js";
import {
  createDraft,
  cacheSummary,
  clearReadCache,
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
} from "../../../packages/local-ops/src/index.js";
import { handleMcpMessage } from "../../../packages/mcp-server/src/protocol.js";
import { detectTargets, pickBestTarget } from "../../../packages/remote-runtime/src/index.js";
import { listAuditEvents } from "../../../packages/audit-log/src/index.js";
import { listOperationPolicies } from "../../../packages/policy/src/index.js";
import {
  listRequestLogs,
  sanitizeUrl,
  summarizeRequestLogs,
  writeRequestLog
} from "../../../packages/request-log/src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const publicDir = path.join(root, "apps/web-console/public");
const port = Number.parseInt(process.env.TYPECHO_MCP_PORT || "4783", 10);
const defaultHost = process.env.TYPECHO_MCP_HOST || "typecho-host";
const recentRequests = [];

const server = http.createServer(async (request, response) => {
  const context = {
    operationId: createOperationId("http"),
    startedAt: Date.now()
  };
  response.setHeader("x-typecho-operation-id", context.operationId);

  try {
    await route(request, response, context);
  } catch (error) {
    context.error = {
      ...serializeError(error, "INTERNAL_ERROR"),
      operationId: context.operationId
    };
    context.timings = context.error.timings || context.timings;
    sendJson(response, 500, {
      error: {
        ...context.error,
        operationId: context.operationId,
        durationMs: Date.now() - context.startedAt
      }
    }, context);
  } finally {
    const durationMs = Date.now() - context.startedAt;
    const safeUrl = sanitizeUrl(request.url);
    recentRequests.unshift({
      operationId: context.operationId,
      timestamp: new Date().toISOString(),
      method: request.method,
      url: safeUrl,
      durationMs
    });
    recentRequests.splice(50);
    writeRequestLog({
      operationId: context.operationId,
      surface: "http",
      host: context.host,
      method: request.method,
      url: request.url,
      durationMs,
      timings: context.timings,
      statusCode: context.statusCode || response.statusCode,
      ok: !context.error && (context.statusCode || response.statusCode) < 400,
      error: context.error
    }).catch(() => {});
    process.stdout.write(
      `[${new Date().toISOString()}] ${context.operationId} ${request.method} ${safeUrl} ${durationMs}ms\n`
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Typecho MCP Workbench listening on http://127.0.0.1:${port}\n`);
});

async function route(request, response, context) {
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  const host = url.searchParams.get("host") || defaultHost;
  const forceRefresh = url.searchParams.get("refresh") === "1";
  context.host = host;

  if (request.method === "GET" && url.pathname === "/api/desktop/identity") {
    sendJson(response, 200, {
      product: "typecho-mcp",
      component: "local-service",
      version: "0.1.0",
      port,
      hostAliasConfigured: Boolean(process.env.TYPECHO_MCP_HOST),
      publishPolicy: process.env.TYPECHO_MCP_PUBLISH_POLICY || "manual_approval",
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime())
    }, context);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, await healthCheck({ host, forceRefresh, operationId: context.operationId }), context);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/site") {
    sendJson(response, 200, await getSiteInfo({ host, forceRefresh, operationId: context.operationId }), context);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/diagnostics") {
    sendJson(response, 200, await runDiagnostics({ host, context }), context);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/debug-bundle") {
    sendJson(response, 200, await runDebugBundle({ host, context }), context);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/cache") {
    sendJson(response, 200, await cacheSummary({ host }), context);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/policy") {
    sendJson(response, 200, listOperationPolicies(), context);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/cache/clear") {
    const body = await readJson(request);
    sendJson(response, 200, await clearReadCache({
      host: body.host || host,
      namespaces: Array.isArray(body.namespaces) ? body.namespaces : undefined,
      operationId: context.operationId
    }), context);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/requests") {
    sendJson(
      response,
      200,
      { requests: await listRequestLogs({ limit: Number.parseInt(url.searchParams.get("limit") || "50", 10) }) },
      context
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/posts") {
    sendJson(
      response,
      200,
      await listPosts({
        host,
        limit: Number.parseInt(url.searchParams.get("limit") || "20", 10),
        status: url.searchParams.get("status") || undefined,
        search: url.searchParams.get("search") || undefined,
        includeHidden: url.searchParams.get("includeHidden") === "1",
        forceRefresh,
        operationId: context.operationId
      }),
      context
    );
    return;
  }

  const postGet = /^\/api\/posts\/(\d+)$/.exec(url.pathname);
  if (request.method === "GET" && postGet) {
    sendJson(
      response,
      200,
      await getPost({
        host,
        cid: Number.parseInt(postGet[1], 10),
        forceRefresh,
        operationId: context.operationId
      }),
      context
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/posts/draft") {
    const body = await readJson(request);
    sendJson(response, 200, await createDraft({
      ...body,
      host: body.host || host,
      operationId: context.operationId
    }), context);
    return;
  }

  const postPatch = /^\/api\/posts\/(\d+)$/.exec(url.pathname);
  if (request.method === "PATCH" && postPatch) {
    const body = await readJson(request);
    const requestHost = body.host || host;
    const { host: _ignoredHost, ...patch } = body;
    sendJson(
      response,
      200,
      await updatePost({
        host: requestHost,
        cid: Number.parseInt(postPatch[1], 10),
        patch,
        operationId: context.operationId
      }),
      context
    );
    return;
  }

  const postDiff = /^\/api\/posts\/(\d+)\/diff$/.exec(url.pathname);
  if (request.method === "POST" && postDiff) {
    const body = await readJson(request);
    sendJson(
      response,
      200,
      await previewPostUpdate({
        host,
        cid: Number.parseInt(postDiff[1], 10),
        patch: body,
        operationId: context.operationId
      }),
      context
    );
    return;
  }

  const postPreparePublish = /^\/api\/posts\/(\d+)\/publish-prepare$/.exec(url.pathname);
  if (request.method === "GET" && postPreparePublish) {
    sendJson(
      response,
      200,
      await preparePublish({
        host,
        cid: Number.parseInt(postPreparePublish[1], 10),
        checkLinks: url.searchParams.get("checkLinks") !== "0",
        operationId: context.operationId
      }),
      context
    );
    return;
  }

  const postPublish = /^\/api\/posts\/(\d+)\/publish$/.exec(url.pathname);
  if (request.method === "POST" && postPublish) {
    const body = await readJson(request);
    const requestHost = body.host || host;
    sendJson(
      response,
      200,
      await publishPost({
        host: requestHost,
        cid: Number.parseInt(postPublish[1], 10),
        confirm: Boolean(body.confirm),
        client: body.client || "web-console",
        operationId: context.operationId
      }),
      context
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/snapshots") {
    sendJson(response, 200, { snapshots: await listSnapshots() }, context);
    return;
  }

  const snapshotPreview = /^\/api\/snapshots\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && snapshotPreview) {
    sendJson(
      response,
      200,
      await previewSnapshot({
        snapshotId: snapshotPreview[1],
        host,
        includeRestoreDiff: url.searchParams.get("restoreDiff") === "1",
        operationId: context.operationId
      }),
      context
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/audit") {
    sendJson(
      response,
      200,
      { events: await listAuditEvents({ limit: Number.parseInt(url.searchParams.get("limit") || "50", 10) }) },
      context
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/rollback") {
    const body = await readJson(request);
    const requestHost = body.host || host;
    if (!body.confirm) {
      const error = new Error("Rollback requires explicit confirmation.");
      error.code = "ROLLBACK_CONFIRM_REQUIRED";
      throw error;
    }
    sendJson(
      response,
      200,
      await rollbackPost({
        host: requestHost,
        snapshotId: body.snapshotId,
        confirm: Boolean(body.confirm),
        client: body.client || "web-console",
        operationId: context.operationId
      }),
      context
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/media/upload") {
    const body = await readJson(request);
    const requestHost = body.host || host;
    sendJson(
      response,
      200,
      await uploadMedia({
        host: requestHost,
        filePath: body.filePath,
        filename: body.filename,
        operationId: context.operationId
      }),
      context
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/media") {
    sendJson(
      response,
      200,
      await listMedia({
        host,
        limit: Number.parseInt(url.searchParams.get("limit") || "20", 10),
        forceRefresh,
        operationId: context.operationId
      }),
      context
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/media/register-url") {
    const body = await readJson(request);
    sendJson(response, 200, await registerExternalAsset({
      ...body,
      operationId: context.operationId
    }), context);
    return;
  }

  if (request.method === "POST" && url.pathname === "/mcp") {
    const body = await readJson(request);
    sendJson(response, 200, await handleMcpMessage(body, { operationId: context.operationId }), context);
    return;
  }

  await serveStatic(request, response, url.pathname, context);
}

async function serveStatic(request, response, pathname, context) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED" } }, context);
    return;
  }

  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.normalize(path.join(publicDir, cleanPath));

  if (!fullPath.startsWith(publicDir)) {
    sendJson(response, 403, { error: { code: "FORBIDDEN" } }, context);
    return;
  }

  try {
    const data = await fs.readFile(fullPath);
    response.writeHead(200, {
      "content-type": contentType(fullPath),
      "cache-control": "no-store"
    });
    context.statusCode = 200;
    if (request.method !== "HEAD") {
      response.end(data);
    } else {
      response.end();
    }
  } catch {
    sendJson(response, 404, { error: { code: "NOT_FOUND" } }, context);
  }
}

async function runDiagnostics({ host, context }) {
  const checks = [];
  let detection = null;

  const check = async (name, run, summarize = (value) => value) => {
    const startedAt = Date.now();
    try {
      const value = await run();
      checks.push({
        name,
        ok: true,
        durationMs: Date.now() - startedAt,
        summary: summarize(value)
      });
      return value;
    } catch (error) {
      checks.push({
        name,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: serializeError(error, "CHECK_FAILED")
      });
      return null;
    }
  };

  detection = await check(
    "ssh.detect_targets",
    () => detectTargets({ host }),
    (value) => ({
      targetCount: value.targets.length,
      bestTarget: summarizeTarget(pickBestTarget(value.targets)),
      hostPhp: value.hostPhp
    })
  );

  const health = await check(
    "agent.health",
    () => healthCheck({ host, forceRefresh: true, operationId: context.operationId }),
    (value) => ({
      ok: value.ok,
      php: value.php?.version,
      root: value.root,
      siteTitle: value.site?.title,
      database: value.site?.database?.kind,
      databaseCompatibility: value.site?.database?.compatibility?.status,
      databaseSupportedKinds: value.site?.database?.compatibility?.supportedKinds,
      capabilities: value.capabilities
    })
  );

  await check(
    "posts.list",
    () => listPosts({ host, limit: 3, includeHidden: true, forceRefresh: true, operationId: context.operationId }),
    (value) => ({
      count: value.posts.length,
      latest: value.posts[0]
        ? {
            cid: value.posts[0].cid,
            title: value.posts[0].title,
            status: value.posts[0].status
          }
        : null
    })
  );

  await check(
    "media.list",
    () => listMedia({ host, limit: 3, forceRefresh: true, operationId: context.operationId }),
    (value) => ({
      count: value.media.length,
      latest: value.media[0]
        ? {
            cid: value.media[0].cid,
            filename: value.media[0].filename,
            mime: value.media[0].mime
          }
        : null
    })
  );

  await check(
    "snapshots.local",
    () => listSnapshots(),
    (value) => ({ count: value.length, latest: value[0]?.snapshotId || null })
  );

  await check(
    "audit.local",
    () => listAuditEvents({ limit: 5 }),
    (value) => ({ count: value.length, latest: value[0]?.action || null })
  );

  const failed = checks.filter((item) => !item.ok);

  return {
    operationId: context.operationId,
    generatedAt: new Date().toISOString(),
    host,
    ok: failed.length === 0,
    localService: {
      port,
      defaultHost,
      root,
      publicDir,
      node: process.version
    },
    target: summarizeTarget(detection ? pickBestTarget(detection.targets) : null),
    site: health?.site || null,
    checks
  };
}

async function runDebugBundle({ host, context }) {
  const [diagnostics, audit, snapshots, requestSummary, durableRequests, cache] = await Promise.all([
    runDiagnostics({ host, context }),
    listAuditEvents({ limit: 25 }),
    listSnapshots(),
    summarizeRequestLogs({ limit: 200 }),
    listRequestLogs({ limit: 50 }),
    cacheSummary({ host })
  ]);

  return {
    bundleVersion: 2,
    operationId: context.operationId,
    generatedAt: new Date().toISOString(),
    host,
    localService: {
      port,
      defaultHost,
      root,
      publicDir,
      node: process.version,
      platform: process.platform,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime())
    },
    environment: {
      TYPECHO_MCP_HOST: process.env.TYPECHO_MCP_HOST || null,
      TYPECHO_MCP_PORT: process.env.TYPECHO_MCP_PORT || null,
      TYPECHO_MCP_PUBLISH_POLICY: process.env.TYPECHO_MCP_PUBLISH_POLICY || null
    },
    database: summarizeDatabaseCompatibility(diagnostics),
    diagnostics,
    recentRequests: durableRequests.length > 0 ? durableRequests : recentRequests,
    requestSummary,
    cache,
    policy: listOperationPolicies(),
    audit,
    snapshots: snapshots.slice(0, 25)
  };
}

function summarizeDatabaseCompatibility(diagnostics) {
  const database = diagnostics?.site?.database || null;
  const compatibility = database?.compatibility || null;

  return {
    kind: database?.kind || "unknown",
    adapter: database?.adapter || null,
    prefix: database?.prefix || null,
    compatibilityStatus: compatibility?.status || "unknown",
    supported: compatibility?.supported ?? null,
    readSupported: compatibility?.readSupported ?? null,
    writeSupported: compatibility?.writeSupported ?? null,
    supportedKinds: compatibility?.supportedKinds || [],
    message: compatibility?.message || null
  };
}

function summarizeTarget(target) {
  if (!target) {
    return null;
  }

  return {
    id: target.id,
    mode: target.mode,
    confidence: target.confidence,
    container: target.container,
    image: target.image,
    hostRoot: target.hostRoot,
    containerRoot: target.containerRoot,
    php: target.php,
    markers: target.markers
  };
}

function sendJson(response, status, payload, context) {
  if (context) {
    response.setHeader("x-typecho-duration-ms", String(Date.now() - context.startedAt));
    context.statusCode = status;
    if (payload && typeof payload === "object" && Array.isArray(payload.timings)) {
      context.timings = payload.timings;
    }
  }
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function contentType(filePath) {
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  return "text/html; charset=utf-8";
}
