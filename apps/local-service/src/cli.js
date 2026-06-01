#!/usr/bin/env node

import {
  detectTargets,
  pickBestTarget
} from "../../../packages/remote-runtime/src/index.js";
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
} from "../../../packages/local-ops/src/index.js";
import { listAuditEvents } from "../../../packages/audit-log/src/index.js";
import { createOperationId, serializeError } from "../../../packages/core/src/index.js";
import { listRequestLogs, writeRequestLog } from "../../../packages/request-log/src/index.js";
import { listOperationPolicies } from "../../../packages/policy/src/index.js";

function parseArgs(argv) {
  const options = {};
  const rest = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith("--")) {
      const key = value.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        options[key] = true;
      } else {
        options[key] = next;
        index += 1;
      }
    } else {
      rest.push(value);
    }
  }

  return { command: rest[0], options };
}

function printJson(value) {
  if (value && typeof value === "object" && Array.isArray(value.timings)) {
    cliContext.timings = value.timings;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function resolveTarget(host) {
  const detection = await detectTargets({ host });
  const target = pickBestTarget(detection.targets);

  if (!target) {
    throw new Error(`No Typecho execution target was detected on ${host}.`);
  }

  return { detection, target };
}

const cliContext = {
  operationId: createOperationId("cli"),
  startedAt: Date.now(),
  command: null,
  host: null,
  ok: false,
  timings: null,
  error: null
};

try {
  await main(cliContext);
  cliContext.ok = true;
} catch (error) {
  cliContext.error = {
    ...serializeError(error, "CLI_FAILED"),
    operationId: cliContext.operationId
  };
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
} finally {
  await writeRequestLog({
    operationId: cliContext.operationId,
    surface: "cli",
    host: cliContext.host,
    command: cliContext.command,
    durationMs: Date.now() - cliContext.startedAt,
    timings: cliContext.timings || cliContext.error?.timings,
    ok: cliContext.ok,
    error: cliContext.error
  }).catch(() => {});
}

async function main(context) {
  const { command, options } = parseArgs(process.argv.slice(2));
  const host = options.host || process.env.TYPECHO_MCP_HOST;
  context.command = command || "help";
  context.host = host || null;

  if (!command || command === "help" || options.help) {
    process.stdout.write(`Typecho MCP local service prototype

Usage:
  node apps/local-service/src/cli.js probe --host <ssh-host>
  node apps/local-service/src/cli.js agent:health --host <ssh-host> [--refresh]
  node apps/local-service/src/cli.js site:info --host <ssh-host> [--refresh]
  node apps/local-service/src/cli.js posts:list --host <ssh-host> [--limit 10] [--refresh]
  node apps/local-service/src/cli.js posts:get --host <ssh-host> --cid <cid> [--refresh]
  node apps/local-service/src/cli.js posts:create-draft --host <ssh-host> --title <title> --markdown <markdown>
  node apps/local-service/src/cli.js posts:preview-update --host <ssh-host> --cid <cid> [--title <title>] [--markdown <markdown>] [--status draft]
  node apps/local-service/src/cli.js posts:update --host <ssh-host> --cid <cid> [--title <title>] [--markdown <markdown>] [--status draft]
  node apps/local-service/src/cli.js posts:prepare-publish --host <ssh-host> --cid <cid> [--skip-link-checks]
  node apps/local-service/src/cli.js posts:publish --host <ssh-host> --cid <cid>
  node apps/local-service/src/cli.js snapshots:list --host <ssh-host>
  node apps/local-service/src/cli.js snapshots:get --snapshot-id <snapshotId> [--host <ssh-host>] [--restore-diff]
  node apps/local-service/src/cli.js posts:rollback --host <ssh-host> --snapshot-id <snapshotId> --confirm
  node apps/local-service/src/cli.js media:list --host <ssh-host> [--limit 20] [--refresh]
  node apps/local-service/src/cli.js media:upload --host <ssh-host> --file <path>
  node apps/local-service/src/cli.js media:register-url --url <https-url> [--kind image|file]
  node apps/local-service/src/cli.js audit:list [--limit 50]
  node apps/local-service/src/cli.js requests:list [--limit 50]
  node apps/local-service/src/cli.js policy:list
  node apps/local-service/src/cli.js cache:status --host <ssh-host>
  node apps/local-service/src/cli.js cache:clear --host <ssh-host> [--namespaces posts,posts-list]
  node apps/local-service/src/cli.js release:check --host <ssh-host> [--publish-cid <cid>]

Environment:
  TYPECHO_MCP_HOST can provide the default SSH host.
`);
    return;
  }

  const hostlessCommands = new Set([
    "media:register-url",
    "audit:list",
    "requests:list",
    "policy:list",
    "snapshots:list",
    "snapshots:get"
  ]);
  const forceRefresh = Boolean(options.refresh);
  if (!host && !hostlessCommands.has(command)) {
    throw new Error("Missing --host or TYPECHO_MCP_HOST.");
  }

  if (command === "probe") {
    printJson(await detectTargets({ host }));
    return;
  }

  if (command === "agent:health") {
    printJson(await healthCheck({ host, forceRefresh, operationId: context.operationId }));
    return;
  }

  if (command === "site:info") {
    printJson(await getSiteInfo({ host, forceRefresh, operationId: context.operationId }));
    return;
  }

  if (command === "posts:list") {
    printJson(
      await listPosts({
        host,
        limit: Number.parseInt(options.limit || "10", 10),
        status: options.status,
        search: options.search,
        includeHidden: Boolean(options["include-hidden"]),
        forceRefresh,
        operationId: context.operationId
      })
    );
    return;
  }

  if (command === "posts:get") {
    if (!options.cid) {
      throw new Error("posts:get requires --cid.");
    }

    printJson(await getPost({
      host,
      cid: Number.parseInt(options.cid, 10),
      forceRefresh,
      operationId: context.operationId
    }));
    return;
  }

  if (command === "posts:create-draft") {
    if (!options.title || !options.markdown) {
      throw new Error("posts:create-draft requires --title and --markdown.");
    }

    printJson(
      await createDraft({
        host,
        title: options.title,
        markdown: options.markdown,
        slug: options.slug,
        tags: splitCsv(options.tags),
        categories: splitCsv(options.categories),
        excerpt: options.excerpt,
        operationId: context.operationId
      })
    );
    return;
  }

  if (command === "posts:update" || command === "posts:preview-update") {
    if (!options.cid) {
      throw new Error(`${command} requires --cid.`);
    }

    const patch = {};
    for (const key of ["title", "markdown", "slug", "status"]) {
      if (options[key]) {
        patch[key] = options[key];
      }
    }

    if (options.tags) {
      patch.tags = splitCsv(options.tags);
    }

    if (options.categories) {
      patch.categories = splitCsv(options.categories);
    }

    const args = {
      host,
      cid: Number.parseInt(options.cid, 10),
      patch,
      operationId: context.operationId
    };
    printJson(command === "posts:preview-update" ? await previewPostUpdate(args) : await updatePost(args));
    return;
  }

  if (command === "posts:publish") {
    if (!options.cid) {
      throw new Error("posts:publish requires --cid.");
    }

    printJson(
      await publishPost({
        host,
        cid: Number.parseInt(options.cid, 10),
        confirm: Boolean(options.confirm),
        client: "cli",
        operationId: context.operationId
      })
    );
    return;
  }

  if (command === "posts:prepare-publish") {
    if (!options.cid) {
      throw new Error("posts:prepare-publish requires --cid.");
    }

    printJson(
      await preparePublish({
        host,
        cid: Number.parseInt(options.cid, 10),
        checkLinks: !options["skip-link-checks"],
        operationId: context.operationId
      })
    );
    return;
  }

  if (command === "snapshots:list") {
    printJson(await listSnapshots());
    return;
  }

  if (command === "snapshots:get") {
    if (!options["snapshot-id"]) {
      throw new Error("snapshots:get requires --snapshot-id.");
    }

    printJson(await previewSnapshot({
      snapshotId: options["snapshot-id"],
      host,
      includeRestoreDiff: Boolean(options["restore-diff"]),
      operationId: context.operationId
    }));
    return;
  }

  if (command === "posts:rollback") {
    if (!options["snapshot-id"]) {
      throw new Error("posts:rollback requires --snapshot-id.");
    }

    printJson(
      await rollbackPost({
        host,
        snapshotId: options["snapshot-id"],
        confirm: Boolean(options.confirm),
        client: "cli",
        operationId: context.operationId
      })
    );
    return;
  }

  if (command === "media:upload") {
    if (!options.file) {
      throw new Error("media:upload requires --file.");
    }

    printJson(await uploadMedia({
      host,
      filePath: options.file,
      filename: options.filename,
      operationId: context.operationId
    }));
    return;
  }

  if (command === "media:list") {
    printJson(await listMedia({
      host,
      limit: Number.parseInt(options.limit || "20", 10),
      forceRefresh,
      operationId: context.operationId
    }));
    return;
  }

  if (command === "media:register-url") {
    if (!options.url) {
      throw new Error("media:register-url requires --url.");
    }

    printJson(
      await registerExternalAsset({
        url: options.url,
        title: options.title,
        alt: options.alt,
        kind: options.kind || "image",
        operationId: context.operationId
      })
    );
    return;
  }

  if (command === "audit:list") {
    printJson(await listAuditEvents({ limit: Number.parseInt(options.limit || "50", 10) }));
    return;
  }

  if (command === "requests:list") {
    printJson({ requests: await listRequestLogs({ limit: Number.parseInt(options.limit || "50", 10) }) });
    return;
  }

  if (command === "policy:list") {
    printJson(listOperationPolicies());
    return;
  }

  if (command === "cache:status") {
    printJson(await cacheSummary({ host }));
    return;
  }

  if (command === "cache:clear") {
    printJson(await clearReadCache({
      host,
      namespaces: splitCsv(options.namespaces),
      operationId: context.operationId
    }));
    return;
  }

  if (command === "release:check") {
    printJson(await runReleaseCheck({ host, publishCid: options["publish-cid"], operationId: context.operationId }));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

async function runReleaseCheck({ host, publishCid, operationId }) {
  const checks = [];

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
        error: serializeError(error, "RELEASE_CHECK_FAILED")
      });
      return null;
    }
  };

  const health = await check(
    "agent.health",
    () => healthCheck({ host, forceRefresh: true, operationId }),
    (value) => ({
      agentVersion: value.agent?.version,
      siteTitle: value.site?.title,
      database: value.site?.database?.kind,
      databaseCompatibility: value.site?.database?.compatibility?.status,
      writeSupported: value.site?.database?.compatibility?.writeSupported
    })
  );

  const posts = await check(
    "posts.list",
    () => listPosts({ host, limit: 5, includeHidden: true, forceRefresh: true, operationId }),
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
    () => listMedia({ host, limit: 5, forceRefresh: true, operationId }),
    (value) => ({ count: value.media.length })
  );

  await check(
    "snapshots.list",
    () => listSnapshots(),
    (value) => ({ count: value.length, latest: value[0]?.snapshotId || null })
  );

  await check(
    "audit.list",
    () => listAuditEvents({ limit: 5 }),
    (value) => ({ count: value.length, latest: value[0]?.action || null })
  );

  await check(
    "cache.status",
    () => cacheSummary({ host }),
    (value) => ({ totalEntries: value.totalEntries, namespaces: Object.keys(value.byNamespace || {}) })
  );

  await check(
    "policy.list",
    () => listOperationPolicies(),
    (value) => ({ operationCount: value.operations?.length || 0 })
  );

  const cid = publishCid || posts?.posts?.[0]?.cid;
  if (cid) {
    await check(
      "publish_without_confirm_denied",
      async () => {
        try {
          await publishPost({ host, cid: Number.parseInt(cid, 10), confirm: false, client: "release-check", operationId });
        } catch (error) {
          if (error.code === "PUBLISH_APPROVAL_REQUIRED") {
            return { denied: true, code: error.code };
          }
          throw error;
        }
        throw new Error("Publish unexpectedly succeeded without confirmation.");
      },
      (value) => value
    );
  } else {
    checks.push({
      name: "publish_without_confirm_denied",
      ok: false,
      durationMs: 0,
      error: {
        code: "NO_POST_FOR_PUBLISH_POLICY_CHECK",
        message: "No post cid was available for publish policy denial check."
      }
    });
  }

  const failed = checks.filter((item) => !item.ok);

  return {
    ok: failed.length === 0,
    generatedAt: new Date().toISOString(),
    host,
    releaseTarget: "sqlite-first",
    database: health?.site?.database || null,
    checks
  };
}

function splitCsv(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
