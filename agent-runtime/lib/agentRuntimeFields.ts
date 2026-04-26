// @ts-nocheck
const {
  DEFAULT_RUNTIME_FAMILY,
  backendForRuntimeSelection,
  getDefaultDeployTarget,
  getDefaultRuntimeFamily,
  getDefaultSandboxProfile,
  isKnownDeployTarget,
  isKnownRuntimeFamily,
  isKnownSandboxProfile,
  normalizeDeployTargetName,
  normalizeRuntimeFamilyName,
  normalizeSandboxProfileName,
} = require("./backendCatalog");

function hasText(value) {
  return typeof value === "string" ? value.trim() !== "" : value != null;
}

function parseRuntimeFamily(value) {
  if (!isKnownRuntimeFamily(value)) return null;
  return normalizeRuntimeFamilyName(value);
}

function parseDeployTarget(value) {
  if (!isKnownDeployTarget(value)) return null;
  return normalizeDeployTargetName(value);
}

function parseSandboxProfile(value) {
  if (!isKnownSandboxProfile(value)) return null;
  return normalizeSandboxProfileName(value);
}

function normalizeRequestedDeployTarget(value) {
  return parseDeployTarget(value);
}

function resolveFallbackRuntimeFields(fallback = {}) {
  if (fallback && Object.keys(fallback).length > 0) {
    return buildAgentRuntimeFields(fallback);
  }

  return buildAgentRuntimeFields({
    runtime_family: getDefaultRuntimeFamily(process.env),
  });
}

function hasNewRuntimeSelection(agent = {}) {
  return Boolean(
    parseRuntimeFamily(agent.runtime_family ?? agent.runtimeFamily) ||
      parseDeployTarget(agent.deploy_target ?? agent.deployTarget) ||
      parseSandboxProfile(agent.sandbox_profile ?? agent.sandboxProfile)
  );
}

function resolveAgentRuntimeFamily(agent = {}) {
  const explicitRuntimeFamily = parseRuntimeFamily(
    agent.runtime_family ?? agent.runtimeFamily
  );
  if (explicitRuntimeFamily) return explicitRuntimeFamily;

  return getDefaultRuntimeFamily(process.env) || DEFAULT_RUNTIME_FAMILY;
}

function resolveAgentSandboxProfile(agent = {}) {
  const explicitSandbox = parseSandboxProfile(
    agent.sandbox_profile ?? agent.sandboxProfile
  );
  if (explicitSandbox) return explicitSandbox;

  const legacySandbox = parseSandboxProfile(
    agent.sandbox_type ?? agent.sandboxType
  );
  if (legacySandbox) return legacySandbox;

  const runtimeFamily = resolveAgentRuntimeFamily(agent);
  return getDefaultSandboxProfile(process.env, { runtimeFamily });
}

function resolveAgentDeployTarget(agent = {}) {
  const explicitDeployTarget = parseDeployTarget(
    agent.deploy_target ?? agent.deployTarget
  );
  if (explicitDeployTarget) return explicitDeployTarget;

  const backendDeployTarget = parseDeployTarget(
    agent.backend_type ?? agent.backendType ?? agent.backend
  );
  if (backendDeployTarget) return backendDeployTarget;

  const runtimeFamily = resolveAgentRuntimeFamily(agent);
  const sandboxProfile = resolveAgentSandboxProfile({
    ...agent,
    runtime_family: runtimeFamily,
  });
  return getDefaultDeployTarget(process.env, {
    runtimeFamily,
    sandbox: sandboxProfile,
  });
}

function resolveAgentBackendType(agent = {}) {
  const runtimeFamily = resolveAgentRuntimeFamily(agent);
  const sandboxProfile = resolveAgentSandboxProfile({
    ...agent,
    runtime_family: runtimeFamily,
  });
  const deployTarget = resolveAgentDeployTarget({
    ...agent,
    runtime_family: runtimeFamily,
    sandbox_profile: sandboxProfile,
  });

  return backendForRuntimeSelection({
    runtimeFamily,
    deployTarget,
    sandboxProfile,
  });
}

function resolveAgentSandboxType(agent = {}) {
  return resolveAgentSandboxProfile(agent);
}

function buildAgentRuntimeFields(agent = {}) {
  const runtimeFamily = resolveAgentRuntimeFamily(agent);
  const deployTarget = resolveAgentDeployTarget({
    ...agent,
    runtime_family: runtimeFamily,
  });
  const sandboxProfile = resolveAgentSandboxProfile({
    ...agent,
    runtime_family: runtimeFamily,
    deploy_target: deployTarget,
  });
  const backendType = resolveAgentBackendType({
    ...agent,
    runtime_family: runtimeFamily,
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
  const effectiveRuntimeFamily =
    requestedRuntimeFamily ||
    fallbackRuntime.runtime_family ||
    getDefaultRuntimeFamily(process.env) ||
    DEFAULT_RUNTIME_FAMILY;
  const runtimeFamilyChanged =
    Boolean(requestedRuntimeFamily) &&
    requestedRuntimeFamily !== fallbackRuntime.runtime_family;
  const rawRequestedDeployTarget = request.deploy_target ?? request.deployTarget;
  const rawRequestedBackend =
    request.backend ?? request.backend_type ?? request.backendType;
  const requestedDeployTarget =
    normalizeRequestedDeployTarget(rawRequestedDeployTarget) ||
    normalizeRequestedDeployTarget(rawRequestedBackend);
  const requestedSandboxProfile = parseSandboxProfile(
    request.sandbox_profile ??
      request.sandboxProfile ??
      request.sandbox ??
      request.sandbox_type ??
      request.sandboxType
  );
  const placementRequested =
    hasText(rawRequestedDeployTarget) || hasText(rawRequestedBackend);
  const defaultRuntimeFields = runtimeFamilyChanged
    ? buildAgentRuntimeFields({
        runtime_family: effectiveRuntimeFamily,
      })
    : fallbackRuntime;
  const sandboxProfile =
    requestedSandboxProfile ||
    (!placementRequested && !runtimeFamilyChanged
      ? defaultRuntimeFields.sandbox_profile
      : null) ||
    getDefaultSandboxProfile(process.env, {
      runtimeFamily: effectiveRuntimeFamily,
    });
  const deployTarget =
    requestedDeployTarget ||
    (!placementRequested && !runtimeFamilyChanged
      ? defaultRuntimeFields.deploy_target
      : null) ||
    getDefaultDeployTarget(process.env, {
      runtimeFamily: effectiveRuntimeFamily,
      sandbox: sandboxProfile,
    });

  return buildAgentRuntimeFields({
    runtime_family: effectiveRuntimeFamily,
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
