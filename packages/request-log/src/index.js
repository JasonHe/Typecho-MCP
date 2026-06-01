import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { serializeError } from "../../core/src/index.js";

const cacheRoot = path.join(os.homedir(), ".typecho-mcp-workbench");

export async function writeRequestLog(entry) {
  const now = new Date();
  const payload = redact({
    timestamp: entry.timestamp || now.toISOString(),
    operationId: entry.operationId,
    surface: entry.surface || "unknown",
    host: entry.host || null,
    method: entry.method || null,
    url: sanitizeUrl(entry.url),
    command: entry.command || null,
    tool: entry.tool || null,
    durationMs: entry.durationMs ?? null,
    timings: Array.isArray(entry.timings) && entry.timings.length > 0 ? entry.timings : null,
    statusCode: entry.statusCode ?? null,
    ok: Boolean(entry.ok),
    error: entry.error ? serializeError(entry.error) : null
  });
  const file = requestFile(now);

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(payload)}\n`);

  return payload;
}

export async function listRequestLogs({ limit = 50 } = {}) {
  const dir = requestDir();
  await fs.mkdir(dir, { recursive: true });
  const files = (await fs.readdir(dir)).filter((file) => file.endsWith(".jsonl")).sort().reverse();
  const events = [];

  for (const file of files) {
    const lines = (await fs.readFile(path.join(dir, file), "utf8")).trim().split(/\r?\n/).filter(Boolean);
    for (const line of lines.reverse()) {
      events.push(JSON.parse(line));
      if (events.length >= limit) {
        return events;
      }
    }
  }

  return events;
}

export async function summarizeRequestLogs({ limit = 200 } = {}) {
  const events = await listRequestLogs({ limit });
  const failed = events.filter((event) => !event.ok);
  const bySurface = {};

  for (const event of events) {
    bySurface[event.surface] = (bySurface[event.surface] || 0) + 1;
  }

  return {
    total: events.length,
    failed: failed.length,
    bySurface,
    latest: events[0] || null,
    recentErrors: failed.slice(0, 10)
  };
}

function requestDir() {
  return path.join(cacheRoot, "requests");
}

function requestFile(date) {
  return path.join(requestDir(), `${date.toISOString().slice(0, 10)}.jsonl`);
}

function sanitizeUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(String(value), "http://127.0.0.1");
    for (const key of [...url.searchParams.keys()]) {
      if (/password|secret|token|key|base64/i.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return String(value);
  }
}

function redact(value) {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/password|secret|token|privateKey|base64/i.test(key)) {
      output[key] = "[redacted]";
    } else if (key === "body" || key === "markdown" || key === "text") {
      output[key] = typeof item === "string" ? `[${item.length} chars]` : "[redacted]";
    } else {
      output[key] = redact(item);
    }
  }
  return output;
}
