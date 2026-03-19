const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const { Pool } = require('pg');

// ── Connections ──────────────────────────────────────────
const connection = new IORedis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null
});

const db = new Pool({
  user: process.env.DB_USER || 'platform',
  password: process.env.DB_PASSWORD || 'platform',
  host: process.env.DB_HOST || 'postgres',
  database: process.env.DB_NAME || 'platform',
  port: parseInt(process.env.DB_PORT || '5432'),
});

// ── Pluggable Backend ────────────────────────────────────
function loadBackend(backendId) {
  const backend = (backendId || process.env.PROVISIONER_BACKEND || 'docker').toLowerCase();
  switch (backend) {
    case 'docker':
      return new (require('./backends/docker'))();
    case 'nemoclaw':
      return new (require('./backends/nemoclaw'))();
    case 'proxmox':
      return new (require('./backends/proxmox'))();
    case 'k8s':
    case 'kubernetes':
      return new (require('./backends/k8s'))();
    default:
      console.warn(`Unknown backend "${backend}", falling back to docker`);
      return new (require('./backends/docker'))();
  }
}

// Default backend from env — individual jobs can override via sandbox field
const defaultProvisioner = loadBackend();
const defaultBackendName = process.env.PROVISIONER_BACKEND || 'docker';
console.log(`Provisioner worker started [default backend=${defaultBackendName}]`);

// ── Worker ───────────────────────────────────────────────
const worker = new Worker('deployments', async (job) => {
  const { id, name, image, specs, userId, sandbox, container_name } = job.data;
  const vcpu = specs?.vcpu || 2;
  const ram_mb = specs?.ram_mb || 2048;
  const disk_gb = specs?.disk_gb || 20;

  // Select provisioner: per-job sandbox type overrides default backend
  const provisioner = sandbox === 'nemoclaw' ? loadBackend('nemoclaw') : defaultProvisioner;
  const backendName = sandbox === 'nemoclaw' ? 'nemoclaw' : defaultBackendName;

  console.log(`Processing deployment job ${job.id}: agent=${id} name=${name} backend=${backendName} (${vcpu}vCPU/${ram_mb}MB/${disk_gb}GB)`);

  // Fetch user's LLM provider keys from DB for injection into container
  let llmEnvVars = {};
  if (userId && (process.env.KEY_STORAGE || 'database') === 'database') {
    try {
      const keysResult = await db.query(
        "SELECT provider, api_key FROM llm_providers WHERE user_id = $1",
        [userId]
      );
      // Map provider names to env var names
      const providerEnvMap = {
        anthropic: 'ANTHROPIC_API_KEY',
        openai: 'OPENAI_API_KEY',
        google: 'GEMINI_API_KEY',
        groq: 'GROQ_API_KEY',
        mistral: 'MISTRAL_API_KEY',
        deepseek: 'DEEPSEEK_API_KEY',
        openrouter: 'OPENROUTER_API_KEY',
        together: 'TOGETHER_API_KEY',
        cohere: 'COHERE_API_KEY',
        xai: 'XAI_API_KEY',
        moonshot: 'MOONSHOT_API_KEY',
        zai: 'ZAI_API_KEY',
        ollama: 'OLLAMA_API_KEY',
        minimax: 'MINIMAX_API_KEY',
        'github-copilot': 'COPILOT_GITHUB_TOKEN',
        huggingface: 'HF_TOKEN',
        cerebras: 'CEREBRAS_API_KEY',
        nvidia: 'NVIDIA_API_KEY',
      };
      for (const row of keysResult.rows) {
        const envName = providerEnvMap[row.provider];
        if (envName && row.api_key) {
          // Decrypt if crypto module available
          try {
            const { decrypt } = require('../../backend-api/crypto');
            llmEnvVars[envName] = decrypt(row.api_key);
          } catch {
            llmEnvVars[envName] = row.api_key;
          }
        }
      }
      if (Object.keys(llmEnvVars).length > 0) {
        console.log(`[provisioner] Injecting ${Object.keys(llmEnvVars).length} LLM provider key(s) for user ${userId}`);
      }
    } catch (e) {
      console.warn(`[provisioner] Failed to fetch LLM keys for user ${userId}:`, e.message);
    }
  }

  let containerId, host, gatewayToken, containerName;
  try {
    const result = await provisioner.create({
      id,
      name,
      image: image || 'node:22-slim',
      vcpu,
      ram_mb,
      disk_gb,
      container_name,
      env: { AGENT_ID: String(id), AGENT_NAME: name || '', ...llmEnvVars },
    });
    containerId = result.containerId;
    host = result.host;
    gatewayToken = result.gatewayToken;
    containerName = result.containerName || container_name;
  } catch (err) {
    console.error(`[${backendName}] Provisioning failed for agent ${id}:`, err.message);
    // Mark as failed in DB
    await db.query("UPDATE agents SET status = 'error' WHERE id = $1", [id]);
    await db.query("UPDATE deployments SET status = 'failed' WHERE agent_id = $1", [id]);
    await db.query(
      "INSERT INTO events(type, message, metadata) VALUES($1, $2, $3)",
      ['agent_deploy_failed', `Agent "${name}" failed to deploy: ${err.message}`, JSON.stringify({ agentId: id })]
    );
    throw err;
  }

  // Update agent with real container info
  try {
    await db.query(
      "UPDATE agents SET status = 'running', container_id = $2, host = $3, backend_type = $4, gateway_token = $5, container_name = COALESCE($6, container_name) WHERE id = $1",
      [id, containerId, host, backendName, gatewayToken, containerName || null]
    );
    await db.query("UPDATE deployments SET status = 'completed' WHERE agent_id = $1", [id]);
    await db.query(
      "INSERT INTO events(type, message, metadata) VALUES($1, $2, $3)",
      ['agent_deployed', `Agent "${name}" is now running on ${backendName}`, JSON.stringify({ agentId: id, containerId, host })]
    );
    console.log(`Agent ${id} deployed: containerId=${containerId} host=${host}`);

    // Sync integrations to newly deployed agent container
    try {
      const intResult = await db.query(
        `SELECT i.id, i.provider, i.catalog_id, i.config, i.status,
                ic.name as catalog_name, ic.category as catalog_category
         FROM integrations i
         LEFT JOIN integration_catalog ic ON i.catalog_id = ic.id
         WHERE i.agent_id = $1 AND i.status = 'active'`,
        [id]
      );
      if (intResult.rows.length > 0) {
        const syncData = intResult.rows.map((r) => ({
          id: r.id,
          provider: r.provider,
          name: r.catalog_name || r.provider,
          category: r.catalog_category || "unknown",
          config: typeof r.config === "string" ? JSON.parse(r.config) : (r.config || {}),
          status: r.status,
        }));
        await fetch(`http://${host}:9090/integrations/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(syncData),
        });
        console.log(`[provisioner] Synced ${syncData.length} integration(s) to agent ${id}`);
      }
    } catch (e) {
      console.warn(`[provisioner] Failed to sync integrations for agent ${id}:`, e.message);
    }
  } catch (err) {
    console.error('Failed to update agent status:', err.message);
    throw err;
  }
}, { connection, concurrency: 3 });

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed: ${err.message}`);
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});
