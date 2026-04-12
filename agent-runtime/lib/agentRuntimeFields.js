const {
  DEFAULT_RUNTIME_FAMILY,
  deployTargetForBackend,
  getDefaultBackend,
  getDefaultDeployTarget,
  isKnownBackend,
  normalizeBackendName,
  sandboxForBackend,
} = require("./backendCatalog");

function hasText(value) {
  return typeof value === "string" ? value.trim() !== "" : value != null;
}

function normalizeLegacyBackend(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return isKnownBackend(normalized) ? normalizeBackendName(normalized) : null;
}

function parseRuntimeFamily(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === DEFAULT_RUNTIME_FAMILY ? DEFAULT_RUNTIME_FAMILY : null;
}

function parseDeployTarget(value) {
  if (!isKnownBackend(value)) return null;
  return normalizeBackendName(value);
}

function parseSandboxProfile(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "nemoclaw") return "nemoclaw";
  if (normalized === "standard") return "standard";
  return null;
}

function normalizeRequestedDeployTarget(value) {
  const normalizedBackend = normalizeLegacyBackend(value);
  return normalizedBackend ? deployTargetForBackend(normalizedBackend) : null;
}

function resolveFallbackRuntimeFields(fallback = {}) {
  return fallback && Object.keys(fallback).length > 0
    ? buildAgentRuntimeFields(fallback)
    : buildAgentRuntimeFields({ backend_type: getDefaultBackend(process.env) });
}

function hasNewRuntimeSelection(agent = {}) {
  return Boolean(
    parseDeployTarget(agent.deploy_target ?? agent.deployTarget) ||
      parseSandboxProfile(agent.sandbox_profile ?? agent.sandboxProfile)
  );
}

function resolveAgentRuntimeFamily(agent = {}) {
  return (
    parseRuntimeFamily(agent.runtime_family ?? agent.runtimeFamily) ||
    DEFAULT_RUNTIME_FAMILY
  );
}

function resolveAgentSandboxProfile(agent = {}) {
  const explicitSandbox = parseSandboxProfile(
    agent.sandbox_profile ?? agent.sandboxProfile
  );
  if (explicitSandbox) return explicitSandbox;

  const explicitDeployTarget = parseDeployTarget(
    agent.deploy_target ?? agent.deployTarget
  );
  if (explicitDeployTarget && explicitDeployTarget !== "docker") {
    return "standard";
  }

  const legacySandbox = parseSandboxProfile(
    agent.sandbox_type ?? agent.sandboxType
  );
  if (legacySandbox) return legacySandbox;

  const legacyBackend = parseDeployTarget(
    agent.backend_type ?? agent.backendType
  );
  if (legacyBackend) return sandboxForBackend(legacyBackend);

  return "standard";
}

function resolveAgentDeployTarget(agent = {}) {
  const explicitDeployTarget = parseDeployTarget(
    agent.deploy_target ?? agent.deployTarget
  );
  if (explicitDeployTarget) return explicitDeployTarget;

  const explicitSandbox = parseSandboxProfile(
    agent.sandbox_profile ?? agent.sandboxProfile
  );
  if (explicitSandbox === "nemoclaw") {
    return "docker";
  }

  const legacyBackend = parseDeployTarget(
    agent.backend_type ?? agent.backendType
  );
  if (legacyBackend) return deployTargetForBackend(legacyBackend);

  const sandboxProfile = resolveAgentSandboxProfile(agent);
  if (sandboxProfile === "nemoclaw") {
    return "docker";
  }

  return deployTargetForBackend(
    getDefaultBackend(process.env, { sandbox: sandboxProfile })
  );
}

function resolveAgentBackendType(agent = {}) {
  const sandboxProfile = resolveAgentSandboxProfile(agent);
  const deployTarget = resolveAgentDeployTarget(agent);

  if (hasNewRuntimeSelection(agent)) {
    return sandboxProfile === "nemoclaw" ? "nemoclaw" : deployTarget;
  }

  const legacyBackend = parseDeployTarget(
    agent.backend_type ?? agent.backendType
  );
  if (legacyBackend) return legacyBackend;

  return sandboxProfile === "nemoclaw" ? "nemoclaw" : deployTarget;
}

