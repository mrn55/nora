const KNOWN_BACKENDS = Object.freeze(["docker", "k8s", "proxmox", "nemoclaw"]);
const PROXMOX_RELEASE_BLOCKER_ISSUE =
  "Proxmox backend is not release-ready in this Nora build. New Proxmox deployments are disabled for the first release.";

const BACKEND_METADATA = Object.freeze({
  docker: {
    id: "docker",
    label: "OpenClaw + Docker",
    shortLabel: "Docker",
    sandbox: "standard",
    summary:
      "Recommended default for self-hosted deployments. Containerized runtime with the shortest path from install to live operations.",
    detail:
      "OpenClaw + Docker agents are deployed as isolated containers. This is the fastest and clearest path for a self-hosted deployment.",
    badges: ["Fast path", "Local socket", "General purpose"],
  },
  k8s: {
    id: "k8s",
    label: "OpenClaw + Kubernetes",
    shortLabel: "Kubernetes",
    sandbox: "standard",
    summary:
      "Run agents as Kubernetes workloads when Nora should provision into a shared cluster instead of the local Docker host.",
    detail:
      "OpenClaw + Kubernetes agents run as Deployments and Services. Use this when your control plane is wired to a Kubernetes cluster.",
    badges: ["Cluster workload", "Service-backed", "Kube API"],
  },
  proxmox: {
    id: "proxmox",
    label: "OpenClaw + Proxmox",
    shortLabel: "Proxmox",
    sandbox: "standard",
    summary:
      "Provision agents as Proxmox LXCs when your infrastructure standard is VM and LXC orchestration through the Proxmox API.",
    detail:
      "OpenClaw + Proxmox agents are provisioned as LXCs through the Proxmox API. This path depends on external Proxmox configuration.",
    badges: ["LXC", "Proxmox API", "Infrastructure-specific"],
  },
  nemoclaw: {
    id: "nemoclaw",
    label: "NemoClaw + OpenClaw",
    shortLabel: "NemoClaw",
    sandbox: "nemoclaw",
    summary:
      "NVIDIA secure sandbox path for teams that need stronger runtime restrictions and compatible model routing.",
    detail:
      "NemoClaw + OpenClaw agents run in NVIDIA secure sandboxes with deny-by-default networking and capability-restricted containers.",
    badges: ["Secure sandbox", "Deny-by-default network", "Capability-restricted"],
  },
});

const NEMOCLAW_MODELS = Object.freeze([
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/llama-3.1-nemotron-ultra-253b-v1",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "nvidia/nemotron-3-nano-30b-a3b",
]);

function normalizeBackendName(value) {
  const normalized = String(value || "docker").trim().toLowerCase();
  if (normalized === "kubernetes") return "k8s";
  return KNOWN_BACKENDS.includes(normalized) ? normalized : "docker";
}

function isKnownBackend(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "kubernetes" || KNOWN_BACKENDS.includes(normalized);
}

function sandboxForBackend(backend) {
  return normalizeBackendName(backend) === "nemoclaw" ? "nemoclaw" : "standard";
}

function getBackendMetadata(backend) {
  return BACKEND_METADATA[normalizeBackendName(backend)];
}

function parseEnabledBackendList(rawValue) {
  const seen = new Set();
  const parsed = [];

  for (const entry of String(rawValue || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    if (!isKnownBackend(entry)) continue;
    const normalized = normalizeBackendName(entry);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    parsed.push(normalized);
  }

  return parsed;
}

function getEnabledBackends(env = process.env) {
  const configuredList = parseEnabledBackendList(env.ENABLED_BACKENDS);
  if (configuredList.length > 0) {
    return configuredList;
  }

  return ["docker"];
}

function getDefaultBackend(env = process.env, options = {}) {
  const enabledBackends = getEnabledBackends(env);
  const availableEnabledBackends = enabledBackends.filter(
    (backend) => backendConfigIssue(backend, env) == null
  );
  const candidateBackends =
    availableEnabledBackends.length > 0
      ? availableEnabledBackends
      : enabledBackends;
  const requested = options.backend ? normalizeBackendName(options.backend) : null;
  const requestedSandbox =
    options.sandbox === "nemoclaw" || options.sandbox === "standard"
      ? options.sandbox
      : null;

  if (requested && candidateBackends.includes(requested)) {
    return requested;
  }

  if (requestedSandbox) {
    const matching = candidateBackends.find(
      (backend) => sandboxForBackend(backend) === requestedSandbox
    );
    if (matching) return matching;
  }

  return candidateBackends[0] || "docker";
}

function backendConfigIssue(backend, env = process.env) {
  switch (normalizeBackendName(backend)) {
    case "k8s":
      if (env.KUBECONFIG || env.KUBERNETES_SERVICE_HOST) return null;
      return "Kubernetes backend requires KUBECONFIG or in-cluster Kubernetes environment variables.";
    case "proxmox":
      return PROXMOX_RELEASE_BLOCKER_ISSUE;
    default:
      return null;
  }
}

function getBackendCatalog(env = process.env) {
  const enabledSet = new Set(getEnabledBackends(env));
  const defaultBackend = getDefaultBackend(env);

  return KNOWN_BACKENDS.map((backendId) => {
    const metadata = getBackendMetadata(backendId);
    const issue = backendConfigIssue(backendId, env);
    const enabled = enabledSet.has(backendId);

    return {
      ...metadata,
      enabled,
      configured: issue == null,
      available: enabled && issue == null,
      issue,
      isDefault: backendId === defaultBackend,
      models: backendId === "nemoclaw" ? [...NEMOCLAW_MODELS] : [],
      defaultModel:
        backendId === "nemoclaw"
          ? env.NEMOCLAW_DEFAULT_MODEL || NEMOCLAW_MODELS[0]
          : null,
      sandboxImage:
        backendId === "nemoclaw"
          ? env.NEMOCLAW_SANDBOX_IMAGE ||
            "ghcr.io/nvidia/openshell-community/sandboxes/openclaw"
          : null,
    };
  });
}

function isBackendEnabled(backend, env = process.env) {
  return getEnabledBackends(env).includes(normalizeBackendName(backend));
}

function getBackendStatus(backend, env = process.env) {
  const normalized = normalizeBackendName(backend);
  const metadata = getBackendMetadata(normalized);
  const enabled = isBackendEnabled(normalized, env);
  const issue = backendConfigIssue(normalized, env);

  return {
    ...metadata,
    enabled,
    configured: issue == null,
    available: enabled && issue == null,
    issue,
    models: normalized === "nemoclaw" ? [...NEMOCLAW_MODELS] : [],
    defaultModel:
      normalized === "nemoclaw"
        ? env.NEMOCLAW_DEFAULT_MODEL || NEMOCLAW_MODELS[0]
        : null,
    sandboxImage:
      normalized === "nemoclaw"
        ? env.NEMOCLAW_SANDBOX_IMAGE ||
          "ghcr.io/nvidia/openshell-community/sandboxes/openclaw"
        : null,
  };
}

module.exports = {
  KNOWN_BACKENDS,
  NEMOCLAW_MODELS,
  PROXMOX_RELEASE_BLOCKER_ISSUE,
  getBackendCatalog,
  getBackendMetadata,
  getBackendStatus,
  getDefaultBackend,
  getEnabledBackends,
  isBackendEnabled,
  isKnownBackend,
  normalizeBackendName,
  sandboxForBackend,
};
