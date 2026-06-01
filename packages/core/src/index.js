export const publishPolicies = Object.freeze({
  manualApproval: "manual_approval",
  trustedAgent: "trusted_agent",
  autopublish: "autopublish"
});

export const operationRisk = Object.freeze({
  low: "low",
  medium: "medium",
  high: "high"
});

export const postStatuses = Object.freeze({
  draft: "draft",
  publish: "publish",
  hidden: "hidden",
  waiting: "waiting"
});

export function createOperationId(prefix = "op") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const errorTypes = Object.freeze({
  ssh: "ssh",
  targetDetection: "target_detection",
  agentDeploy: "agent_deploy",
  remoteExec: "remote_exec",
  agentRpc: "agent_rpc",
  dbRemoteAgent: "db_remote_agent",
  policy: "policy",
  cache: "cache",
  assetNetwork: "asset_network",
  localOps: "local_ops"
});

export const timingStages = Object.freeze({
  detect: "detect",
  deploy: "deploy",
  exec: "exec",
  rpc: "rpc",
  local: "local",
  cache: "cache"
});

export function createTiming(stage, startedAt, extra = {}) {
  return compactObject({
    stage,
    durationMs: Math.max(0, Date.now() - startedAt),
    ...extra
  });
}

export function mergeTimings(...groups) {
  return groups
    .flatMap((group) => (Array.isArray(group) ? group : group ? [group] : []))
    .filter((item) => item && typeof item === "object" && item.stage);
}

export function attachTimings(value, timings) {
  const merged = mergeTimings(value?.timings, timings);

  if (merged.length === 0) {
    return value;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      ...value,
      timings: merged
    };
  }

  return {
    value,
    timings: merged
  };
}

export function createTypedError(message, options = {}) {
  return annotateError(new Error(message), options);
}

export function annotateError(error, options = {}) {
  const target = error instanceof Error ? error : new Error(String(error));

  if (options.code || !target.code) {
    target.code = options.code || target.code || "ERROR";
  }

  for (const key of ["type", "stage", "retryable", "hint", "operationId"]) {
    if (Object.hasOwn(options, key) && options[key] !== undefined) {
      target[key] = options[key];
    }
  }

  const timings = mergeTimings(target.timings, options.timings);
  if (timings.length > 0) {
    target.timings = timings;
  }

  return target;
}

export function serializeError(error, fallbackCode = "ERROR") {
  if (!error) {
    return { code: fallbackCode, message: fallbackCode };
  }

  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && Object.hasOwn(error, "message")
        ? String(error.message)
        : String(error);
  return compactObject({
    code: error.code || fallbackCode,
    message,
    type: error.type,
    stage: error.stage,
    retryable: error.retryable,
    hint: error.hint,
    operationId: error.operationId,
    timings: Array.isArray(error.timings) && error.timings.length > 0 ? error.timings : undefined
  });
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null)
  );
}
