import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  annotateError,
  attachTimings,
  createOperationId,
  createTiming,
  createTypedError,
  errorTypes,
  mergeTimings,
  timingStages
} from "../../core/src/index.js";
import { normalizeExternalAsset } from "../../asset-providers/src/index.js";
import { writeAuditEvent } from "../../audit-log/src/index.js";
import { callAgentAuto } from "../../remote-runtime/src/index.js";
import { assertOperationAllowed, operationTypes } from "../../policy/src/index.js";

const cacheRoot = path.join(os.homedir(), ".typecho-mcp-workbench");
const readCacheTtls = Object.freeze({
  health: 30_000,
  siteInfo: 5 * 60_000,
  postsList: 30_000,
  postDetail: 10 * 60_000,
  mediaList: 60_000
});
const maxPreciseDiffCells = 120_000;

export async function healthCheck({ host, forceRefresh = false, operationId } = {}) {
  return cachedRead({
    host,
    namespace: "health",
    key: "default",
    ttlMs: readCacheTtls.health,
    forceRefresh,
    operationId,
    read: () => callAgentAuto({ host, method: "system.health", operationId })
  });
}

export async function getSiteInfo({ host, forceRefresh = false, operationId } = {}) {
  return cachedRead({
    host,
    namespace: "site-info",
    key: "default",
    ttlMs: readCacheTtls.siteInfo,
    forceRefresh,
    operationId,
    read: () => callAgentAuto({ host, method: "site.info", operationId })
  });
}

export async function listPosts({
  host,
  limit = 10,
  status,
  search,
  includeHidden = false,
  forceRefresh = false,
  operationId
}) {
  return cachedRead({
    host,
    namespace: "posts-list",
    key: stableKey({ limit, status, search, includeHidden }),
    ttlMs: readCacheTtls.postsList,
    forceRefresh,
    operationId,
    read: () =>
      callAgentAuto({
        host,
        method: "posts.list",
        params: { limit, status, search, includeHidden },
        operationId
      })
  });
}

export async function getPost({ host, cid, forceRefresh = false, operationId }) {
  return cachedRead({
    host,
    namespace: "posts",
    key: String(cid),
    ttlMs: readCacheTtls.postDetail,
    forceRefresh,
    operationId,
    read: () =>
      callAgentAuto({
        host,
        method: "posts.get",
        params: { cid },
        operationId
      })
  });
}

export async function createDraft({ host, title, markdown, slug, tags = [], categories = [], excerpt, operationId }) {
  const policy = assertOperationAllowed({
    operation: operationTypes.postsCreateDraft
  });
  const result = await callAgentAuto({
    host,
    method: "posts.createDraft",
    params: {
      title,
      markdown,
      slug,
      tags,
      categories,
      excerpt
    },
    operationId
  });

  await writeAuditEvent({
    operationId,
    action: "posts.createDraft",
    host,
    entityType: "post",
    entityId: result.post?.cid,
    input: { title, slug, tags, categories },
    policy
  });

  await invalidateHostCache({ host, namespaces: ["posts-list"] });
  await writeCache({ host, namespace: "posts", key: String(result.post?.cid), value: result });
  return result;
}

export async function updatePost({ host, cid, patch, operationId }) {
  const snapshot = await snapshotPost({ host, cid, reason: "before_update", operationId });
  const policy = assertOperationAllowed({
    operation: operationTypes.postsUpdate,
    hasSnapshot: Boolean(snapshot.snapshotId)
  });
  const result = await callAgentAuto({
    host,
    method: "posts.update",
    params: {
      cid,
      ...patch
    },
    operationId
  });

  const payload = {
    ...result,
    snapshotId: snapshot.snapshotId
  };

  await writeAuditEvent({
    operationId,
    action: "posts.update",
    host,
    entityType: "post",
    entityId: cid,
    snapshotId: snapshot.snapshotId,
    input: patch,
    policy
  });

  await invalidateHostCache({ host, namespaces: ["posts-list"] });
  await writeCache({ host, namespace: "posts", key: String(cid), value: result });
  return payload;
}

