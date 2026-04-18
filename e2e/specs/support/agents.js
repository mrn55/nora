// @ts-check
// API-level helpers for the real-creds specs. Everything goes through the
// platform HTTP API — no DB or shell access, so the same helpers work whether
// the backend runs under docker-compose.yml or docker-compose.e2e.yml.

const { apiJson } = require("./app");

async function getPlatformConfig(request, token) {
  const { body } = await apiJson(request, "/api/config/platform", { token });
  return body || {};
}

function backendSupported(platform, backendId) {
  const enabled = platform.enabledBackends || platform.enabledDeployTargets || [];
  return enabled.includes(backendId);
}

function runtimeSupported(platform, runtimeFamily) {
  const families = Array.isArray(platform.runtimeFamilies)
    ? platform.runtimeFamilies
    : [];
  return families.some(
    (fam) => (fam?.id || fam?.runtimeFamily) === runtimeFamily
  );
}

async function deployAgent(
  request,
  token,
  {
    name,
    runtimeFamily = "openclaw",
    backend = "docker",
    sandboxProfile = "standard",
    vcpu = 1,
    ramMb = 1024,
    diskGb = 5,
    image,
    model,
  } = {}
) {
  const { body } = await apiJson(request, "/api/agents/deploy", {
    method: "POST",
    token,
    data: {
      name,
      runtime_family: runtimeFamily,
      backend_type: backend,
      deploy_target: backend,
      sandbox_profile: sandboxProfile,
      vcpu,
      ram_mb: ramMb,
      disk_gb: diskGb,
      image,
      model,
    },
  });
  return body;
}

async function getAgent(request, token, agentId) {
  const { body } = await apiJson(request, `/api/agents/${agentId}`, { token });
  return body;
}

async function waitForAgentStatus(
  request,
  token,
  agentId,
  desiredStatuses,
  { timeoutMs = 300000, intervalMs = 5000 } = {}
) {
  const targets = Array.isArray(desiredStatuses)
    ? desiredStatuses
    : [desiredStatuses];
  const startedAt = Date.now();
  let lastStatus = "unknown";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const agent = await getAgent(request, token, agentId);
      lastStatus = agent?.status || "unknown";
      if (targets.includes(lastStatus)) return agent;
      if (lastStatus === "error" && !targets.includes("error")) {
        throw new Error(
          `Agent ${agentId} entered error state (last message: ${agent?.status_message || "none"})`
        );
      }
    } catch (err) {
      if (String(err?.message || "").includes("error state")) throw err;
      // 404 / transient — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timed out waiting for agent ${agentId} to reach ${targets.join(" | ")}; last status: ${lastStatus}`
  );
}

async function stopAgent(request, token, agentId) {
  await apiJson(request, `/api/agents/${agentId}/stop`, {
    method: "POST",
    token,
  });
}

async function startAgent(request, token, agentId) {
  await apiJson(request, `/api/agents/${agentId}/start`, {
    method: "POST",
    token,
  });
}

async function deleteAgent(request, token, agentId) {
  await apiJson(request, `/api/agents/${agentId}`, {
    method: "DELETE",
    token,
    failOnStatus: false,
  });
}

async function chatOpenClaw(request, token, agentId, message) {
  const { body } = await apiJson(
    request,
    `/api/agents/${agentId}/gateway/chat`,
    {
      method: "POST",
      token,
      data: { message, stream: false },
    }
  );
  return body;
}

async function chatHermes(request, token, agentId, message) {
  const { body } = await apiJson(
    request,
    `/api/agents/${agentId}/hermes-ui/chat`,
    {
      method: "POST",
      token,
      data: { message },
    }
  );
  return body;
}

async function chatWithAgent(request, token, agent, message) {
  const family = agent.runtime_family || "openclaw";
  if (family === "hermes") return chatHermes(request, token, agent.id, message);
  return chatOpenClaw(request, token, agent.id, message);
}

// ── LLM provider key ──────────────────────────────────────
async function saveProviderKey(request, token, { provider, apiKey, model }) {
  const { body } = await apiJson(request, "/api/llm-providers", {
    method: "POST",
    token,
    data: { provider, api_key: apiKey, model },
  });
  return body;
}

async function listProviders(request, token) {
  const { body } = await apiJson(request, "/api/llm-providers", { token });
  return Array.isArray(body) ? body : [];
}

// ── Integrations ──────────────────────────────────────────
async function connectIntegration(
  request,
  token,
  agentId,
  { provider, token: providerToken, config = {} }
) {
  const { body } = await apiJson(
    request,
    `/api/agents/${agentId}/integrations`,
    {
      method: "POST",
      token,
      data: { provider, token: providerToken, config },
    }
  );
  return body;
}

async function testIntegration(request, token, agentId, integrationId) {
  const { body } = await apiJson(
    request,
    `/api/agents/${agentId}/integrations/${integrationId}/test`,
    { method: "POST", token, failOnStatus: false }
  );
  return body;
}

async function listAgentIntegrations(request, token, agentId) {
  const { body } = await apiJson(
    request,
    `/api/agents/${agentId}/integrations`,
    { token }
  );
  return Array.isArray(body) ? body : [];
}

async function deleteIntegration(request, token, agentId, integrationId) {
  await apiJson(
    request,
    `/api/agents/${agentId}/integrations/${integrationId}`,
    { method: "DELETE", token, failOnStatus: false }
  );
}

// ── Channels ──────────────────────────────────────────────
async function createChannel(
  request,
  token,
  agentId,
  { type, name, config = {} }
) {
  const { body, response } = await apiJson(
    request,
    `/api/agents/${agentId}/channels`,
    {
      method: "POST",
      token,
      data: { type, name, config },
      failOnStatus: false,
    }
  );
  if (!response.ok()) {
    throw Object.assign(
      new Error(
        `createChannel(${type}) failed: ${response.status()} ${JSON.stringify(body)}`
      ),
      { status: response.status(), body }
    );
  }
  return body;
}

async function testChannel(request, token, agentId, channelId) {
  const { body } = await apiJson(
    request,
    `/api/agents/${agentId}/channels/${channelId}/test`,
    { method: "POST", token, failOnStatus: false }
  );
  return body;
}

async function deleteChannel(request, token, agentId, channelId) {
  await apiJson(request, `/api/agents/${agentId}/channels/${channelId}`, {
    method: "DELETE",
    token,
    failOnStatus: false,
  });
}

module.exports = {
  getPlatformConfig,
  backendSupported,
  runtimeSupported,
  deployAgent,
  getAgent,
  waitForAgentStatus,
  stopAgent,
  startAgent,
  deleteAgent,
  chatWithAgent,
  chatOpenClaw,
  chatHermes,
  saveProviderKey,
  listProviders,
  connectIntegration,
  testIntegration,
  listAgentIntegrations,
  deleteIntegration,
  createChannel,
  testChannel,
  deleteChannel,
};
