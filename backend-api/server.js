const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { addDeploymentJob } = require("./redisQueue");
const scheduler = require("./scheduler");
const marketplace = require("./marketplace");
const snapshots = require("./snapshots");
const workspaces = require("./workspaces");
const integrations = require("./integrations");
const monitoring = require("./monitoring");
const billing = require("./billing");
const channels = require("./channels");
const llmProviders = require("./llmProviders");
const { authenticateToken, requireAdmin } = require("./middleware/auth");
const containerManager = require("./containerManager");
const { createGatewayRouter, attachGatewayWS } = require("./gatewayProxy");

const crypto = require("crypto");
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const generated = crypto.randomBytes(32).toString("hex");
  console.warn("WARNING: JWT_SECRET not configured. Generated ephemeral secret — tokens will invalidate on restart. Set JWT_SECRET in .env for production.");
  process.env.JWT_SECRET = generated;
  return generated;
})();

// ─── Validation Helpers ──────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateEmail(email) {
  if (!email || typeof email !== "string") return "Email is required";
  if (!EMAIL_RE.test(email)) return "Invalid email format";
  if (email.length > 255) return "Email too long";
  return null;
}
function validatePassword(pw) {
  if (!pw || typeof pw !== "string") return "Password is required";
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (pw.length > 128) return "Password too long";
  return null;
}

const app = express();

// ─── Security Middleware ─────────────────────────────────────────
// Trust the nginx reverse proxy so rate limiting uses the real client IP
app.set("trust proxy", 1);

app.use(helmet());
const corsOrigins = (process.env.CORS_ORIGINS || "http://localhost:8080").split(",").map(s => s.trim());
app.use(cors({ origin: corsOrigins }));

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts, please try again later" } });
app.use(globalLimiter);

// Stripe webhook needs raw body — must come before express.json()
// Only register when billing is enabled
if (billing.BILLING_ENABLED) {
  app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).json({ error: "Webhook secret not configured" });
    try {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      await billing.handleWebhookEvent(event);
      res.json({ received: true });
    } catch (e) {
      console.error("Webhook error:", e.message);
      res.status(400).json({ error: e.message });
    }
  });
}

app.use(express.json());