export async function publishPost({ host, cid, confirm = false, client = "unknown", operationId }) {
  const policy = assertOperationAllowed({
    operation: operationTypes.postsPublish,
    confirm,
    client
  });
  const snapshot = await snapshotPost({ host, cid, reason: "before_publish", operationId });
  const result = await callAgentAuto({
    host,
    method: "posts.publish",
    params: { cid },
    operationId
  });

  const payload = {
    ...result,
    snapshotId: snapshot.snapshotId
  };

  await writeAuditEvent({
    operationId,
    action: "posts.publish",
    host,
    entityType: "post",
    entityId: cid,
    snapshotId: snapshot.snapshotId,
    policy
  });

  await invalidateHostCache({ host, namespaces: ["posts-list"] });
  await writeCache({ host, namespace: "posts", key: String(cid), value: result });
  return payload;
}

export async function preparePublish({ host, cid, checkLinks = true, operationId }) {
  const policy = assertOperationAllowed({
    operation: operationTypes.postsPreparePublish
  });
  const data = await getPost({ host, cid, forceRefresh: true, operationId });
  const post = data.post;
  const markdown = stripMarkdownMarker(post.text || "");
  const links = extractMarkdownLinks(markdown);
  const images = links.filter((link) => link.kind === "image");
  const externalLinks = links.filter((link) => link.kind === "link");
  const checks = [
    checkItem("title", Boolean(post.title?.trim()), "Post has a title."),
    checkItem("slug", Boolean(post.slug?.trim()), "Post has a slug."),
    checkItem("content", Boolean(markdown.trim()), "Post body is not empty."),
    checkItem("category", (post.categories || []).length > 0, "At least one category is assigned."),
    checkItem("tags", (post.tags || []).length > 0, "At least one tag is assigned.", "warning"),
    checkItem("status", post.status !== "publish", `Current status is ${post.status}.`, "warning"),
    checkItem("snapshot", true, "Publishing will create a before_publish snapshot.")
  ];

  const assets = checkLinks ? await checkMarkdownAssets(images) : images.map((link) => ({ ...link, ok: null }));
  for (const asset of assets) {
    checks.push(
      checkItem(
        `asset:${asset.url}`,
        asset.ok !== false,
        asset.ok === null
          ? "Image URL was not checked."
          : asset.ok
            ? `Image URL is reachable${asset.status ? ` (${asset.status})` : ""}.`
            : `Image URL check failed${asset.error ? `: ${asset.error}` : ""}.`,
        "warning"
      )
    );
  }

  const blockers = checks.filter((check) => check.severity === "blocker" && !check.ok);
  const warnings = checks.filter((check) => check.severity === "warning" && !check.ok);
  const report = {
    host,
    generatedAt: new Date().toISOString(),
    ready: blockers.length === 0,
    post: {
      cid: post.cid,
      title: post.title,
      slug: post.slug,
      status: post.status,
      categories: post.categories || [],
      tags: post.tags || [],
      modified: post.modified,
      markdownLength: markdown.length
    },
    summary: {
      blockers: blockers.length,
      warnings: warnings.length,
      images: images.length,
      externalLinks: externalLinks.length
    },
    checks,
    assets,
    externalLinks,
    nextAction:
      blockers.length === 0
        ? "Review the report, then publish with confirm=true if the warnings are acceptable."
        : "Fix blocker checks before publishing."
  };

  await writeAuditEvent({
    operationId,
    action: "posts.preparePublish",
    host,
    entityType: "post",
    entityId: cid,
    input: {
      checkLinks,
      ready: report.ready,
      blockers: blockers.length,
      warnings: warnings.length
    },
    policy
  });

  return report;
}

