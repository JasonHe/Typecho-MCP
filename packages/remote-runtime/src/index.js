import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  cleanRemoteOutput,
  parseJsonFromRemote,
  quoteShell,
  scpUpload,
  sshExec,
  sshShell
} from "../../ssh-connector/src/index.js";
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

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const agentPath = path.join(repoRoot, "remote/php-agent/agent.php");
const manifestPath = path.join(repoRoot, "remote/php-agent/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const targetCache = new Map();
const agentDeployCache = new Map();
const targetCacheTtlMs = 10 * 60 * 1000;
const agentDeployCacheTtlMs = 30 * 60 * 1000;

export async function detectTargets({ host }) {
  const startedAt = Date.now();

  try {
    const [hostPhp, dockerRows, hostConfigs] = await Promise.all([
      detectHostPhp({ host }),
      detectDockerRows({ host }),
      findHostTypechoConfigs({ host })
    ]);

    const targets = [];

    if (hostPhp.available) {
      for (const configPath of hostConfigs) {
        targets.push({
          id: `host:${path.dirname(configPath)}`,
          mode: "host_php",
          confidence: 0.7,
          hostRoot: path.dirname(configPath),
          php: hostPhp.path,
          markers: ["config.inc.php"]
        });
      }
    }

    for (const row of dockerRows) {
      if (!/typecho/i.test(`${row.name} ${row.image}`)) {
        continue;
      }

      const inspect = await inspectDockerContainer({ host, container: row.name });
      const appMount = inspect.mounts.find((mount) => mount.destination === "/app");

      if (!appMount) {
        continue;
      }

      const containerPhp = await detectContainerPhp({ host, container: row.name });
      if (!containerPhp.available) {
        continue;
      }

      targets.push({
        id: `docker:${row.name}:/app`,
        mode: "docker_exec",
        confidence: /php/i.test(row.name) || /php/i.test(row.image) ? 0.98 : 0.82,
        container: row.name,
        image: row.image,
        php: containerPhp.path,
        hostRoot: appMount.source,
        containerRoot: "/app",
        markers: ["config.inc.php", "docker", "mount:/app"]
      });
    }

    targets.sort((left, right) => right.confidence - left.confidence);

    return {
      host,
      detectedAt: new Date().toISOString(),
      hostPhp,
      targets,
      timings: [
        createTiming(timingStages.detect, startedAt, {
          targetCount: targets.length
        })
      ]
    };
  } catch (error) {
    throw annotateRemoteFailure(error, {
      fallbackCode: "TYPECHO_TARGET_DETECTION_FAILED",
      fallbackType: errorTypes.targetDetection,
      stage: timingStages.detect,
      retryable: true,
      timings: [createTiming(timingStages.detect, startedAt)]
    });
  }
}

export function pickBestTarget(targets) {
  return targets.find((target) => target.mode === "docker_exec") || targets[0] || null;
}

export async function deployAgent({ host, target }) {
  const startedAt = Date.now();
  const base = `${target.hostRoot}/.typecho-mcp`;
  const release = `${base}/releases/${manifest.agentVersion}`;

  try {
    await ensureOk(
      sshShell({
        host,
        script: `mkdir -p ${quoteShell(release)}`
      }),
      "create remote agent release directory",
      deployErrorOptions()
    );

    await ensureOk(
      scpUpload({
        host,
        localPath: agentPath,
        remotePath: `${release}/agent.php`
      }),
      "upload remote agent",
      deployErrorOptions()
    );

    await ensureOk(
      scpUpload({
        host,
        localPath: manifestPath,
        remotePath: `${release}/manifest.json`
      }),
      "upload remote agent manifest",
      deployErrorOptions()
    );

    await ensureOk(
      sshShell({
        host,
        script: `cd ${quoteShell(base)} && ln -sfn ${quoteShell(`releases/${manifest.agentVersion}`)} current`
      }),
      "activate remote agent",
      deployErrorOptions()
    );

    return attachTimings(
      {
        version: manifest.agentVersion,
        remotePath: `${base}/current/agent.php`
      },
      createTiming(timingStages.deploy, startedAt, {
        target: target.id,
        version: manifest.agentVersion
      })
    );
  } catch (error) {
    throw annotateError(error, {
      timings: [createTiming(timingStages.deploy, startedAt, { target: target.id })]
    });
  }
}

export async function callAgent({ host, target, method, params = {}, operationId }) {
  const requestId = operationId || createOperationId("remote");
  const startedAt = Date.now();
  const request = {
    jsonrpc: "2.0",
    id: requestId,
    method,
    params: {
      ...params,
      _meta: {
        operationId: requestId
      }
    }
  };

  const command =
    target.mode === "docker_exec"
      ? [
          "docker exec -i",
          quoteShell(target.container),
          "env",
          `TYPECHO_ROOT=${quoteShell(target.containerRoot)}`,
          "php",
          quoteShell(`${target.containerRoot}/.typecho-mcp/current/agent.php`)
        ].join(" ")
      : [
          `TYPECHO_ROOT=${quoteShell(target.hostRoot)}`,
          quoteShell(target.php || "php"),
          quoteShell(`${target.hostRoot}/.typecho-mcp/current/agent.php`)
        ].join(" ");

  let result;
  try {
    result = await sshExec({
      host,
      command,
      stdin: `${JSON.stringify(request)}\n`,
      timeoutMs: 30_000
    });
  } catch (error) {
    throw annotateRemoteFailure(error, {
      fallbackCode: "REMOTE_EXEC_FAILED",
      fallbackType: errorTypes.remoteExec,
      stage: timingStages.exec,
      operationId: requestId,
      retryable: true,
      timings: [createTiming(timingStages.exec, startedAt, { method, target: target.id })]
    });
  }

  const execTiming = createTiming(timingStages.exec, startedAt, {
    method,
    target: target.id,
    exitCode: result.code
  });

  if (result.code !== 0) {
    const error = new Error(
      `Remote agent command failed with code ${result.code}.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
    );
    throw annotateError(error, {
      code: "REMOTE_AGENT_COMMAND_FAILED",
      type: errorTypes.remoteExec,
      stage: timingStages.exec,
      operationId: requestId,
      retryable: true,
      timings: [execTiming]
    });
  }

  const rpcStartedAt = Date.now();
  let response;
  try {
    response = parseJsonFromRemote(result.stdout);
  } catch (error) {
    throw annotateError(error, {
      code: "REMOTE_AGENT_INVALID_JSON",
      type: errorTypes.agentRpc,
      stage: timingStages.rpc,
      operationId: requestId,
      retryable: true,
      timings: [execTiming, createTiming(timingStages.rpc, rpcStartedAt, { method, target: target.id })]
    });
  }

  const rpcTiming = createTiming(timingStages.rpc, rpcStartedAt, {
    method,
    target: target.id
  });

  if (response.error) {
    const error = new Error(response.error.message || response.error.code);
    error.remote = response.error;
    throw annotateError(error, {
      code: response.error.code,
      type: classifyAgentError(response.error.code),
      stage: timingStages.rpc,
      operationId: requestId,
      retryable: response.error.retryable,
      timings: [execTiming, rpcTiming]
    });
  }

  return attachTimings(response.result, [execTiming, rpcTiming]);
}

export async function callAgentAuto({ host, method, params = {}, operationId }) {
  const detection = await detectTargetsCached({ host });
  const target = pickBestTarget(detection.targets);

  if (!target) {
    throw createTypedError(`No Typecho target detected on ${host}.`, {
      code: "TYPECHO_TARGET_NOT_FOUND",
      type: errorTypes.targetDetection,
      stage: timingStages.detect,
      operationId,
      retryable: true,
      timings: detection.timings
    });
  }

  const deploy = await ensureAgentDeployed({ host, target });

  try {
    return attachTimings(
      await callAgent({ host, target, method, params, operationId }),
      mergeTimings(detection.timings, deploy.timings)
    );
  } catch (error) {
    if (error.remote) {
      annotateError(error, {
        timings: mergeTimings(detection.timings, deploy.timings, error.timings)
      });
      throw error;
    }
    const redeploy = await ensureAgentDeployed({ host, target, force: true });
    return attachTimings(
      await callAgent({ host, target, method, params, operationId }),
      mergeTimings(detection.timings, deploy.timings, error.timings, redeploy.timings)
    );
  }
}

export async function invokeAuto({ host, method, params = {}, operationId }) {
  return callAgentAuto({ host, method, params, operationId });
}

async function detectTargetsCached({ host }) {
  const startedAt = Date.now();
  const cached = targetCache.get(host);
  if (cached && Date.now() - cached.createdAt < targetCacheTtlMs) {
    return {
      ...cached.value,
      cache: {
        hit: true,
        cachedAt: new Date(cached.createdAt).toISOString()
      },
      timings: [
        createTiming(timingStages.cache, startedAt, {
          namespace: "target-detection",
          hit: true
        })
      ]
    };
  }

  const value = await detectTargets({ host });
  targetCache.set(host, {
    createdAt: Date.now(),
    value
  });
  return attachTimings(
    value,
    createTiming(timingStages.cache, startedAt, {
      namespace: "target-detection",
      hit: false
    })
  );
}

async function ensureAgentDeployed({ host, target, force = false }) {
  const startedAt = Date.now();
  const key = `${host}:${target.id}:${manifest.agentVersion}`;
  const cached = agentDeployCache.get(key);
  if (!force && cached && Date.now() - cached.createdAt < agentDeployCacheTtlMs) {
    return attachTimings(stripTimings(cached.value), createTiming(timingStages.deploy, startedAt, {
      target: target.id,
      version: manifest.agentVersion,
      cacheHit: true
    }));
  }

  const value = await deployAgent({ host, target });
  agentDeployCache.set(key, {
    createdAt: Date.now(),
    value: stripTimings(value)
  });
  return value;
}

async function detectHostPhp({ host }) {
  const result = await sshShell({
    host,
    script: "command -v php || true"
  });
  ensureSshOk(result, "detect host PHP");
  const phpPath = cleanRemoteOutput(result.stdout).split(/\r?\n/).find(Boolean);

  return {
    available: Boolean(phpPath),
    path: phpPath || null
  };
}

async function detectDockerRows({ host }) {
  const result = await sshShell({
    host,
    script: "command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}\\t{{.Image}}' || true"
  });
  ensureSshOk(result, "detect Docker containers");

  return cleanRemoteOutput(result.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, image] = line.split("\t");
      return { name, image: image || "" };
    })
    .filter((row) => row.name);
}

async function inspectDockerContainer({ host, container }) {
  const result = await sshShell({
    host,
    script: `docker inspect ${quoteShell(container)}`
  });

  if (result.code === 255) {
    ensureSshOk(result, "inspect Docker container");
  }

  if (result.code !== 0) {
    return { mounts: [] };
  }

  const inspect = parseJsonFromRemote(result.stdout);
  const first = Array.isArray(inspect) ? inspect[0] : inspect;

  return {
    mounts: (first?.Mounts || []).map((mount) => ({
      source: mount.Source,
      destination: mount.Destination,
      mode: mount.Mode
    }))
  };
}

async function detectContainerPhp({ host, container }) {
  const result = await sshShell({
    host,
    script: `docker exec ${quoteShell(container)} sh -lc ${quoteShell("command -v php || true")}`
  });
  ensureSshOk(result, "detect container PHP");
  const phpPath = cleanRemoteOutput(result.stdout).split(/\r?\n/).find(Boolean);

  return {
    available: Boolean(phpPath),
    path: phpPath || null
  };
}

async function findHostTypechoConfigs({ host }) {
  const result = await sshShell({
    host,
    script:
      "find /opt/stacks /var/www /www /home -maxdepth 5 -name config.inc.php -print 2>/dev/null || true"
  });
  ensureSshOk(result, "find Typecho config files");

  return cleanRemoteOutput(result.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function ensureOk(resultPromise, action, errorOptions = {}) {
  const result = await resultPromise;

  if (result.code !== 0) {
    throw createTypedError(
      `Failed to ${action}.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
      {
        code: "REMOTE_AGENT_DEPLOY_FAILED",
        type: errorTypes.agentDeploy,
        stage: timingStages.deploy,
        retryable: true,
        ...errorOptions
      }
    );
  }

  return result;
}

function ensureSshOk(result, action) {
  if (result.code === 0) {
    return result;
  }

  throw createTypedError(
    `SSH command failed while trying to ${action}.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    {
      code: "SSH_COMMAND_FAILED",
      type: errorTypes.ssh,
      stage: timingStages.exec,
      retryable: true
    }
  );
}

function deployErrorOptions() {
  return {
    code: "REMOTE_AGENT_DEPLOY_FAILED",
    type: errorTypes.agentDeploy,
    stage: timingStages.deploy,
    retryable: true
  };
}

function annotateRemoteFailure(error, options) {
  const code = error.code || options.fallbackCode;
  const type = error.type || (isSshFailure(error) ? errorTypes.ssh : options.fallbackType);
  const stage = error.stage || (type === errorTypes.ssh ? timingStages.exec : options.stage);

  return annotateError(error, {
    code,
    type,
    stage,
    retryable: error.retryable ?? options.retryable,
    operationId: options.operationId,
    timings: mergeTimings(error.timings, options.timings)
  });
}

function isSshFailure(error) {
  return error.code === "SSH_COMMAND_FAILED" || /ssh|timed out/i.test(error.message || "");
}

function classifyAgentError(code) {
  if (/DATABASE|SQLITE|TABLE|DB_/i.test(code || "")) {
    return errorTypes.dbRemoteAgent;
  }

  return errorTypes.agentRpc;
}

function stripTimings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const { timings: _timings, ...rest } = value;
  return rest;
}
