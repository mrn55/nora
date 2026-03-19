const Docker = require("dockerode");
const ProvisionerBackend = require("./interface");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

class DockerBackend extends ProvisionerBackend {
  constructor() {
    super();
    this.docker = new Docker({ socketPath: "/var/run/docker.sock" });
    this._composeNetwork = null; // cached
  }

  /**
   * Find the Docker Compose-managed network so agent containers can communicate
   * with backend-api and other platform services.
   */
  async _findComposeNetwork() {
    if (this._composeNetwork) return this._composeNetwork;
    const networks = await this.docker.listNetworks();
    // Compose v2 names networks: <project>_default
    const net = networks.find(n =>
      n.Name.includes("openclaw") && n.Name.includes("default")
    );
    if (net) {
      this._composeNetwork = net.Name;
      console.log(`[docker] Using Compose network: ${net.Name}`);
    }
    return this._composeNetwork;
  }

  async create(config) {
    const { id, name, image, vcpu, ram_mb, disk_gb, env, container_name } = config;
    const containerName = container_name || `oclaw-agent-${id}`;

    const imgName = image || "node:22-slim";
    console.log(`[docker] Creating container ${containerName} from ${imgName}`);

    // Pull the image if not already available locally
    try {
      await this.docker.getImage(imgName).inspect();
      console.log(`[docker] Image ${imgName} already present`);
    } catch {
      console.log(`[docker] Pulling image ${imgName}...`);
      await new Promise((resolve, reject) => {
        this.docker.pull(imgName, (err, stream) => {
          if (err) return reject(err);
          this.docker.modem.followProgress(stream, (err) => {
            if (err) return reject(err);
            console.log(`[docker] Image ${imgName} pulled successfully`);
            resolve();
          });
        });
      });
    }

    // Remove any existing container with the same name (orphaned from prior deploy)
    try {
      const existing = this.docker.getContainer(containerName);
      const info = await existing.inspect();
      console.log(`[docker] Removing orphaned container ${info.Id.slice(0, 12)} (${containerName})`);
      try { await existing.stop({ t: 5 }); } catch { /* already stopped */ }
      await existing.remove({ force: true });
    } catch {
      // No existing container — expected path
    }

    // Generate per-agent Gateway auth token
    const gatewayToken = crypto.randomBytes(16).toString("hex");

    // Derive deterministic Ed25519 device identity from gatewayToken —
    // same derivation used by gatewayProxy.js so both sides share the keypair.
    const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
    const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
    const seed = crypto.createHash("sha256").update("openclaw-device:" + gatewayToken).digest();
    const privateDer = Buffer.concat([PKCS8_PREFIX, seed]);
    const privateKey = crypto.createPrivateKey({ key: privateDer, format: "der", type: "pkcs8" });
    const publicKey = crypto.createPublicKey(privateKey);
    const spki = publicKey.export({ type: "spki", format: "der" });
    const rawPub = spki.subarray(ED25519_SPKI_PREFIX.length);
    const deviceId = crypto.createHash("sha256").update(rawPub).digest("hex");
    const pubB64 = rawPub.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");

    // Pre-approved device pairing JSON — gateway reads this on startup so the
    // proxy's first connect (using the same deterministic identity) is already
    // paired and receives full operator scopes.
    const allScopes = ["operator.admin","operator.read","operator.write","operator.approvals","operator.pairing"];
    const nowMs = Date.now();
    const pairedJson = JSON.stringify({
      [deviceId]: {
        deviceId,
        publicKey: pubB64,
        platform: "linux",
        clientId: "gateway-client",
        clientMode: "backend",
        role: "operator",
        roles: ["operator"],
        scopes: allScopes,
        approvedScopes: allScopes,
        tokens: {
          operator: {
            token: crypto.randomBytes(32).toString("hex"),
            role: "operator",
            scopes: allScopes,
            createdAtMs: nowMs,
          }
        },
        createdAtMs: nowMs,
        approvedAtMs: nowMs,
      }
    });

    // Convert env object to array of KEY=VALUE + inject gateway token
    const envArray = env
      ? Object.entries(env).map(([k, v]) => `${k}=${v}`)
      : [];
    envArray.push(`OPENCLAW_GATEWAY_TOKEN=${gatewayToken}`);

    // Build auth-profiles.json from any LLM API keys in env
    const llmKeyMap = {
      ANTHROPIC_API_KEY: "anthropic",
      OPENAI_API_KEY: "openai",
      GEMINI_API_KEY: "google",
      GROQ_API_KEY: "groq",
      MISTRAL_API_KEY: "mistral",
      DEEPSEEK_API_KEY: "deepseek",
      OPENROUTER_API_KEY: "openrouter",
      TOGETHER_API_KEY: "together",
      COHERE_API_KEY: "cohere",
      XAI_API_KEY: "xai",
      MOONSHOT_API_KEY: "moonshot",
      ZAI_API_KEY: "zai",
      OLLAMA_API_KEY: "ollama",
      MINIMAX_API_KEY: "minimax",
      COPILOT_GITHUB_TOKEN: "github-copilot",
      HF_TOKEN: "huggingface",
      CEREBRAS_API_KEY: "cerebras",
      NVIDIA_API_KEY: "nvidia",
    };
    const authProfiles = {};
    if (env) {
      for (const [envKey, provider] of Object.entries(llmKeyMap)) {
        if (env[envKey]) {
          authProfiles[provider] = { apiKey: env[envKey] };
        }
      }
    }
    const hasAuthProfiles = Object.keys(authProfiles).length > 0;
    const authProfilesCmd = hasAuthProfiles
      ? `mkdir -p /root/.openclaw/agents/main/agent && echo '${JSON.stringify(authProfiles).replace(/'/g, "'\\''")}' > /root/.openclaw/agents/main/agent/auth-profiles.json && `
      : "";

    // CMD: install openclaw, configure gateway + pre-approved pairing, write auth profiles, and start it
    const startCmd = [
      "sh", "-c",
      'apt-get update -qq && apt-get install -y -qq git > /dev/null 2>&1 && ' +
      'npm install -g openclaw@latest 2>&1 && ' +
      'mkdir -p ~/.openclaw/devices && ' +
      'echo \'' + JSON.stringify(JSON.parse('{"gateway":{"port":18789,"bind":"lan","mode":"local"}}')) + '\' > ~/.openclaw/openclaw.json && ' +
      "echo '" + pairedJson.replace(/'/g, "'\\''") + "' > ~/.openclaw/devices/paired.json && " +
      'echo \'{}\' > ~/.openclaw/devices/pending.json && ' +
      authProfilesCmd +
      `openclaw gateway --port 18789 --password ${gatewayToken}`
    ];

    // Resolve the Compose network for cross-service communication
    const composeNetwork = await this._findComposeNetwork();
    const networkingConfig = {};
    if (composeNetwork) {
      networkingConfig[composeNetwork] = {};
    }

    const container = await this.docker.createContainer({
      Image: imgName,
      name: containerName,
      Env: envArray,
      Cmd: startCmd,
      WorkingDir: "/root",
      ExposedPorts: { "18789/tcp": {} },
      HostConfig: {
        // CPU: vcpu cores -> NanoCPUs
        NanoCpus: (vcpu || 2) * 1e9,
        // Memory in bytes
        Memory: (ram_mb || 2048) * 1024 * 1024,
        // Restart policy
        RestartPolicy: { Name: "unless-stopped" },
        // DNS servers for internet access from within the container
        Dns: ["8.8.8.8", "8.8.4.4", "1.1.1.1"],
      },
      NetworkingConfig: composeNetwork ? {
        EndpointsConfig: networkingConfig,
      } : undefined,
      Labels: {
        "openclaw.agent.id": String(id),
        "openclaw.agent.name": name || "",
        "openclaw.gateway.port": "18789",
      },
    });

    await container.start();

    // Connect to bridge network for internet access (in addition to compose network)
    try {
      const bridgeNet = this.docker.getNetwork("bridge");
      await bridgeNet.connect({ Container: container.id });
      console.log(`[docker] Connected container to bridge network for internet access`);
    } catch (e) {
      console.warn(`[docker] Could not connect to bridge network: ${e.message}`);
    }

    // Get the IP on the Compose network (preferred) or default bridge
    const info = await container.inspect();
    let host = "localhost";
    if (composeNetwork && info.NetworkSettings?.Networks?.[composeNetwork]) {
      host = info.NetworkSettings.Networks[composeNetwork].IPAddress || "localhost";
    } else {
      host = info.NetworkSettings?.IPAddress || "localhost";
    }

    console.log(`[docker] Container ${container.id} started at ${host} (gateway port 18789)`);
    return { containerId: container.id, host, gatewayToken, containerName };
  }

  async destroy(containerId) {
    console.log(`[docker] Destroying container ${containerId}`);
    const container = this.docker.getContainer(containerId);
    try {
      await container.stop({ t: 10 });
    } catch (e) {
      // Already stopped
    }
    await container.remove({ force: true });
    console.log(`[docker] Container ${containerId} removed`);
  }

  async status(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      const running = info.State?.Running || false;
      const startedAt = info.State?.StartedAt
        ? new Date(info.State.StartedAt).getTime()
        : 0;
      const uptime = running ? Date.now() - startedAt : 0;

      return { running, uptime, cpu: null, memory: null };
    } catch {
      return { running: false, uptime: 0, cpu: null, memory: null };
    }
  }