export async function previewPostUpdate({ host, cid, patch, operationId }) {
  const data = await getPost({ host, cid, forceRefresh: true, operationId });
  const post = data.post;
  const currentMarkdown = stripMarkdownMarker(post.text || "");
  const nextMarkdown = Object.hasOwn(patch, "markdown") ? String(patch.markdown || "") : currentMarkdown;
  const fields = [
    compareField("title", post.title || "", patch.title ?? post.title ?? ""),
    compareField("slug", post.slug || "", patch.slug ?? post.slug ?? ""),
    compareField("status", post.status || "", patch.status ?? post.status ?? ""),
    compareField("categories", post.categories || [], patch.categories ?? post.categories ?? []),
    compareField("tags", post.tags || [], patch.tags ?? post.tags ?? [])
  ];
  const markdown = summarizeLineDiff(currentMarkdown, nextMarkdown);
  const changedFields = fields.filter((field) => field.changed);

  return {
    host,
    generatedAt: new Date().toISOString(),
    post: {
      cid: post.cid,
      title: post.title,
      slug: post.slug,
      status: post.status
    },
    changed: changedFields.length > 0 || markdown.changed,
    fields,
    markdown
  };
}

export async function previewSnapshot({ snapshotId, host, includeRestoreDiff = false, operationId }) {
  const snapshot = await readSnapshot(snapshotId);
  const post = snapshot.data.post;
  const markdown = stripMarkdownMarker(post?.text || "");
  let restoreDiff = null;

  if (includeRestoreDiff && host && post?.cid) {
    const current = await getPost({ host, cid: post.cid, forceRefresh: true, operationId });
    restoreDiff = summarizePostDiff(current.post, post);
  }

  return {
    snapshotId,
    host: snapshot.host,
    reason: snapshot.reason,
    createdAt: snapshot.createdAt,
    entityType: snapshot.entityType,
    entityId: snapshot.entityId,
    post: post
      ? {
          cid: post.cid,
          title: post.title,
          slug: post.slug,
          status: post.status,
          categories: post.categories || [],
          tags: post.tags || [],
          markdownLength: markdown.length,
          markdownLines: markdown.split(/\r?\n/).length,
          excerpt: markdown.split(/\r?\n/).filter(Boolean).slice(0, 6).join("\n")
        }
      : null,
    restoreDiff
  };
}

export async function uploadMedia({ host, filePath, filename, operationId }) {
  const localStartedAt = Date.now();
  const policy = assertOperationAllowed({
    operation: operationTypes.mediaUpload
  });
  let body;

  try {
    body = await fs.readFile(filePath);
  } catch (error) {
    throw annotateError(error, {
      code: "LOCAL_FILE_READ_FAILED",
      type: errorTypes.localOps,
      stage: timingStages.local,
      retryable: false,
      operationId,
      timings: [createTiming(timingStages.local, localStartedAt, { operation: "media.upload.readFile" })]
    });
  }

  const result = await callAgentAuto({
    host,
    method: "media.upload",
    params: {
      filename: filename || path.basename(filePath),
      base64: body.toString("base64")
    },
    operationId
  });

  await writeAuditEvent({
    operationId,
    action: "media.upload",
    host,
    entityType: "media",
    entityId: result.media?.cid,
    input: { filePath, filename },
    policy
  });

  await invalidateHostCache({ host, namespaces: ["media-list"] });
  return attachTimings(
    result,
    createTiming(timingStages.local, localStartedAt, { operation: "media.upload" })
  );
}

export async function registerExternalAsset({ url, title, alt, kind, operationId }) {
  const localStartedAt = Date.now();
  const policy = assertOperationAllowed({
    operation: operationTypes.mediaRegisterExternalUrl
  });
  let result;

  try {
    result = normalizeExternalAsset({ url, title, alt, kind });
  } catch (error) {
    throw annotateError(error, {
      code: "ASSET_URL_INVALID",
      type: errorTypes.assetNetwork,
      stage: timingStages.local,
      retryable: false,
      operationId,
      timings: [createTiming(timingStages.local, localStartedAt, { operation: "media.registerExternalUrl" })]
    });
  }

  await writeAuditEvent({
    operationId,
    action: "media.registerExternalUrl",
    entityType: "media",
    entityId: url,
    input: { url, title, alt, kind },
    policy
  });

  return attachTimings(
    result,
    createTiming(timingStages.local, localStartedAt, { operation: "media.registerExternalUrl" })
  );
}

