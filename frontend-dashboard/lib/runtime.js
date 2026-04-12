export function normalizeDeployTarget(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "kubernetes") return "k8s";
  if (["docker", "k8s", "proxmox"].includes(normalized)) return normalized;
  return null;
}

export function normalizeSandboxProfile(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "nemoclaw") return "nemoclaw";
  if (normalized === "standard") return "standard";
  return null;
}

export function runtimeFamilyFromConfig(backendConfig = {}) {
  return backendConfig?.runtimeFamily || backendConfig?.runtimeFamilies?.[0] || null;
}

export function enabledExecutionTargetsFromConfig(backendConfig = {}) {
  return (backendConfig?.executionTargets || []).filter((target) => target.enabled);
}

export function visibleExecutionTargetsFromConfig(
  backendConfig = {},
  viewerRole = "user"
) {
  const isAdmin = viewerRole === "admin";
  const enabledExecutionTargets = enabledExecutionTargetsFromConfig(backendConfig);

  return isAdmin
    ? enabledExecutionTargets
    : enabledExecutionTargets.filter((target) => target.availableForOnboarding);
}

export function activeExecutionTargetFromConfig(
  backendConfig = {},
  executionTarget = ""
) {
  const normalizedExecutionTarget = normalizeDeployTarget(executionTarget);
  return (
    enabledExecutionTargetsFromConfig(backendConfig).find(
      (target) => target.id === normalizedExecutionTarget
    ) || null
  );
}

export function visibleSandboxOptionsFromTarget(
  executionTarget = null,
  viewerRole = "user"
) {
  const isAdmin = viewerRole === "admin";
  const enabledSandboxProfiles = (executionTarget?.sandboxProfiles || []).filter(
    (profile) => profile.enabled
  );

  return isAdmin
    ? enabledSandboxProfiles
    : enabledSandboxProfiles.filter((profile) => profile.availableForOnboarding);
}

export function activeSandboxOptionFromTarget(
  executionTarget = null,
  sandboxProfile = ""
) {
  const normalizedSandboxProfile = normalizeSandboxProfile(sandboxProfile);
  return (
    (executionTarget?.sandboxProfiles || []).find(
      (profile) => profile.id === normalizedSandboxProfile
    ) || null
  );
}

export function pickExecutionTargetSelection(
  backendConfig = {},
  viewerRole = "user",
  currentExecutionTarget = ""
) {
  const candidates = visibleExecutionTargetsFromConfig(backendConfig, viewerRole);
  const normalizedExecutionTarget = normalizeDeployTarget(currentExecutionTarget);
  const current = candidates.find((target) => target.id === normalizedExecutionTarget);
  const nextTarget =
    current ||
    candidates.find((target) => target.available && target.isDefault) ||
    candidates.find((target) => target.available) ||
    candidates[0] ||
    null;

  return nextTarget?.id || "";
}

export function pickSandboxProfileSelection(
  executionTarget = null,
  viewerRole = "user",
  currentSandboxProfile = ""
) {
  const candidates = visibleSandboxOptionsFromTarget(executionTarget, viewerRole);
  const normalizedSandboxProfile = normalizeSandboxProfile(currentSandboxProfile);
  const current = candidates.find((profile) => profile.id === normalizedSandboxProfile);
  const nextProfile =
    current ||
    candidates.find((profile) => profile.available && profile.isDefault) ||
    candidates.find((profile) => profile.available) ||
    candidates[0] ||
    null;

  return nextProfile?.id || "";
}

export function resolveAgentExecutionTarget(agent = {}) {
  const explicitDeployTarget = normalizeDeployTarget(agent.deploy_target);
  if (explicitDeployTarget) return explicitDeployTarget;

  const legacyBackend = String(agent.backend_type || "").trim().toLowerCase();
  if (legacyBackend === "nemoclaw") return "docker";

  return normalizeDeployTarget(legacyBackend) || "docker";
}

export function resolveAgentSandboxProfile(agent = {}) {
  const explicitSandboxProfile =
    normalizeSandboxProfile(agent.sandbox_profile) ||
    normalizeSandboxProfile(agent.sandbox_type);
  if (explicitSandboxProfile) return explicitSandboxProfile;

  return String(agent.backend_type || "").trim().toLowerCase() === "nemoclaw"
    ? "nemoclaw"
    : "standard";
}

export function formatExecutionTargetLabel(value) {
  switch (normalizeDeployTarget(value)) {
    case "k8s":
      return "Kubernetes";
    case "proxmox":
      return "Proxmox";
    default:
      return "Docker";
  }
}

export function formatSandboxProfileLabel(value) {
  return normalizeSandboxProfile(value) === "nemoclaw" ? "NemoClaw" : "Standard";
}

export function formatRuntimePathLabel(agent = {}) {
  if (resolveAgentSandboxProfile(agent) === "nemoclaw") {
    return "NemoClaw + OpenClaw";
  }

  switch (resolveAgentExecutionTarget(agent)) {
    case "k8s":
      return "OpenClaw + Kubernetes";
    case "proxmox":
      return "OpenClaw + Proxmox";
    default:
      return "OpenClaw + Docker";
  }
}

export function isNemoClawSandbox(agent = {}) {
  return resolveAgentSandboxProfile(agent) === "nemoclaw";
}
