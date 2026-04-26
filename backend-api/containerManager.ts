// @ts-nocheck
/**
 * Container Manager — backend-agnostic lifecycle router.
 *
 * Delegates start/stop/restart/destroy/status/logs/exec to the correct
 * provisioner backend based on the agent's backend_type column.
 *
 * The backend-api service doesn't run the provisioner worker, so we
 * instantiate lightweight backend instances here purely for lifecycle
 * operations (not for create — that goes through BullMQ).
 *
 * Invariant: adapters are never called with a null/empty container_id. The
 * `ensureContainerId` guard throws NoContainerError (409) at this seam so we
 * never reach Docker/K8s with a missing id. Without this, dockerode stringifies
 * `null` into its URL and the daemon returns a confusing
 * `(HTTP code 404) No such container: null` which then bubbles to the UI.
 */

const path = require("path");
const {
  resolveAgentBackendType,
  resolveAgentRuntimeFamily,
  resolveAgentSandboxProfile,
} = require("./agentRuntimeFields");

// Lazy-load backends so missing optional deps (e.g. @kubernetes/client-node)
// don't crash the API server when only Docker is used.
const backendCache = {};

class NoContainerError extends Error {
  constructor(
    message = "Agent has no container assigned (still provisioning, failed, or already destroyed)",
  ) {
    super(message);
    this.name = "NoContainerError";
    this.statusCode = 409;
    this.code = "NO_CONTAINER";
  }
}

function ensureContainerId(agent, operation) {
  const id = agent?.container_id;
  if (typeof id !== "string" || id.length === 0) {
    throw new NoContainerError(
      `Cannot ${operation}: agent ${agent?.id || "<unknown>"} has no container_id`,
    );
  }
  return id;
}

/**
 * Resolve the path to a backend module.
 * In Docker: backends are mounted at /app/backends/ via docker-compose.
 * In dev/local: fall back to ../workers/provisioner/backends/ relative path.
 */
function resolveBackendPath(name) {
  const localPath = path.resolve(__dirname, "backends", name);
  const workerPath = path.resolve(__dirname, "../workers/provisioner/backends", name);
  try {
    require.resolve(localPath);
    return localPath;
  } catch {
    return workerPath;
  }
}

function getBackendInstance(type) {
  if (backendCache[type]) return backendCache[type];

  switch (type) {
    case "docker": {
      const DockerBackend = require(resolveBackendPath("docker"));
      backendCache[type] = new DockerBackend();
      break;
    }
    case "docker:hermes": {
      const HermesBackend = require(resolveBackendPath("hermes"));
      backendCache[type] = new HermesBackend();
      break;
    }
    case "docker:nemoclaw": {
      const NemoClawBackend = require(resolveBackendPath("nemoclaw"));
      backendCache[type] = new NemoClawBackend();
      break;
    }
    case "proxmox": {
      const ProxmoxBackend = require(resolveBackendPath("proxmox"));
      backendCache[type] = new ProxmoxBackend();
      break;
    }
    case "k8s":
    case "kubernetes": {
      const K8sBackend = require(resolveBackendPath("k8s"));
      backendCache[type] = new K8sBackend();
      break;
    }
    default:
      throw new Error(`Unknown backend type: ${type}`);
  }

  return backendCache[type];
}

/**
 * Get the provisioner backend for a given agent row.
 * @param {{ backend_type?: string, deploy_target?: string, sandbox_profile?: string }} agent
 * @returns {import('../workers/provisioner/backends/interface')}
 */
function backendFor(agent) {
  const type = resolveAgentBackendType(agent);
  if (type === "docker") {
    if (resolveAgentRuntimeFamily(agent) === "hermes") {
      return getBackendInstance("docker:hermes");
    }
    if (resolveAgentSandboxProfile(agent) === "nemoclaw") {
      return getBackendInstance("docker:nemoclaw");
    }
  }
  return getBackendInstance(type);
}

// ── Public API ──────────────────────────────────────────

module.exports = {
  NoContainerError,
  ensureContainerId,

  /**
   * @param {{ backend_type?: string, deploy_target?: string, sandbox_profile?: string, container_id: string }} agent
   */
  async start(agent) {
    const id = ensureContainerId(agent, "start");
    return backendFor(agent).start(id);
  },

  async stop(agent) {
    const id = ensureContainerId(agent, "stop");
    return backendFor(agent).stop(id);
  },

  async restart(agent) {
    const id = ensureContainerId(agent, "restart");
    return backendFor(agent).restart(id);
  },

  async destroy(agent) {
    const id = ensureContainerId(agent, "destroy");
    return backendFor(agent).destroy(id);
  },

  /**
   * status() is a best-effort read called from background reconciliation and
   * live-status endpoints. Returning a stable "not running" shape (instead of
   * throwing) lets callers treat null-container as equivalent to a stopped
   * container without scattering try/catch everywhere.
   */
  async status(agent) {
    const id = agent?.container_id;
    if (typeof id !== "string" || id.length === 0) {
      return { running: false, uptime: 0, cpu: null, memory: null };
    }
    return backendFor(agent).status(id);
  },

  async stats(agent) {
    const id = agent?.container_id;
    if (typeof id !== "string" || id.length === 0) return null;
    const backend = backendFor(agent);
    if (typeof backend.stats === "function") {
      return backend.stats(id, agent);
    }
    return null;
  },

  /**
   * Stream container logs.
   * @returns {ReadableStream|null}
   */
  async logs(agent, opts = {}) {
    const id = ensureContainerId(agent, "stream logs");
    const backend = backendFor(agent);
    if (typeof backend.logs === "function") {
      return backend.logs(id, opts);
    }
    return null;
  },

  /**
   * Create an interactive exec session.
   * @returns {Object|null}
   */
  async exec(agent, opts = {}) {
    const id = ensureContainerId(agent, "exec");
    const backend = backendFor(agent);
    if (typeof backend.exec === "function") {
      return backend.exec(id, opts);
    }
    return null;
  },

  /** Expose the raw backend instance for advanced operations */
  backendFor,
};