export async function listMedia({ host, limit = 20, forceRefresh = false, operationId }) {
  return cachedRead({
    host,
    namespace: "media-list",
    key: stableKey({ limit }),
    ttlMs: readCacheTtls.mediaList,
    forceRefresh,
    operationId,
    read: () =>
      callAgentAuto({
        host,
        method: "media.list",
        params: { limit },
        operationId
      })
  });
}

export async function rollbackPost({ host, snapshotId, confirm = false, client = "unknown", operationId }) {
  const policy = assertOperationAllowed({
    operation: operationTypes.postsRollback,
    confirm,
    client
  });
  const snapshot = await readSnapshot(snapshotId);
  const post = snapshot.data.post;

  if (!post?.cid) {
    throw new Error(`Snapshot ${snapshotId} does not contain a post.`);
  }

  const result = await callAgentAuto({
    host,
    method: "posts.update",
    params: {
      cid: post.cid,
      title: post.title,
      markdown: post.text,
      slug: post.slug,
      status: post.status,
      allowComment: post.allowComment,
      allowPing: post.allowPing,
      allowFeed: post.allowFeed,
      categories: post.categories || [],
      tags: post.tags || []
    },
    operationId
  });

  const payload = {
    ...result,
    restoredFromSnapshotId: snapshotId
  };

  await writeAuditEvent({
    operationId,
    action: "posts.rollback",
    host,
    entityType: "post",
    entityId: post.cid,
    snapshotId,
    policy
  });

  await invalidateHostCache({ host, namespaces: ["posts-list"] });
  await writeCache({ host, namespace: "posts", key: String(post.cid), value: result });
  return payload;
}

export async function listSnapshots() {
  await fs.mkdir(snapshotDir(), { recursive: true });
  const files = await fs.readdir(snapshotDir());
  const snapshots = [];

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const fullPath = path.join(snapshotDir(), file);
    const payload = JSON.parse(await fs.readFile(fullPath, "utf8"));
    snapshots.push({
      snapshotId: payload.snapshotId,
      host: payload.host,
      reason: payload.reason,
      entityType: payload.entityType,
      entityId: payload.entityId,
      createdAt: payload.createdAt
    });
  }

  return snapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function snapshotPost({ host, cid, reason, operationId }) {
  const data = await getPost({ host, cid, forceRefresh: true, operationId });
  const snapshot = {
    snapshotId: createOperationId("snap"),
    operationId,
    host,
    reason,
    entityType: "post",
    entityId: String(cid),
    createdAt: new Date().toISOString(),
    data
  };

  await fs.mkdir(snapshotDir(), { recursive: true });
  await fs.writeFile(
    path.join(snapshotDir(), `${snapshot.snapshotId}.json`),
    JSON.stringify(snapshot, null, 2)
  );

  return snapshot;
}

export async function readSnapshot(snapshotId) {
  return JSON.parse(await fs.readFile(path.join(snapshotDir(), `${snapshotId}.json`), "utf8"));
}

