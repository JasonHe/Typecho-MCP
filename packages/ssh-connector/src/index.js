import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 30_000;

export function quoteShell(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function runProcess(command, args, options = {}) {
  const { stdin, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });

    if (stdin) {
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }
  });
}

export async function sshExec({ host, command, stdin, timeoutMs }) {
  return runProcess("ssh", ["-T", host, command], { stdin, timeoutMs });
}

export async function sshShell({ host, script, stdin, timeoutMs }) {
  return sshExec({
    host,
    command: `sh -lc ${quoteShell(script)}`,
    stdin,
    timeoutMs
  });
}

export async function scpUpload({ host, localPath, remotePath, timeoutMs }) {
  return runProcess("scp", ["-q", localPath, `${host}:${remotePath}`], {
    timeoutMs
  });
}

export function cleanRemoteOutput(text) {
  return String(text)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "TERM environment variable not set.")
    .join("\n")
    .trim();
}

export function parseJsonFromRemote(text) {
  const cleaned = cleanRemoteOutput(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstObject = cleaned.indexOf("{");
    const firstArray = cleaned.indexOf("[");
    const first =
      firstObject === -1
        ? firstArray
        : firstArray === -1
          ? firstObject
          : Math.min(firstObject, firstArray);

    if (first === -1) {
      throw new Error(`Remote output did not contain JSON: ${cleaned}`);
    }

    const candidate = cleaned.slice(first);
    return JSON.parse(candidate);
  }
}

