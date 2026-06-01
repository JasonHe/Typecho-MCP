import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createOperationId } from "../../core/src/index.js";

const cacheRoot = path.join(os.homedir(), ".typecho-mcp-workbench");

export async function writeAuditEvent(event) {
  const now = new Date();
  const payload = {
    id: createOperationId("audit"),
    timestamp: now.toISOString(),
    ...redact(event)
  };
  const file = auditFile(now);

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(payload)}\n`);

  return payload;
}

export async function listAuditEvents({ limit = 50 } = {}) {
  const dir = path.join(cacheRoot, "audit");
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

function auditFile(date) {
  return path.join(cacheRoot, "audit", `${date.toISOString().slice(0, 10)}.jsonl`);
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
    } else if (key === "markdown" || key === "text") {
      output[key] = typeof item === "string" ? `[${item.length} chars]` : "[redacted]";
    } else {
      output[key] = redact(item);
    }
  }

  return output;
}