export async function listCacheEntries({ host } = {}) {
  const entries = [];
  const root = host ? cacheDir({ host }) : path.join(cacheRoot, "cache");

  try {
    await fs.mkdir(root, { recursive: true });
    await walkCache(root, async (filePath) => {
      if (!filePath.endsWith(".json")) {
        return;
      }

      const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
      const stats = await fs.stat(filePath);
      const cachedAt = payload.createdAt || stats.mtime.toISOString();
      const namespace = path.basename(path.dirname(filePath));
      const keyFile = path.basename(filePath, ".json");
      const ageMs = Date.now() - Date.parse(cachedAt);
      const ttlMs = ttlForNamespace(namespace);

      entries.push({
        host: host || inferHostFromCachePath(filePath),
        namespace,
        key: unsafeCacheName(keyFile),
        keyFile,
        cachedAt,
        ageMs: Number.isFinite(ageMs) ? ageMs : null,
        ttlMs,
        expired: Number.isFinite(ageMs) && ageMs > ttlMs
      });
    });
  } catch {
    return [];
  }

  return entries.sort((left, right) => String(right.cachedAt).localeCompare(String(left.cachedAt)));
}

export async function cacheSummary({ host } = {}) {
  const entries = await listCacheEntries({ host });
  const byNamespace = {};

  for (const entry of entries) {
    byNamespace[entry.namespace] = byNamespace[entry.namespace] || {
      entries: 0,
      expired: 0,
      newestCachedAt: null
    };
    byNamespace[entry.namespace].entries += 1;
    if (entry.expired) {
      byNamespace[entry.namespace].expired += 1;
    }
    if (!byNamespace[entry.namespace].newestCachedAt || entry.cachedAt > byNamespace[entry.namespace].newestCachedAt) {
      byNamespace[entry.namespace].newestCachedAt = entry.cachedAt;
    }
  }

  return {
    host: host || null,
    generatedAt: new Date().toISOString(),
    totalEntries: entries.length,
    byNamespace,
    entries: entries.slice(0, 50)
  };
}

export async function clearReadCache({ host, namespaces, operationId } = {}) {
  const startedAt = Date.now();
  if (!host) {
    throw createTypedError("clearReadCache requires host.", {
      code: "CACHE_HOST_REQUIRED",
      type: errorTypes.cache,
      stage: timingStages.cache,
      retryable: false,
      operationId,
      timings: [createTiming(timingStages.cache, startedAt, { operation: "cache.clear" })]
    });
  }

  const policy = assertOperationAllowed({
    operation: operationTypes.cacheClear
  });

  try {
    if (Array.isArray(namespaces) && namespaces.length > 0) {
      await invalidateHostCache({ host, namespaces });
    } else {
      await fs.rm(cacheDir({ host }), { recursive: true, force: true });
    }
  } catch (error) {
    throw annotateError(error, {
      code: "CACHE_CLEAR_FAILED",
      type: errorTypes.cache,
      stage: timingStages.cache,
      retryable: true,
      operationId,
      timings: [createTiming(timingStages.cache, startedAt, { operation: "cache.clear" })]
    });
  }

  await writeAuditEvent({
    operationId,
    action: "cache.clear",
    host,
    entityType: "cache",
    entityId: Array.isArray(namespaces) && namespaces.length > 0 ? namespaces.join(",") : "*",
    input: { namespaces },
    policy
  });

  return attachTimings(
    {
      host,
      clearedAt: new Date().toISOString(),
      namespaces: Array.isArray(namespaces) && namespaces.length > 0 ? namespaces : ["*"],
      policy
    },
    createTiming(timingStages.cache, startedAt, { operation: "cache.clear" })
  );
}

function snapshotDir() {
  return path.join(cacheRoot, "snapshots");
}

