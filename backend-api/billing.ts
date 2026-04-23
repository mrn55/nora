// @ts-nocheck
const db = require("./db");
const { getDeploymentDefaults } = require("./platformSettings");

// Conditionally load Stripe — if no key, functions gracefully degrade
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? require("stripe")(stripeKey) : null;

const PLATFORM_MODE = (process.env.PLATFORM_MODE || "selfhosted").toLowerCase();
const IS_PAAS = PLATFORM_MODE === "paas";

const PLANS = {
  free: { agent_limit: 3 },
  pro: { agent_limit: 10 },
  enterprise: { agent_limit: 100 },
};
const KNOWN_PLANS = new Set(Object.keys(PLANS));
const DEFAULT_USER_AGENT_LIMIT = 3;

const SELFHOSTED_LIMITS = {
  max_vcpu:   parseInt(process.env.MAX_VCPU   || "16",    10),
  max_ram_mb: parseInt(process.env.MAX_RAM_MB || "32768", 10),
  max_disk_gb:parseInt(process.env.MAX_DISK_GB|| "500",   10),
  max_agents: parseInt(process.env.MAX_AGENTS || "50",    10),
};
const BILLING_ENABLED = process.env.BILLING_ENABLED === 'true';

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePlanName(plan) {
  const normalized = String(plan || "").trim().toLowerCase();
  return KNOWN_PLANS.has(normalized) ? normalized : "free";
}

function normalizeAgentLimitOverride(value) {
  const parsed = parseInteger(value);
  if (parsed == null || parsed < 0) return null;
  return parsed;
}

function isAdminUser(user = {}) {
  return String(user?.role || "").trim().toLowerCase() === "admin";
}

function applyEffectiveAgentLimit(base, user = {}, options = {}) {
  const override = normalizeAgentLimitOverride(user?.agent_limit_override);
  const maxAgentLimit = Number.isInteger(options.maxAgentLimit)
    ? options.maxAgentLimit
    : null;
  const effectiveOverride =
    override == null
      ? null
      : maxAgentLimit == null
        ? override
        : Math.min(override, maxAgentLimit);
  const roleDefaultIsUnlimited = isAdminUser(user);
  const baseAgentLimit = roleDefaultIsUnlimited ? null : DEFAULT_USER_AGENT_LIMIT;

  if (effectiveOverride != null) {
    return {
      ...base,
      agent_limit: effectiveOverride,
      base_agent_limit: baseAgentLimit,
      agent_limit_override: effectiveOverride,
      agent_limit_source: "admin_override",
      is_unlimited: false,
    };
  }

  if (roleDefaultIsUnlimited) {
    return {
      ...base,
      agent_limit: null,
      base_agent_limit: null,
      agent_limit_override: null,
      agent_limit_source: "admin_default_unlimited",
      is_unlimited: true,
    };
  }

  return {
    ...base,
    agent_limit: DEFAULT_USER_AGENT_LIMIT,
    base_agent_limit: DEFAULT_USER_AGENT_LIMIT,
    agent_limit_override: null,
    agent_limit_source: "default",
    is_unlimited: false,
  };
}

function buildPlanSubscription(plan, defaults = {}) {
  const normalizedPlan = normalizePlanName(plan);
  const basePlan = PLANS[normalizedPlan] || PLANS.free;
  return {
    plan: normalizedPlan,
    agent_limit: basePlan.agent_limit,
    vcpu: defaults.vcpu,
    ram_mb: defaults.ram_mb,
    disk_gb: defaults.disk_gb,
  };
}

async function getUserRow(userId) {
  const result = await db.query(
    "SELECT id, email, role, name, agent_limit_override FROM users WHERE id = $1",
    [userId]
  );
  return result.rows[0] || null;
}

async function getLatestSubscription(userId) {
  const result = await db.query(
    "SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [userId]
  );
  return result.rows[0] || null;
}

function buildSelfHostedSubscription(user = {}) {
  const base = {
    plan: "selfhosted",
    status: "active",
    agent_limit: SELFHOSTED_LIMITS.max_agents,
    vcpu: SELFHOSTED_LIMITS.max_vcpu,
    ram_mb: SELFHOSTED_LIMITS.max_ram_mb,
    disk_gb: SELFHOSTED_LIMITS.max_disk_gb,
  };

  return applyEffectiveAgentLimit(base, user, {
    maxAgentLimit: SELFHOSTED_LIMITS.max_agents,
  });
}

function buildPaaSSubscription({
  user = {},
  subscriptionRow = null,
  deploymentDefaults = {},
} = {}) {
  const basePlan = normalizePlanName(subscriptionRow?.plan);
  const base = {
    ...subscriptionRow,
    ...buildPlanSubscription(basePlan, deploymentDefaults),
    plan: basePlan,
    status: BILLING_ENABLED ? subscriptionRow?.status || "active" : "active",
  };

  return applyEffectiveAgentLimit(base, user);
}

async function getSubscription(userId, options = {}) {
  const hasUserRow = Object.prototype.hasOwnProperty.call(options, "userRow");
  const user = hasUserRow ? options.userRow : await getUserRow(userId);

  if (!IS_PAAS) {
    return buildSelfHostedSubscription(user || {});
  }

  const deploymentDefaults =
    options.deploymentDefaults || (await getDeploymentDefaults());
  const hasSubscriptionRow = Object.prototype.hasOwnProperty.call(
    options,
    "subscriptionRow"
  );
  const subscriptionRow = hasSubscriptionRow
    ? options.subscriptionRow
    : await getLatestSubscription(userId);

  return buildPaaSSubscription({
    user: user || {},
    subscriptionRow,
    deploymentDefaults,
  });
}

