import { annotateError, errorTypes } from "../../core/src/index.js";

export const publishPolicies = Object.freeze({
  manualApproval: "manual_approval",
  trustedAgent: "trusted_agent",
  autopublish: "autopublish"
});

export const operationRisks = Object.freeze({
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical"
});

export const operationTypes = Object.freeze({
  postsCreateDraft: "posts.createDraft",
  postsUpdate: "posts.update",
  postsPreparePublish: "posts.preparePublish",
  postsPublish: "posts.publish",
  postsRollback: "posts.rollback",
  mediaUpload: "media.upload",
  mediaRegisterExternalUrl: "media.registerExternalUrl",
  cacheClear: "cache.clear",
  commentsApprove: "comments.approve",
  commentsDelete: "comments.delete",
  commentsReply: "comments.reply",
  pluginsEnable: "plugins.enable",
  pluginsDisable: "plugins.disable",
  pluginsConfigure: "plugins.configure"
});

export const operationPolicy = Object.freeze({
  [operationTypes.postsCreateDraft]: {
    risk: operationRisks.medium,
    confirmation: "none"
  },
  [operationTypes.postsUpdate]: {
    risk: operationRisks.high,
    confirmation: "snapshot"
  },
  [operationTypes.postsPreparePublish]: {
    risk: operationRisks.low,
    confirmation: "none"
  },
  [operationTypes.postsPublish]: {
    risk: operationRisks.critical,
    confirmation: "manual"
  },
  [operationTypes.postsRollback]: {
    risk: operationRisks.critical,
    confirmation: "manual"
  },
  [operationTypes.mediaUpload]: {
    risk: operationRisks.medium,
    confirmation: "none"
  },
  [operationTypes.mediaRegisterExternalUrl]: {
    risk: operationRisks.low,
    confirmation: "none"
  },
  [operationTypes.cacheClear]: {
    risk: operationRisks.medium,
    confirmation: "none"
  },
  [operationTypes.commentsApprove]: {
    risk: operationRisks.medium,
    confirmation: "none"
  },
  [operationTypes.commentsDelete]: {
    risk: operationRisks.high,
    confirmation: "manual"
  },
  [operationTypes.commentsReply]: {
    risk: operationRisks.high,
    confirmation: "manual"
  },
  [operationTypes.pluginsEnable]: {
    risk: operationRisks.critical,
    confirmation: "manual"
  },
  [operationTypes.pluginsDisable]: {
    risk: operationRisks.critical,
    confirmation: "manual"
  },
  [operationTypes.pluginsConfigure]: {
    risk: operationRisks.critical,
    confirmation: "manual"
  }
});

export function getPublishPolicy() {
  return process.env.TYPECHO_MCP_PUBLISH_POLICY || publishPolicies.manualApproval;
}

export function describeOperationPolicy(operation) {
  return operationPolicy[operation] || {
    risk: operationRisks.high,
    confirmation: "manual"
  };
}

export function listOperationPolicies() {
  return {
    generatedAt: new Date().toISOString(),
    publishPolicy: getPublishPolicy(),
    operations: Object.entries(operationPolicy).map(([operation, details]) => ({
      operation,
      risk: details.risk,
      confirmation: details.confirmation
    }))
  };
}

export function assertOperationAllowed({
  operation,
  confirm = false,
  client = "unknown",
  hasSnapshot = false
} = {}) {
  const details = describeOperationPolicy(operation);

  if (details.confirmation === "none") {
    return { operation, ...details, allowed: true };
  }

  if (details.confirmation === "snapshot" && hasSnapshot) {
    return { operation, ...details, allowed: true };
  }

  if (operation === operationTypes.postsPublish) {
    const publish = assertPublishAllowed({ confirm, client });
    return { operation, ...details, ...publish, allowed: true };
  }

  if (details.confirmation === "manual" && confirm) {
    return { operation, ...details, allowed: true };
  }

  const error = new Error(
    `Operation ${operation || "unknown"} requires ${details.confirmation} confirmation.`
  );
  error.code = "OPERATION_CONFIRMATION_REQUIRED";
  error.operation = operation;
  error.risk = details.risk;
  error.confirmation = details.confirmation;
  throw annotateError(error, {
    type: errorTypes.policy,
    stage: "policy",
    retryable: false,
    hint: `Pass the required ${details.confirmation} confirmation after reviewing the operation.`
  });
}

export function assertPublishAllowed({ confirm = false, client = "unknown" } = {}) {
  const policy = getPublishPolicy();

  if (policy === publishPolicies.autopublish) {
    return { policy, allowed: true };
  }

  if (policy === publishPolicies.trustedAgent) {
    const trusted = trustedAgents().has(client);
    if (trusted || confirm) {
      return { policy, allowed: true, trusted };
    }
  }

  if (policy === publishPolicies.manualApproval && confirm) {
    return { policy, allowed: true };
  }

  const error = new Error(
    `Publish blocked by ${policy}. Pass confirm=true or adjust TYPECHO_MCP_PUBLISH_POLICY.`
  );
  error.code = "PUBLISH_APPROVAL_REQUIRED";
  error.policy = policy;
  throw annotateError(error, {
    type: errorTypes.policy,
    stage: "policy",
    retryable: false,
    hint: "Pass confirm=true after human review, or adjust TYPECHO_MCP_PUBLISH_POLICY."
  });
}

function trustedAgents() {
  return new Set(
    (process.env.TYPECHO_MCP_TRUSTED_AGENTS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}
