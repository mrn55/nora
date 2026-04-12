const {
  deployTargetForBackend,
  getDefaultBackend,
  getDefaultDeployTarget,
  isKnownSandboxProfile,
  normalizeBackendName,
} = require("./backendCatalog");

function getProvisionerBackendName() {
  return getDefaultBackend(process.env, { sandbox: "standard" });
}

function getStandardDockerAgentImage() {
  return process.env.OPENCLAW_DOCKER_IMAGE || "nora-openclaw-agent:local";
}

function getStandardDockerPackageSpec() {
  return process.env.OPENCLAW_DOCKER_PACKAGE || "openclaw@latest";
}

function getNemoClawAgentImage() {
  return (
    process.env.NEMOCLAW_SANDBOX_IMAGE ||
    "ghcr.io/nvidia/openshell-community/sandboxes/openclaw"
  );
}

function normalizeRequestedSandboxProfile(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (isKnownSandboxProfile(normalized)) return normalized;
  return null;
}

function resolveProvisionerBackend({ backend, deployTarget, sandboxProfile }) {
  const normalizedBackend = String(backend || "").trim().toLowerCase();
  if (normalizedBackend) {
    return normalizeBackendName(normalizedBackend);
  }

  const normalizedDeployTarget = String(deployTarget || "").trim().toLowerCase();
  if (normalizedDeployTarget === "nemoclaw") {
    return "nemoclaw";
  }
  if (sandboxProfile === "nemoclaw") {
    return "nemoclaw";
  }

  return getDefaultBackend(process.env, { sandbox: sandboxProfile || "standard" });
}

function getDefaultAgentImage({
  sandbox = "standard",
  backend = getProvisionerBackendName(),
  sandbox_profile,
  sandboxProfile,
  deploy_target,
  deployTarget,
} = {}) {
  const resolvedSandboxProfile =
    normalizeRequestedSandboxProfile(
      sandbox_profile ?? sandboxProfile ?? sandbox
    ) ||
    (String(backend || "").trim().toLowerCase() === "nemoclaw"
      ? "nemoclaw"
      : "standard");

  if (resolvedSandboxProfile === "nemoclaw") {
    return getNemoClawAgentImage();
  }

  const resolvedBackend = resolveProvisionerBackend({
    backend,
    deployTarget: deploy_target ?? deployTarget,
    sandboxProfile: resolvedSandboxProfile,
  });
  const resolvedDeployTarget =
    deploy_target ??
    deployTarget ??
    deployTargetForBackend(resolvedBackend) ??
    getDefaultDeployTarget(process.env, { sandbox: resolvedSandboxProfile });

  if (normalizeBackendName(resolvedDeployTarget) === "docker") {
    return getStandardDockerAgentImage();
  }

  return process.env.OPENCLAW_STANDARD_IMAGE || "node:22-slim";
}

module.exports = {
  getDefaultAgentImage,
  getNemoClawAgentImage,
  getProvisionerBackendName,
  getStandardDockerAgentImage,
  getStandardDockerPackageSpec,
  normalizeBackendName,
};