function buildLimitReachedError(count, subscription = {}) {
  const limit = Number.isInteger(subscription?.agent_limit)
    ? subscription.agent_limit
    : 0;
  return `Agent limit reached (${count}/${limit}). Contact your administrator.`;
}

async function enforceLimits(userId) {
  const sub = await getSubscription(userId);
  if (IS_PAAS && BILLING_ENABLED && sub.status !== "active") {
    return { allowed: false, error: "Subscription is not active", subscription: sub };
  }

  const agentCount = await db.query(
    "SELECT COUNT(*) FROM agents WHERE user_id = $1",
    [userId]
  );
  const count = parseInt(agentCount.rows[0].count, 10);

  if (sub.is_unlimited) {
    return { allowed: true, remaining: Infinity, subscription: sub };
  }

  if (Number.isInteger(sub.agent_limit) && count >= sub.agent_limit) {
    return {
      allowed: false,
      error: buildLimitReachedError(count, sub),
      subscription: sub,
    };
  }

  return {
    allowed: true,
    remaining: Number.isInteger(sub.agent_limit) ? sub.agent_limit - count : Infinity,
    subscription: sub,
  };
}

// ── Create Stripe Checkout Session ──────────────────────────────

async function createCheckoutSession(userId, plan) {
  if (!stripe) throw new Error("Stripe is not configured");

  const priceId = plan === "pro"
    ? process.env.STRIPE_PRICE_PRO
    : process.env.STRIPE_PRICE_ENTERPRISE;

  if (!priceId) throw new Error(`No Stripe price configured for plan: ${plan}`);

  // Get or create Stripe customer
  const user = (await db.query("SELECT * FROM users WHERE id = $1", [userId])).rows[0];
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { userId } });
    customerId = customer.id;
    await db.query("UPDATE users SET stripe_customer_id = $1 WHERE id = $2", [customerId, userId]);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL || "http://localhost:8080"}/app/settings?billing=success`,
    cancel_url: `${process.env.NEXTAUTH_URL || "http://localhost:8080"}/pricing`,
    metadata: { userId, plan },
  });
  return { url: session.url, sessionId: session.id };
}

// ── Create Stripe Customer Portal session ────────────────────────

async function createPortalSession(userId) {
  if (!stripe) throw new Error("Stripe is not configured");
  const user = (await db.query("SELECT * FROM users WHERE id = $1", [userId])).rows[0];
  if (!user.stripe_customer_id) throw new Error("No Stripe customer found");

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${process.env.NEXTAUTH_URL || "http://localhost:8080"}/app/settings`,
  });
  return { url: session.url };
}

// ── Handle Stripe Webhook Events ────────────────────────────────

async function handleWebhookEvent(event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan || "pro";
      const specs = buildPlanSubscription(
        plan,
        await getDeploymentDefaults()
      );

      await db.query(
        `INSERT INTO subscriptions(user_id, stripe_customer_id, stripe_subscription_id, plan, status, agent_limit, vcpu, ram_mb, disk_gb, current_period_end)
         VALUES($1, $2, $3, $4, 'active', $5, $6, $7, $8, NOW() + INTERVAL '30 days')
         ON CONFLICT (stripe_subscription_id) DO UPDATE SET
           plan = EXCLUDED.plan, status = 'active', agent_limit = EXCLUDED.agent_limit,
           vcpu = EXCLUDED.vcpu, ram_mb = EXCLUDED.ram_mb, disk_gb = EXCLUDED.disk_gb,
           updated_at = NOW()`,
        [userId, session.customer, session.subscription, plan,
         specs.agent_limit, specs.vcpu, specs.ram_mb, specs.disk_gb]
      );
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object;
      await db.query(
        `UPDATE subscriptions SET status = 'active', current_period_end = NOW() + INTERVAL '30 days', updated_at = NOW()
         WHERE stripe_subscription_id = $1`,
        [invoice.subscription]
      );
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      await db.query(
        "UPDATE subscriptions SET status = 'past_due', updated_at = NOW() WHERE stripe_subscription_id = $1",
        [invoice.subscription]
      );
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      // Downgrade to free
      const freePlan = buildPlanSubscription(
        "free",
        await getDeploymentDefaults()
      );
      await db.query(
        `UPDATE subscriptions SET plan = 'free', status = 'canceled', agent_limit = $1, vcpu = $2, ram_mb = $3, disk_gb = $4, updated_at = NOW()
         WHERE stripe_subscription_id = $5`,
        [freePlan.agent_limit, freePlan.vcpu, freePlan.ram_mb, freePlan.disk_gb, sub.id]
      );
      break;
    }
  }
}

module.exports = {
  PLANS,
  BILLING_ENABLED,
  PLATFORM_MODE,
  IS_PAAS,
  SELFHOSTED_LIMITS,
  normalizeAgentLimitOverride,
  getSubscription,
  enforceLimits,
  createCheckoutSession,
  createPortalSession,
  handleWebhookEvent,
};