async function cachedRead({ host, namespace, key, ttlMs, forceRefresh, operationId, read }) {
  const localStartedAt = Date.now();
  const timings = [];

  try {
    if (!forceRefresh) {
      const cacheStartedAt = Date.now();
      const cached = await readCache({ host, namespace, key, ttlMs });
      timings.push(
        createTiming(timingStages.cache, cacheStartedAt, {
          namespace,
          key,
          hit: cached.hit
        })
      );

      if (cached.hit) {
        return attachTimings(
          withCacheMetadata(stripTimings(cached.value), {
            hit: true,
            source: "cache",
            remoteFresh: false,
            namespace,
            key,
            cachedAt: cached.cachedAt,
            ageMs: cached.ageMs,
            ttlMs,
            expired: false
          }),
          mergeTimings(
            timings,
            createTiming(timingStages.local, localStartedAt, { operation: "cachedRead", namespace })
          )
        );
      }
    }

    const value = await read();
    const cachedAt = new Date().toISOString();
    const cacheWriteStartedAt = Date.now();
    await writeCache({ host, namespace, key, value, cachedAt });
    timings.push(
      createTiming(timingStages.cache, cacheWriteStartedAt, {
        namespace,
        key,
        write: true
      })
    );

    return attachTimings(
      withCacheMetadata(value, {
        hit: false,
        source: "remote",
        remoteFresh: true,
        namespace,
        key,
        cachedAt,
        ageMs: 0,
        ttlMs,
        expired: false
      }),
      mergeTimings(
        timings,
        createTiming(timingStages.local, localStartedAt, { operation: "cachedRead", namespace })
      )
    );
  } catch (error) {
    throw annotateError(error, {
      code: error.code || "LOCAL_READ_FAILED",
      type: error.type || errorTypes.localOps,
      stage: error.stage || timingStages.local,
      operationId: error.operationId || operationId,
      timings: mergeTimings(
        error.timings,
        timings,
        createTiming(timingStages.local, localStartedAt, { operation: "cachedRead", namespace })
      )
    });
  }
}

async function readCache({ host, namespace, key, ttlMs }) {
  try {
    const fullPath = cachePath({ host, namespace, key });
    const payload = JSON.parse(await fs.readFile(fullPath, "utf8"));
    const createdAtMs = Date.parse(payload.createdAt);
    const ageMs = Number.isFinite(createdAtMs) ? Date.now() - createdAtMs : Number.POSITIVE_INFINITY;

    if (ageMs > ttlMs) {
      return { hit: false };
    }

    return {
      hit: true,
      value: payload.value,
      cachedAt: payload.createdAt,
      ageMs
    };
  } catch {
    return { hit: false };
  }
}

async function writeCache({ host, namespace, key, value, cachedAt = new Date().toISOString() }) {
  if (!host || key === "undefined") {
    return;
  }

  const fullPath = cachePath({ host, namespace, key });
  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(
      fullPath,
      JSON.stringify(
        {
          createdAt: cachedAt,
          value: stripTimings(value)
        },
        null,
        2
      )
    );
  } catch (error) {
    throw annotateError(error, {
      code: "CACHE_WRITE_FAILED",
      type: errorTypes.cache,
      stage: timingStages.cache,
      retryable: true
    });
  }
}

async function invalidateHostCache({ host, namespaces }) {
  if (!host) {
    return;
  }

  try {
    await Promise.all(
      namespaces.map(async (namespace) => {
        await fs.rm(path.join(cacheDir({ host }), namespace), {
          recursive: true,
          force: true
        });
      })
    );
  } catch (error) {
    throw annotateError(error, {
      code: "CACHE_INVALIDATE_FAILED",
      type: errorTypes.cache,
      stage: timingStages.cache,
      retryable: true
    });
  }
}

function cachePath({ host, namespace, key }) {
  return path.join(cacheDir({ host }), namespace, `${safeCacheName(key)}.json`);
}

function cacheDir({ host }) {
  return path.join(cacheRoot, "cache", safeCacheName(host));
}

function safeCacheName(value) {
  return Buffer.from(String(value)).toString("base64url");
}

function unsafeCacheName(value) {
  try {
    return Buffer.from(String(value), "base64url").toString();
  } catch {
    return String(value);
  }
}

function stableKey(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

function withCacheMetadata(value, cache) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      ...value,
      cache
    };
  }

  return {
    value,
    cache
  };
}

function stripTimings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const { timings: _timings, ...rest } = value;
  return rest;
}

