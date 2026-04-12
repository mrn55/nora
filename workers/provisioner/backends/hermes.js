const crypto = require("crypto");
const DockerBackend = require("./docker");
const {
  buildDockerTelemetry,
  buildUnavailableTelemetry,
  DOCKER_CAPABILITIES,
  uptimeFromContainerInfo,
} = require("./telemetry");
const {
  getHermesDockerAgentImage,
} = require("../../../agent-runtime/lib/agentImages");

const HERMES_RUNTIME_PORT = 8642;
const HERMES_HOME = "/opt/data";
const HERMES_WORKSPACE = `${HERMES_HOME}/workspace`;

function throwIfAborted(abortSignal, stage = "hermes create") {
  if (!abortSignal?.aborted) return;
  const reason =
    abortSignal.reason instanceof Error
      ? abortSignal.reason
      : new Error(
          typeof abortSignal.reason === "string" && abortSignal.reason
            ? abortSignal.reason
            : `${stage} aborted`
        );
  throw reason;
}

function safeHostname(name, fallback) {
  return (
    String(name || fallback || "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 63) || fallback
  );
}

class HermesBackend extends DockerBackend {
  async _ensureImage(imgName) {
    try {
      await this.docker.getImage(imgName).inspect();
      console.log(`[hermes] Image ${imgName} already present`);
      return;
    } catch {
      // Pull below.
    }

    console.log(`[hermes] Pulling image ${imgName}...`);
    await new Promise((resolve, reject) => {
      this.docker.pull(imgName, (err, stream) => {
        if (err) return reject(err);
        this.docker.modem.followProgress(stream, (followErr) => {
          if (followErr) return reject(followErr);
          console.log(`[hermes] Image ${imgName} pulled successfully`);
          resolve();
        });
      });
    });
  }

  async create(config) {
    const {
      id,
      name,
      image,
      vcpu,
      ram_mb,
      env,
      container_name,
      abortSignal,
    } = config;
    const containerName = container_name || `hermes-agent-${id}`;
    const imgName = image || getHermesDockerAgentImage();
    let container = null;

    console.log(`[hermes] Creating container ${containerName} from ${imgName}`);
    throwIfAborted(abortSignal, `hermes create for ${containerName}`);
    await this._ensureImage(imgName);
    throwIfAborted(abortSignal, `hermes create for ${containerName}`);

    try {
      const existing = this.docker.getContainer(containerName);
      const info = await existing.inspect();
      console.log(
        `[hermes] Removing orphaned container ${info.Id.slice(0, 12)} (${containerName})`
      );
      try {
        await existing.stop({ t: 5 });
      } catch {
        // Already stopped.
      }
      await existing.remove({ force: true });
    } catch {
      // No existing container.
    }

    const apiServerKey = crypto.randomBytes(32).toString("hex");
    const envArray = Object.entries({
      ...(env || {}),
      HERMES_HOME,
      HOME: `${HERMES_HOME}/home`,
      API_SERVER_ENABLED: "true",
      API_SERVER_HOST: "0.0.0.0",
      API_SERVER_PORT: String(HERMES_RUNTIME_PORT),
      API_SERVER_KEY: apiServerKey,
      MESSAGING_CWD: HERMES_WORKSPACE,
      TERMINAL_CWD: HERMES_WORKSPACE,
    }).map(([key, value]) => `${key}=${value}`);

    const composeNetwork = await this._findComposeNetwork();
    const networkingConfig = composeNetwork
      ? { [composeNetwork]: {} }
      : undefined;
    const hostname = safeHostname(name || containerName, `hermes-${id}`);

    try {
      throwIfAborted(abortSignal, `hermes create for ${containerName}`);
      container = await this.docker.createContainer({
        Image: imgName,
        name: containerName,
        Hostname: hostname,
        Env: envArray,
        Cmd: ["gateway", "run"],
        WorkingDir: HERMES_HOME,
        ExposedPorts: { [`${HERMES_RUNTIME_PORT}/tcp`]: {} },
        HostConfig: {
          NanoCpus: (vcpu || 2) * 1e9,
          Memory: (ram_mb || 2048) * 1024 * 1024,
          RestartPolicy: { Name: "unless-stopped" },
          Dns: ["8.8.8.8", "8.8.4.4", "1.1.1.1"],
        },
        NetworkingConfig: composeNetwork
          ? {
              EndpointsConfig: networkingConfig,
            }
          : undefined,
        Labels: {
          "nora.agent.id": String(id),
          "nora.agent.name": name || "",
          "nora.runtime.family": "hermes",
          "nora.runtime.port": String(HERMES_RUNTIME_PORT),
        },
      });

      throwIfAborted(abortSignal, `hermes start for ${containerName}`);
      await container.start();

      try {
        const bridgeNet = this.docker.getNetwork("bridge");
        await bridgeNet.connect({ Container: container.id });
        console.log("[hermes] Connected container to bridge network for internet access");
      } catch (error) {
        console.warn(`[hermes] Could not connect to bridge network: ${error.message}`);
      }

      const info = await container.inspect();
      let host = "localhost";
      if (composeNetwork && info.NetworkSettings?.Networks?.[composeNetwork]) {
        host = info.NetworkSettings.Networks[composeNetwork].IPAddress || "localhost";
      } else {
        host = info.NetworkSettings?.IPAddress || "localhost";
      }

      console.log(
        `[hermes] Container ${container.id} started at ${host}:${HERMES_RUNTIME_PORT}`
      );

      return {
        containerId: container.id,
        containerName,
        gatewayToken: apiServerKey,
        host,
        runtimeHost: host,
        runtimePort: HERMES_RUNTIME_PORT,
      };
    } catch (error) {
      if (container) {
        try {
          await container.remove({ force: true });
        } catch {
          // Best-effort cleanup only.
        }
      }
      throw error;
    }
  }

  async stats(containerId) {
    let info = null;

    try {
      const container = this.docker.getContainer(containerId);
      info = await container.inspect();

      if (!info.State?.Running) {
        return buildUnavailableTelemetry({
          backendType: "hermes",
          running: false,
          uptime_seconds: uptimeFromContainerInfo(info),
          capabilities: DOCKER_CAPABILITIES,
        });
      }

      const stats = await container.stats({ stream: false });
      return buildDockerTelemetry({ stats, info, backendType: "hermes" });
    } catch {
      return buildUnavailableTelemetry({
        backendType: "hermes",
        running: Boolean(info?.State?.Running),
        uptime_seconds: uptimeFromContainerInfo(info),
        capabilities: DOCKER_CAPABILITIES,
      });
    }
  }
}

module.exports = HermesBackend;