// ─── Public Routes ────────────────────────────────────────────────

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/auth/signup", authLimiter, async (req, res) => {
  const { email, password } = req.body;
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      "INSERT INTO users(email, password_hash) VALUES($1, $2) RETURNING id, email",
      [email, hash]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/auth/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  try {
    const result = await db.query("SELECT * FROM users WHERE email=$1", [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "invalid" });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid" });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Marketplace browse is public
app.get("/marketplace", async (req, res) => {
  try {
    res.json(await marketplace.listMarketplace());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Inbound webhook receiver (public — external services POST here)
app.post("/webhooks/:channelId", async (req, res) => {
  try {
    await channels.handleInboundWebhook(req.params.channelId, req.body, req.headers);
    res.json({ received: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// OAuth login — upserts user by email, returns platform JWT
app.post("/auth/oauth-login", authLimiter, async (req, res) => {
  const { email, name, provider, providerId } = req.body;
  if (!email || !provider) return res.status(400).json({ error: "email and provider required" });
  try {
    const result = await db.query(
      `INSERT INTO users(email, name, provider, provider_id)
       VALUES($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, users.name),
         provider = COALESCE(EXCLUDED.provider, users.provider),
         provider_id = COALESCE(EXCLUDED.provider_id, users.provider_id)
       RETURNING id, email, role, name`,
      [email, name || null, provider, providerId || null]
    );
    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Protected Routes ─────────────────────────────────────────────

app.use(authenticateToken);

// ─── Gateway Proxy Routes ─────────────────────────────────────────
app.use(createGatewayRouter());

// ─── Agents ───────────────────────────────────────────────────────

app.get("/agents", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM agents WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/agents/:id", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM agents WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Agent not found" });

    const agent = result.rows[0];

    // Live status reconciliation — check actual container state
    if (agent.container_id && (agent.status === "running" || agent.status === "error" || agent.status === "stopped")) {
      try {
        const live = await containerManager.status(agent);
        const liveStatus = live.running ? "running" : "stopped";
        if (liveStatus !== agent.status && agent.status !== "queued" && agent.status !== "deploying") {
          await db.query("UPDATE agents SET status = $1 WHERE id = $2", [liveStatus, agent.id]);
          agent.status = liveStatus;
        }
      } catch {
        // Can't reach container runtime — leave DB status as-is
      }
    }

    res.json(agent);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/agents/deploy", async (req, res) => {
  try {
    // Enforce billing limits
    const limits = await billing.enforceLimits(req.user.id);
    if (!limits.allowed) return res.status(402).json({ error: limits.error, subscription: limits.subscription });

    const sub = limits.subscription;
    const node = await scheduler.selectNode();
    const name = req.body.name || "OpenClaw-Agent-" + Math.floor(Math.random() * 1000);
    if (name.length > 100) return res.status(400).json({ error: "Agent name must be 100 characters or less" });
    const containerNameRaw = (req.body.container_name || "").trim();
    const containerName = containerNameRaw || `oclaw-agent-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;
    const nodeName = node ? node.name : "worker-01";

    // NemoClaw sandbox support
    const sandbox = req.body.sandbox === "nemoclaw" ? "nemoclaw" : "standard";
    if (sandbox === "nemoclaw" && process.env.NEMOCLAW_ENABLED !== "true") {
      return res.status(400).json({ error: "NemoClaw is not enabled. Set NEMOCLAW_ENABLED=true in .env" });
    }

    // Resolve resource specs based on platform mode
    let specs;
    if (!billing.IS_PAAS) {
      // Self-hosted: accept user-chosen values clamped to operator limits
      const lim = billing.SELFHOSTED_LIMITS;
      specs = {
        vcpu:    Math.max(1, Math.min(parseInt(req.body.vcpu)    || 2,    lim.max_vcpu)),
        ram_mb:  Math.max(512, Math.min(parseInt(req.body.ram_mb)  || 2048, lim.max_ram_mb)),
        disk_gb: Math.max(1, Math.min(parseInt(req.body.disk_gb) || 20,   lim.max_disk_gb)),
      };
    } else {
      // PaaS: resources locked to subscription plan
      specs = { vcpu: sub.vcpu || 2, ram_mb: sub.ram_mb || 2048, disk_gb: sub.disk_gb || 20 };
    }

    const result = await db.query(
      "INSERT INTO agents(user_id, name, status, node, sandbox_type, vcpu, ram_mb, disk_gb, container_name) VALUES($1, $2, 'queued', $3, $4, $5, $6, $7, $8) RETURNING *",
      [req.user.id, name, nodeName, sandbox, specs.vcpu, specs.ram_mb, specs.disk_gb, containerName]
    );
    const agent = result.rows[0];

    // Create deployment record
    await db.query(
      "INSERT INTO deployments(agent_id, status) VALUES($1, 'queued')",
      [agent.id]
    );

    // Queue for worker processing — include resolved specs + sandbox type
    await addDeploymentJob({
      id: agent.id,
      name: agent.name,
      userId: req.user.id,
      plan: sub.plan,
      sandbox,
      specs,
      container_name: containerName,
    });

    // Log event
    const deployType = sandbox === "nemoclaw" ? "NemoClaw + OpenClaw" : "OpenClaw + Docker";
    await monitoring.logEvent("agent_deployed", `Agent "${name}" (${deployType}) queued for deployment`, { agentId: agent.id });

    res.json(agent);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/agents/:id/start", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM agents WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    const agent = result.rows[0];
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (!agent.container_id) return res.status(400).json({ error: "No container — redeploy the agent first" });

    await containerManager.start(agent);

    const updated = await db.query(
      "UPDATE agents SET status = 'running' WHERE id = $1 RETURNING *", [agent.id]
    );
    res.json(updated.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/agents/:id/stop", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM agents WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    const agent = result.rows[0];
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    if (agent.container_id) {
      try {
        await containerManager.stop(agent);
      } catch (e) {
        if (!e.message.includes("already stopped") && !e.message.includes("not running")) {
          console.error("Container stop error:", e.message);
        }
      }
    }

    const updated = await db.query(
      "UPDATE agents SET status = 'stopped' WHERE id = $1 RETURNING *", [agent.id]
    );
    res.json(updated.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/agents/:id/delete", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM agents WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    const agent = result.rows[0];
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    if (agent.container_id) {
      try {
        await containerManager.destroy(agent);
      } catch (e) {
        console.error("Container cleanup error:", e.message);
      }
    }

    await db.query("DELETE FROM agents WHERE id = $1", [agent.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE verb alias
app.delete("/agents/:id", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM agents WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    const agent = result.rows[0];
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    if (agent.container_id) {
      try {
        await containerManager.destroy(agent);
      } catch (e) {
        console.error("Container cleanup error:", e.message);
      }
    }

    await db.query("DELETE FROM agents WHERE id = $1", [agent.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Restart is stop + start of the actual container
app.post("/agents/:id/restart", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM agents WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    const agent = result.rows[0];
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (!agent.container_id) return res.status(400).json({ error: "No container — redeploy the agent first" });

    await containerManager.restart(agent);

    await db.query("UPDATE agents SET status = 'running' WHERE id = $1", [agent.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Redeploy a failed/error agent — re-queues the provisioning job
app.post("/agents/:id/redeploy", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM agents WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    const agent = result.rows[0];
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (agent.status !== "error" && agent.status !== "stopped") {
      return res.status(400).json({ error: "Agent must be in error or stopped state to redeploy" });
    }

    // Reset agent status
    await db.query(
      "UPDATE agents SET status = 'queued', container_id = NULL, host = NULL WHERE id = $1",
      [agent.id]
    );

    // Create new deployment record
    await db.query(
      "INSERT INTO deployments(agent_id, status) VALUES($1, 'queued')",
      [agent.id]
    );

    // Re-queue for provisioning — include all fields so the worker uses the correct container name
    await addDeploymentJob({
      id: agent.id,
      name: agent.name,
      userId: req.user.id,
      sandbox: agent.sandbox_type || "standard",
      specs: { vcpu: agent.vcpu || 2, ram_mb: agent.ram_mb || 2048, disk_gb: agent.disk_gb || 20 },
      container_name: agent.container_name,
    });

    await monitoring.logEvent("agent_redeployed", `Agent "${agent.name}" re-queued for deployment`, { agentId: agent.id });

    res.json({ success: true, status: "queued" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── LLM Provider Management ─────────────────────────────────────

app.get("/llm-providers/available", authenticateToken, (req, res) => {
  res.json(llmProviders.getAvailableProviders());
});

app.get("/llm-providers", authenticateToken, async (req, res) => {
  try {
    res.json(await llmProviders.listProviders(req.user.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/llm-providers", authenticateToken, async (req, res) => {
  try {
    const { provider, apiKey, model, config } = req.body;
    if (!provider || !apiKey) return res.status(400).json({ error: "provider and apiKey required" });
    const result = await llmProviders.addProvider(req.user.id, provider, apiKey, model, config);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/llm-providers/:id", authenticateToken, async (req, res) => {
  try {
    const result = await llmProviders.updateProvider(req.params.id, req.user.id, req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/llm-providers/:id", authenticateToken, async (req, res) => {
  try {
    await llmProviders.deleteProvider(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Integration Sync Helper ────────────────────────────────────
async function syncIntegrationsToAgent(agentId) {
  try {
    const agentResult = await db.query("SELECT host FROM agents WHERE id = $1", [agentId]);
    const agent = agentResult.rows[0];
    if (!agent || !agent.host) return; // agent not running
    const syncData = await integrations.getIntegrationsForSync(agentId);
    await fetch(`http://${agent.host}:9090/integrations/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(syncData),
    });
  } catch (e) {
    console.error(`[sync-integrations] Failed for agent ${agentId}:`, e.message);
  }
}

// ─── Agent Integrations ─────────────────────────────────────────

app.get("/agents/:id/integrations", authenticateToken, async (req, res) => {
  try {
    res.json(await integrations.listIntegrations(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/agents/:id/integrations", authenticateToken, async (req, res) => {
  try {
    const { provider, token, config } = req.body;
    if (!provider) return res.status(400).json({ error: "Provider required" });
    const result = await integrations.connectIntegration(req.params.id, provider, token, config);
    syncIntegrationsToAgent(req.params.id).catch(() => {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/agents/:id/integrations/:iid", authenticateToken, async (req, res) => {
  try {
    await integrations.removeIntegration(req.params.iid, req.params.id);
    syncIntegrationsToAgent(req.params.id).catch(() => {});
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/agents/:id/integrations/:iid/test", authenticateToken, async (req, res) => {
  try {
    const result = await integrations.testIntegration(req.params.iid, req.params.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Integration Catalog ────────────────────────────────────────

app.get("/integrations/catalog", authenticateToken, async (req, res) => {
  try {
    const { category } = req.query;
    res.json(await integrations.getCatalog(category));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/integrations/catalog/:catalogId", authenticateToken, async (req, res) => {
  try {
    const item = await integrations.getCatalogItem(req.params.catalogId);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Platform Configuration (public, no auth) ──────────────────

app.get("/config/platform", (req, res) => {
  res.json({
    mode: billing.PLATFORM_MODE,
    selfhosted: billing.PLATFORM_MODE !== "paas" ? billing.SELFHOSTED_LIMITS : null,
    billingEnabled: billing.BILLING_ENABLED,
  });
});

// ─── NemoClaw Sandbox Management ────────────────────────────────

// Config endpoint — no auth (public, no secrets)
app.get("/config/nemoclaw", (req, res) => {
  res.json({
    enabled: process.env.NEMOCLAW_ENABLED === "true",
    defaultModel: process.env.NEMOCLAW_DEFAULT_MODEL || "nvidia/nemotron-3-super-120b-a12b",
    sandboxImage: process.env.NEMOCLAW_SANDBOX_IMAGE || "ghcr.io/nvidia/openshell-community/sandboxes/openclaw",
    models: [
      "nvidia/nemotron-3-super-120b-a12b",
      "nvidia/llama-3.1-nemotron-ultra-253b-v1",
      "nvidia/llama-3.3-nemotron-super-49b-v1.5",
      "nvidia/nemotron-3-nano-30b-a3b",
    ],
  });
});

app.get("/agents/:id/nemoclaw/status", authenticateToken, async (req, res) => {
  try {
    const agentResult = await db.query("SELECT * FROM agents WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    const agent = agentResult.rows[0];
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (agent.sandbox_type !== "nemoclaw") return res.status(400).json({ error: "Agent is not a NemoClaw sandbox" });
    if (!agent.host || agent.status !== "running") return res.json({ status: agent.status, sandbox: null });

    const resp = await fetch(`http://${agent.host}:9090/nemoclaw/status`);
    if (!resp.ok) throw new Error(`Agent runtime returned ${resp.status}`);
    res.json(await resp.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/agents/:id/nemoclaw/policy", authenticateToken, async (req, res) => {
  try {
    const agentResult = await db.query("SELECT * FROM agents WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    const agent = agentResult.rows[0];
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (agent.sandbox_type !== "nemoclaw") return res.status(400).json({ error: "Agent is not a NemoClaw sandbox" });
    if (!agent.host || agent.status !== "running") return res.status(400).json({ error: "Agent is not running" });

    const resp = await fetch(`http://${agent.host}:9090/nemoclaw/policy`);
    if (!resp.ok) throw new Error(`Agent runtime returned ${resp.status}`);
    res.json(await resp.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/agents/:id/nemoclaw/policy", authenticateToken, async (req, res) => {
  try {
    const agentResult = await db.query("SELECT * FROM agents WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    const agent = agentResult.rows[0];
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (agent.sandbox_type !== "nemoclaw") return res.status(400).json({ error: "Agent is not a NemoClaw sandbox" });
    if (!agent.host || agent.status !== "running") return res.status(400).json({ error: "Agent is not running" });

    const resp = await fetch(`http://${agent.host}:9090/nemoclaw/policy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    if (!resp.ok) throw new Error(`Agent runtime returned ${resp.status}`);
    res.json(await resp.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/agents/:id/nemoclaw/approvals", authenticateToken, async (req, res) => {
  try {
    const agentResult = await db.query("SELECT * FROM agents WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    const agent = agentResult.rows[0];
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (agent.sandbox_type !== "nemoclaw") return res.status(400).json({ error: "Agent is not a NemoClaw sandbox" });
    if (!agent.host || agent.status !== "running") return res.json({ approvals: [] });

    const resp = await fetch(`http://${agent.host}:9090/nemoclaw/approvals`);
    if (!resp.ok) throw new Error(`Agent runtime returned ${resp.status}`);
    res.json(await resp.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/agents/:id/nemoclaw/approvals/:rid", authenticateToken, async (req, res) => {
  try {
    const agentResult = await db.query("SELECT * FROM agents WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    const agent = agentResult.rows[0];
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (agent.sandbox_type !== "nemoclaw") return res.status(400).json({ error: "Agent is not a NemoClaw sandbox" });
    if (!agent.host || agent.status !== "running") return res.status(400).json({ error: "Agent is not running" });

    const resp = await fetch(`http://${agent.host}:9090/nemoclaw/approvals/${req.params.rid}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    if (!resp.ok) throw new Error(`Agent runtime returned ${resp.status}`);
    res.json(await resp.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Agent Channels ─────────────────────────────────────────────

app.get("/agents/:id/channels", authenticateToken, async (req, res) => {
  try {
    res.json(await channels.listChannels(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/agents/:id/channels", authenticateToken, async (req, res) => {
  try {
    const { type, name, config } = req.body;
    if (!type || !name) return res.status(400).json({ error: "type and name required" });
    const ch = await channels.createChannel(req.params.id, type, name, config);
    res.json(ch);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/agents/:id/channels/:cid", authenticateToken, async (req, res) => {
  try {
    const ch = await channels.updateChannel(req.params.cid, req.params.id, req.body);
    res.json(ch);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/agents/:id/channels/:cid", authenticateToken, async (req, res) => {
  try {
    await channels.deleteChannel(req.params.cid, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/agents/:id/channels/:cid/test", authenticateToken, async (req, res) => {
  try {
    const result = await channels.testChannel(req.params.cid, req.params.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/agents/:id/channels/:cid/messages", authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    res.json(await channels.getMessages(req.params.cid, limit));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Marketplace (install requires auth) ─────────────────────────

app.post("/marketplace/install", async (req, res) => {
  try {
    const { listingId } = req.body;
    const listing = await marketplace.getListing(listingId);
    if (!listing) return res.status(404).json({ error: "listing not found" });
    const snap = await snapshots.getSnapshot(listing.snapshot_id);
    if (!snap) return res.status(404).json({ error: "snapshot missing" });

    const node = await scheduler.selectNode();
    const result = await db.query(
      "INSERT INTO agents(user_id, name, status, node) VALUES($1, $2, 'queued', $3) RETURNING *",
      [req.user.id, snap.name, node?.name || "worker-01"]
    );
    const agent = result.rows[0];

    await db.query(
      "INSERT INTO deployments(agent_id, status) VALUES($1, 'queued')",
      [agent.id]
    );
    await addDeploymentJob({ id: agent.id, name: agent.name, userId: req.user.id });
    await monitoring.logEvent("marketplace_install", `Installed "${snap.name}" from marketplace`, { agentId: agent.id, listingId });

    res.json(agent);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Workspaces ──────────────────────────────────────────────────

app.get("/workspaces", async (req, res) => {
  try {
    res.json(await workspaces.listWorkspaces(req.user.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/workspaces", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    if (typeof name !== "string" || name.length > 100) return res.status(400).json({ error: "Name must be 1-100 characters" });
    res.json(await workspaces.createWorkspace(req.user.id, name));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/workspaces/:id/agents", async (req, res) => {
  try {
    res.json(await workspaces.getWorkspaceAgents(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/workspaces/:id/agents", async (req, res) => {
  try {
    const ws = await db.query("SELECT id FROM workspaces WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    if (!ws.rows[0]) return res.status(404).json({ error: "Workspace not found" });
    const { agentId, role } = req.body;
    if (!agentId) return res.status(400).json({ error: "agentId required" });
    res.json(await workspaces.addAgent(req.params.id, agentId, role));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/workspaces/:id", async (req, res) => {
  try {
    const ws = await db.query("SELECT id FROM workspaces WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    if (!ws.rows[0]) return res.status(404).json({ error: "Workspace not found" });
    await db.query("DELETE FROM workspace_agents WHERE workspace_id = $1", [req.params.id]);
    await db.query("DELETE FROM workspaces WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Monitoring ──────────────────────────────────────────────────

app.get("/monitoring/metrics", async (req, res) => {
  try {
    res.json(await monitoring.getMetrics());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/monitoring/events", async (req, res) => {
  try {
    res.json(await monitoring.getRecentEvents(50));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Billing ─────────────────────────────────────────────────────

app.get("/billing/subscription", async (req, res) => {
  try {
    const sub = await billing.getSubscription(req.user.id);
    const agentCount = await db.query("SELECT COUNT(*) FROM agents WHERE user_id = $1", [req.user.id]);
    res.json({ ...sub, agents_used: parseInt(agentCount.rows[0].count, 10) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/billing/checkout", async (req, res) => {
  if (!billing.BILLING_ENABLED) return res.status(404).json({ error: "Billing is disabled" });
  try {
    const { plan } = req.body;
    if (!plan || !["pro", "enterprise"].includes(plan)) return res.status(400).json({ error: "Invalid plan" });
    const result = await billing.createCheckoutSession(req.user.id, plan);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/billing/portal", async (req, res) => {
  if (!billing.BILLING_ENABLED) return res.status(404).json({ error: "Billing is disabled" });
  try {
    const result = await billing.createPortalSession(req.user.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Password Change ─────────────────────────────────────────────

app.patch("/auth/password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Both passwords required" });
    const user = (await db.query("SELECT * FROM users WHERE id = $1", [req.user.id])).rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.password_hash) return res.status(400).json({ error: "OAuth user — no password to change" });
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect" });
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── User Profile ────────────────────────────────────────────────

app.get("/auth/me", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, email, name, role, provider, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin Routes ────────────────────────────────────────────────

app.get("/admin/stats", requireAdmin, async (req, res) => {
  try {
    res.json(await monitoring.getMetrics());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/admin/users", requireAdmin, async (req, res) => {
  try {
    const result = await db.query("SELECT id, email, role, created_at FROM users ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/admin/users/:id/role", requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!["user", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    const result = await db.query(
      "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role",
      [role, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    await db.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/admin/marketplace/:id", requireAdmin, async (req, res) => {
  try {
    await marketplace.deleteListing(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/admin/audit", requireAdmin, async (req, res) => {
  try {
    res.json(await monitoring.getRecentEvents(100));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DB Migration ────────────────────────────────────────────────

async function migrateDB() {
  const migrations = [
    // agents.backend_type
    `DO $$ BEGIN
       ALTER TABLE agents ADD COLUMN backend_type VARCHAR(20) NOT NULL DEFAULT 'docker';
     EXCEPTION WHEN duplicate_column THEN NULL;
     END $$`,
    // integration_catalog
    `CREATE TABLE IF NOT EXISTS integration_catalog (
       id VARCHAR(50) PRIMARY KEY,
       name VARCHAR(100) NOT NULL,
       icon VARCHAR(50),
       category VARCHAR(50) NOT NULL,
       description TEXT,
       auth_type VARCHAR(20),
       config_schema JSONB NOT NULL DEFAULT '{}',
       enabled BOOLEAN DEFAULT true
     )`,
    // integrations new columns
    `DO $$ BEGIN
       ALTER TABLE integrations ADD COLUMN catalog_id VARCHAR(50) REFERENCES integration_catalog(id);
     EXCEPTION WHEN duplicate_column THEN NULL;
     END $$`,
    `DO $$ BEGIN
       ALTER TABLE integrations ADD COLUMN config JSONB DEFAULT '{}';
     EXCEPTION WHEN duplicate_column THEN NULL;
     END $$`,
    `DO $$ BEGIN
       ALTER TABLE integrations ADD COLUMN status VARCHAR(20) DEFAULT 'active';
     EXCEPTION WHEN duplicate_column THEN NULL;
     END $$`,
    // channels
    `CREATE TABLE IF NOT EXISTS channels (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
       type VARCHAR(30) NOT NULL,
       name VARCHAR(100) NOT NULL,
       config JSONB NOT NULL DEFAULT '{}',
       enabled BOOLEAN DEFAULT true,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    // channel_messages
    `CREATE TABLE IF NOT EXISTS channel_messages (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
       direction VARCHAR(10) NOT NULL,
       content TEXT NOT NULL,
       metadata JSONB DEFAULT '{}',
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    // gateway_token on agents
    `DO $$ BEGIN
       ALTER TABLE agents ADD COLUMN gateway_token TEXT;
     EXCEPTION WHEN duplicate_column THEN NULL;
     END $$`,
    // LLM provider keys (user-level)
    `CREATE TABLE IF NOT EXISTS llm_providers (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id UUID REFERENCES users(id) ON DELETE CASCADE,
       provider VARCHAR(30) NOT NULL,
       api_key TEXT,
       model VARCHAR(100),
       config JSONB DEFAULT '{}',
       is_default BOOLEAN DEFAULT false,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    // sandbox_type on agents (NemoClaw support)
    `DO $$ BEGIN
       ALTER TABLE agents ADD COLUMN sandbox_type VARCHAR(20) DEFAULT 'standard';
     EXCEPTION WHEN duplicate_column THEN NULL;
     END $$`,
    // Resource columns on agents (selfhosted/paas specs)
    `DO $$ BEGIN ALTER TABLE agents ADD COLUMN vcpu INTEGER DEFAULT 2; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE agents ADD COLUMN ram_mb INTEGER DEFAULT 2048; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE agents ADD COLUMN disk_gb INTEGER DEFAULT 20; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
  ];

  for (const sql of migrations) {
    try {
      await db.query(sql);
    } catch (e) {
      console.error("Migration step failed:", e.message);
    }
  }
  console.log("DB migrations applied");
}

// ─── Startup ─────────────────────────────────────────────────────

if (require.main === module) {
  const { attachLogStream } = require("./logStream");
  const { attachExecStream } = require("./execStream");

  const PORT = parseInt(process.env.PORT || "4000");
  const server = app.listen(PORT, async () => {
    console.log(`api running on ${PORT}`);

    // Run schema migrations first
    try {
      await migrateDB();
    } catch (e) {
      console.error("DB migration error:", e.message);
    }

    // Seed integration catalog
    try {
      await integrations.seedCatalog();
    } catch (e) {
      console.error("Failed to seed integration catalog:", e.message);
    }

    // Seed marketplace if empty
    try {
      const existing = await marketplace.listMarketplace();
      if (existing.length === 0) {
        const s1 = await snapshots.createSnapshot(null, "OpenClaw Researcher", "Specialized in deep web research and data synthesis.", { type: "research" });
        const s2 = await snapshots.createSnapshot(null, "OpenClaw Auditor", "Real-time auditing and compliance node.", { type: "audit" });
        const s3 = await snapshots.createSnapshot(null, "OpenClaw Support", "Autonomous customer support agent with tool access.", { type: "support" });
        await marketplace.publishSnapshot(s1.id, s1.name, s1.description, "$12/mo", "Research");
        await marketplace.publishSnapshot(s2.id, s2.name, s2.description, "Free", "Finance");
        await marketplace.publishSnapshot(s3.id, s3.name, s3.description, "$29/mo", "Support");
        console.log("Marketplace seeded with 3 default listings");
      }
    } catch (e) {
      console.error("Failed to seed marketplace:", e.message);
    }
  });

  // Attach WebSocket log stream to the HTTP server
  attachLogStream(server);
  // Attach interactive terminal WebSocket
  attachExecStream(server);
  // Attach Gateway WebSocket relay
  attachGatewayWS(server);
}

module.exports = app;