function compareField(name, before, after) {
  const normalizedBefore = Array.isArray(before) ? before : String(before ?? "");
  const normalizedAfter = Array.isArray(after) ? after : String(after ?? "");
  return {
    name,
    before: normalizedBefore,
    after: normalizedAfter,
    changed: JSON.stringify(normalizedBefore) !== JSON.stringify(normalizedAfter)
  };
}

function summarizePostDiff(beforePost, afterPost) {
  const beforeMarkdown = stripMarkdownMarker(beforePost?.text || "");
  const afterMarkdown = stripMarkdownMarker(afterPost?.text || "");
  const fields = [
    compareField("title", beforePost?.title || "", afterPost?.title || ""),
    compareField("slug", beforePost?.slug || "", afterPost?.slug || ""),
    compareField("status", beforePost?.status || "", afterPost?.status || ""),
    compareField("categories", beforePost?.categories || [], afterPost?.categories || []),
    compareField("tags", beforePost?.tags || [], afterPost?.tags || [])
  ];
  const markdown = summarizeLineDiff(beforeMarkdown, afterMarkdown);

  return {
    changed: fields.some((field) => field.changed) || markdown.changed,
    fields,
    markdown
  };
}

function summarizeLineDiff(before, after) {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);

  if ((beforeLines.length + 1) * (afterLines.length + 1) > maxPreciseDiffCells) {
    return summarizeLargeLineDiff({ before, after, beforeLines, afterLines });
  }

  const operations = diffLines(beforeLines, afterLines);
  const added = operations.filter((item) => item.type === "add").map((item) => item.line);
  const removed = operations.filter((item) => item.type === "remove").map((item) => item.line);

  return {
    changed: before !== after,
    beforeLength: before.length,
    afterLength: after.length,
    beforeLines: beforeLines.length,
    afterLines: afterLines.length,
    addedLines: added.length,
    removedLines: removed.length,
    addedPreview: added.filter(Boolean).slice(0, 12),
    removedPreview: removed.filter(Boolean).slice(0, 12),
    hunks: summarizeDiffHunks(operations)
  };
}

function summarizeLargeLineDiff({ before, after, beforeLines, afterLines }) {
  const beforeSet = countLines(beforeLines);
  const afterSet = countLines(afterLines);
  const added = [];
  const removed = [];

  for (const [line, count] of afterSet.entries()) {
    const delta = count - (beforeSet.get(line) || 0);
    for (let index = 0; index < delta; index += 1) {
      added.push(line);
    }
  }

  for (const [line, count] of beforeSet.entries()) {
    const delta = count - (afterSet.get(line) || 0);
    for (let index = 0; index < delta; index += 1) {
      removed.push(line);
    }
  }

  return {
    changed: before !== after,
    beforeLength: before.length,
    afterLength: after.length,
    beforeLines: beforeLines.length,
    afterLines: afterLines.length,
    addedLines: added.length,
    removedLines: removed.length,
    addedPreview: added.filter(Boolean).slice(0, 12),
    removedPreview: removed.filter(Boolean).slice(0, 12),
    hunks: [],
    truncated: true,
    reason: "Diff is large; exact line hunks were skipped to keep preview responsive."
  };
}

function splitLines(value) {
  if (value === "") {
    return [];
  }
  return value.split(/\r?\n/);
}