  async stop(containerId) {
    console.log(`[docker] Stopping container ${containerId}`);
    const container = this.docker.getContainer(containerId);
    await container.stop({ t: 10 });
    console.log(`[docker] Container ${containerId} stopped`);
  }

  async start(containerId) {
    console.log(`[docker] Starting container ${containerId}`);
    const container = this.docker.getContainer(containerId);
    await container.start();
    console.log(`[docker] Container ${containerId} started`);
  }

  async restart(containerId) {
    console.log(`[docker] Restarting container ${containerId}`);
    const container = this.docker.getContainer(containerId);
    await container.restart({ t: 10 });
    console.log(`[docker] Container ${containerId} restarted`);
  }

  async logs(containerId, opts = {}) {
    const container = this.docker.getContainer(containerId);
    const stream = await container.logs({
      follow: opts.follow !== false,
      stdout: true,
      stderr: true,
      tail: opts.tail || 100,
      timestamps: opts.timestamps !== false,
    });
    return stream;
  }

  async exec(containerId, opts = {}) {
    const container = this.docker.getContainer(containerId);
    const execInstance = await container.exec({
      Cmd: opts.cmd || ["/bin/sh", "-c", "command -v bash >/dev/null 2>&1 && exec bash || exec sh"],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: opts.tty !== false,
      Env: opts.env || ["TERM=xterm-256color"],
    });
    const stream = await execInstance.start({
      hijack: true,
      stdin: true,
      Tty: opts.tty !== false,
    });
    return { exec: execInstance, stream };
  }
}

module.exports = DockerBackend;
