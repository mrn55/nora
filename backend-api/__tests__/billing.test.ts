// @ts-nocheck
/**
 * __tests__/billing.test.ts — Billing and effective agent cap coverage
 */

const DEFAULT_DEPLOYMENT_DEFAULTS = {
  vcpu: 4,
  ram_mb: 4096,
  disk_gb: 50,
};

function loadBillingModule({
  platformMode = "selfhosted",
  billingEnabled = "false",
  maxAgents = "50",
} = {}) {
  jest.resetModules();

  process.env.PLATFORM_MODE = platformMode;
  process.env.BILLING_ENABLED = billingEnabled;
  process.env.MAX_AGENTS = maxAgents;
  delete process.env.STRIPE_SECRET_KEY;

  const mockDb = { query: jest.fn() };
  const mockGetDeploymentDefaults = jest.fn().mockResolvedValue(DEFAULT_DEPLOYMENT_DEFAULTS);

  jest.doMock("../db", () => mockDb);
  jest.doMock("../platformSettings", () => ({
    getDeploymentDefaults: mockGetDeploymentDefaults,
  }));

  const billing = require("../billing");
  return { billing, mockDb, mockGetDeploymentDefaults };
}

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  delete process.env.PLATFORM_MODE;
  delete process.env.BILLING_ENABLED;
  delete process.env.MAX_AGENTS;
  delete process.env.STRIPE_SECRET_KEY;
});

describe("billing effective agent caps", () => {
  it("returns the default 3-agent cap for non-admin self-hosted users when no override is set", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "selfhosted",
      maxAgents: "50",
    });

    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: "user-1", role: "user", agent_limit_override: null }],
    });

    const subscription = await billing.getSubscription("user-1");

    expect(subscription).toEqual(
      expect.objectContaining({
        plan: "selfhosted",
        status: "active",
        agent_limit: 3,
        base_agent_limit: 3,
        agent_limit_override: null,
        agent_limit_source: "default",
        is_unlimited: false,
      }),
    );
  });

  it("returns unlimited for admin users by default in self-hosted mode", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "selfhosted",
      maxAgents: "50",
    });

    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: "admin-1", role: "admin", agent_limit_override: null }],
    });

    const subscription = await billing.getSubscription("admin-1");

    expect(subscription).toEqual(
      expect.objectContaining({
        plan: "selfhosted",
        status: "active",
        agent_limit: null,
        base_agent_limit: null,
        agent_limit_override: null,
        agent_limit_source: "admin_default_unlimited",
        is_unlimited: true,
      }),
    );
  });

  it("applies PaaS admin overrides on top of the role defaults", async () => {
    const { billing, mockDb, mockGetDeploymentDefaults } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "true",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "user-2", role: "user", agent_limit_override: 12 }],
      })
      .mockResolvedValueOnce({
        rows: [{ plan: "pro", status: "active" }],
      });

    const subscription = await billing.getSubscription("user-2");

    expect(mockGetDeploymentDefaults).toHaveBeenCalledTimes(1);
    expect(subscription).toEqual(
      expect.objectContaining({
        plan: "pro",
        status: "active",
        agent_limit: 12,
        base_agent_limit: 3,
        agent_limit_override: 12,
        agent_limit_source: "admin_override",
        is_unlimited: false,
        vcpu: 4,
        ram_mb: 4096,
        disk_gb: 50,
      }),
    );
  });

  it("returns the default 3-agent cap for billing-disabled PaaS users when no override exists", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "false",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "user-3", role: "user", agent_limit_override: null }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const subscription = await billing.getSubscription("user-3");

    expect(subscription).toEqual(
      expect.objectContaining({
        plan: "free",
        status: "active",
        agent_limit: 3,
        base_agent_limit: 3,
        agent_limit_override: null,
        agent_limit_source: "default",
        is_unlimited: false,
      }),
    );
  });

  it("blocks deployments at the default cap with an admin message", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "true",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "user-4", role: "user", agent_limit_override: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ plan: "free", status: "active" }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: "3" }],
      });

    const result = await billing.enforceLimits("user-4");

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        error: "Agent limit reached (3/3). Contact your administrator.",
        subscription: expect.objectContaining({
          agent_limit: 3,
          agent_limit_source: "default",
        }),
      }),
    );
  });

  it("blocks self-hosted deployments at an admin override with an admin message", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "selfhosted",
      maxAgents: "50",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "user-5", role: "user", agent_limit_override: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: "2" }],
      });

    const result = await billing.enforceLimits("user-5");

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        error: "Agent limit reached (2/2). Contact your administrator.",
        subscription: expect.objectContaining({
          agent_limit: 2,
          agent_limit_source: "admin_override",
        }),
      }),
    );
  });

  it("preserves unlimited deploys for admin users in billing-disabled PaaS", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "false",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "user-6", role: "admin", agent_limit_override: null }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ count: "42" }],
      });

    const result = await billing.enforceLimits("user-6");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
    expect(result.subscription).toEqual(
      expect.objectContaining({
        is_unlimited: true,
        agent_limit_source: "admin_default_unlimited",
      }),
    );
  });

  it("still blocks non-active PaaS subscriptions even when an override exists", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "true",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "user-7", role: "user", agent_limit_override: 25 }],
      })
      .mockResolvedValueOnce({
        rows: [{ plan: "pro", status: "past_due" }],
      });

    const result = await billing.enforceLimits("user-7");

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        error: "Subscription is not active",
        subscription: expect.objectContaining({
          agent_limit: 25,
          agent_limit_source: "admin_override",
          status: "past_due",
        }),
      }),
    );
    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });
});