function diffLines(beforeLines, afterLines) {
  const rows = beforeLines.length + 1;
  const cols = afterLines.length + 1;
  const table = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let left = beforeLines.length - 1; left >= 0; left -= 1) {
    for (let right = afterLines.length - 1; right >= 0; right -= 1) {
      table[left][right] =
        beforeLines[left] === afterLines[right]
          ? table[left + 1][right + 1] + 1
          : Math.max(table[left + 1][right], table[left][right + 1]);
    }
  }

  const operations = [];
  let left = 0;
  let right = 0;

  while (left < beforeLines.length && right < afterLines.length) {
    if (beforeLines[left] === afterLines[right]) {
      operations.push({ type: "context", line: beforeLines[left], beforeLine: left + 1, afterLine: right + 1 });
      left += 1;
      right += 1;
    } else if (table[left + 1][right] >= table[left][right + 1]) {
      operations.push({ type: "remove", line: beforeLines[left], beforeLine: left + 1, afterLine: right + 1 });
      left += 1;
    } else {
      operations.push({ type: "add", line: afterLines[right], beforeLine: left + 1, afterLine: right + 1 });
      right += 1;
    }
  }

  while (left < beforeLines.length) {
    operations.push({ type: "remove", line: beforeLines[left], beforeLine: left + 1, afterLine: right + 1 });
    left += 1;
  }

  while (right < afterLines.length) {
    operations.push({ type: "add", line: afterLines[right], beforeLine: left + 1, afterLine: right + 1 });
    right += 1;
  }

  return operations;
}

function countLines(lines) {
  const counts = new Map();
  for (const line of lines) {
    counts.set(line, (counts.get(line) || 0) + 1);
  }
  return counts;
}

function summarizeDiffHunks(operations) {
  const changedIndexes = operations
    .map((item, index) => (item.type === "context" ? null : index))
    .filter((index) => index !== null);
  const hunks = [];

  for (const index of changedIndexes) {
    const start = Math.max(0, index - 2);
    const end = Math.min(operations.length, index + 3);
    const previous = hunks[hunks.length - 1];
    if (previous && start <= previous.end) {
      previous.end = Math.max(previous.end, end);
    } else {
      hunks.push({ start, end });
    }
  }

  return hunks.slice(0, 6).map((hunk) => ({
    beforeStart: operations[hunk.start]?.beforeLine || 1,
    afterStart: operations[hunk.start]?.afterLine || 1,
    lines: operations.slice(hunk.start, hunk.end).map((item) => ({
      type: item.type,
      text: item.line
    }))
  }));
}

function stripMarkdownMarker(text) {
  return text.startsWith("<!--markdown-->") ? text.slice("<!--markdown-->".length) : text;
}

function checkItem(name, ok, message, severity = "blocker") {
  return {
    name,
    ok,
    severity,
    message
  };
}

function extractMarkdownLinks(markdown) {
  const links = [];
  const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const linkPattern = /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  for (const match of markdown.matchAll(imagePattern)) {
    links.push({
      kind: "image",
      alt: match[1],
      url: match[2]
    });
  }

  for (const match of markdown.matchAll(linkPattern)) {
    links.push({
      kind: "link",
      label: match[1],
      url: match[2]
    });
  }

  return links;
}

async function checkMarkdownAssets(images) {
  return Promise.all(
    images.map(async (image) => {
      if (!/^https?:\/\//i.test(image.url)) {
        return {
          ...image,
          ok: null,
          status: null,
          error: "Only http(s) image URLs are checked."
        };
      }

      return {
        ...image,
        ...(await checkUrl(image.url))
      };
    })
  );
}

async function checkUrl(url) {
  if (typeof fetch !== "function") {
    return { ok: null, status: null, error: "fetch is not available in this Node runtime." };
  }

  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5_000)
    });

    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(5_000)
      });
    }

    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type")
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error.message
    };
  }
}

async function walkCache(dir, visit) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkCache(fullPath, visit);
    } else {
      await visit(fullPath);
    }
  }
}

function ttlForNamespace(namespace) {
  const map = {
    health: readCacheTtls.health,
    "site-info": readCacheTtls.siteInfo,
    "posts-list": readCacheTtls.postsList,
    posts: readCacheTtls.postDetail,
    "media-list": readCacheTtls.mediaList
  };
  return map[namespace] || 0;
}

function inferHostFromCachePath(filePath) {
  const parts = filePath.split(path.sep);
  const cacheIndex = parts.lastIndexOf("cache");
  return cacheIndex >= 0 && parts[cacheIndex + 1] ? unsafeCacheName(parts[cacheIndex + 1]) : null;
}