function resolveAgentSandboxType(agent = {}) {
  if (hasNewRuntimeSelection(agent)) {
    return resolveAgentSandboxProfile(agent);
  }

  const legacySandbox = parseSandboxProfile(
    agent.sandbox_type ?? agent.sandboxType
  );
  if (legacySandbox) return legacySandbox;

  return resolveAgentSandboxProfile(agent);
}

function buildAgentRuntimeFields(agent = {}) {
  const runtimeFamily = resolveAgentRuntimeFamily(agent);
  const deployTarget = resolveAgentDeployTarget(agent);
  const sandboxProfile = resolveAgentSandboxProfile(agent);
  const backendType = resolveAgentBackendType({
    ...agent,
    deploy_target: deployTarget,
    sandbox_profile: sandboxProfile,
  });

  return {
    runtime_family: runtimeFamily,
    deploy_target: deployTarget,
    sandbox_profile: sandboxProfile,
    backend_type: backendType,
    sandbox_type: sandboxProfile,
  };
}

function isSameRuntimePath(left = {}, right = {}) {
  const leftRuntime = buildAgentRuntimeFields(left);
  const rightRuntime = buildAgentRuntimeFields(right);

  return (
    leftRuntime.runtime_family === rightRuntime.runtime_family &&
    leftRuntime.deploy_target === rightRuntime.deploy_target &&
    leftRuntime.sandbox_profile === rightRuntime.sandbox_profile
  );
}

function resolveRequestedRuntimeFields({ request = {}, fallback = {} } = {}) {
  const fallbackRuntime = resolveFallbackRuntimeFields(fallback);
  const requestedRuntimeFamily = parseRuntimeFamily(
    request.runtime_family ?? request.runtimeFamily
  );
  const rawRequestedDeployTarget = request.deploy_target ?? request.deployTarget;
  const rawRequestedBackend =
    request.backend ?? request.backend_type ?? request.backendType;
  const requestedDeployTarget =
    normalizeRequestedDeployTarget(rawRequestedDeployTarget);
  const requestedBackend = normalizeLegacyBackend(rawRequestedBackend);
  const requestedSandboxProfile = parseSandboxProfile(
    request.sandbox_profile ??
      request.sandboxProfile ??
      request.sandbox ??
      request.sandbox_type ??
      request.sandboxType
  );
  const hasRequestedPlacement =
    hasText(rawRequestedDeployTarget) || hasText(rawRequestedBackend);
  const legacyNemoHint =
    normalizeLegacyBackend(rawRequestedDeployTarget) === "nemoclaw" ||
    requestedBackend === "nemoclaw";
  const sandboxProfile =
    requestedSandboxProfile ||
    (legacyNemoHint ? "nemoclaw" : null) ||
    (hasRequestedPlacement
      ? "standard"
      : fallbackRuntime.sandbox_profile || "standard");
  const deployTarget =
    requestedDeployTarget ||
    (requestedBackend ? deployTargetForBackend(requestedBackend) : null) ||
    (requestedSandboxProfile === "nemoclaw" || legacyNemoHint
      ? "docker"
      : null) ||
    (!hasRequestedPlacement ? fallbackRuntime.deploy_target : null) ||
    getDefaultDeployTarget(process.env, { sandbox: sandboxProfile });

  return buildAgentRuntimeFields({
    runtime_family:
      requestedRuntimeFamily ||
      fallbackRuntime.runtime_family ||
      DEFAULT_RUNTIME_FAMILY,
    deploy_target: deployTarget,
    sandbox_profile: sandboxProfile,
  });
}

function isNemoClawSandbox(agent = {}) {
  return resolveAgentSandboxProfile(agent) === "nemoclaw";
}

module.exports = {
  DEFAULT_RUNTIME_FAMILY,
  buildAgentRuntimeFields,
  hasNewRuntimeSelection,
  isNemoClawSandbox,
  isSameRuntimePath,
  parseDeployTarget,
  parseRuntimeFamily,
  parseSandboxProfile,
  resolveRequestedRuntimeFields,
  resolveAgentBackendType,
  resolveAgentDeployTarget,
  resolveAgentRuntimeFamily,
  resolveAgentSandboxProfile,
  resolveAgentSandboxType,
};
