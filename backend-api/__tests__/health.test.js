/**
 * __tests__/health.test.js — Health endpoint + security headers
 */
const request = require("supertest");

// Mock all DB-dependent modules before requiring server
jest.mock("../db", () => ({ query: jest.fn() }));
jest.mock("../redisQueue", () => ({ addDeploymentJob: jest.fn() }));
jest.mock("../marketplace", () => ({
  listMarketplace: jest.fn().mockResolvedValue([]),
  publishSnapshot: jest.fn(),
  getMarketplaceItem: jest.fn(),
  installFromMarketplace: jest.fn(),
}));
jest.mock("../snapshots", () => ({
  createSnapshot: jest.fn().mockResolvedValue({ id: "s1", name: "Test", description: "test" }),
}));
jest.mock("../workspaces", () => ({
  listWorkspaces: jest.fn().mockResolvedValue([]),
  createWorkspace: jest.fn(),
  addAgent: jest.fn(),
}));
jest.mock("../integrations", () => ({
  listIntegrations: jest.fn().mockResolvedValue([]),
  connectIntegration: jest.fn(),
}));
jest.mock("../monitoring", () => ({
  getMetrics: jest.fn().mockResolvedValue({}),
  logEvent: jest.fn(),
  getRecentEvents: jest.fn().mockResolvedValue([]),
}));
jest.mock("../billing", () => ({
  getSubscription: jest.fn().mockResolvedValue({ plan: "free" }),
  createCheckout: jest.fn(),
  createPortalSession: jest.fn(),
}));

const app = require("../server");

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
  });

  it("includes security headers from helmet", async () => {
    const res = await request(app).get("/health");
    expect(res.headers).toHaveProperty("x-content-type-options", "nosniff");
    expect(res.headers).toHaveProperty("x-frame-options");
  });
});
