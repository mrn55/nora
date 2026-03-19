/**
 * __tests__/workspaces.test.js — Workspace endpoint tests
 */
const request = require("supertest");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "secret";

const mockDb = { query: jest.fn() };
jest.mock("../db", () => mockDb);
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
const mockWorkspaces = {
  listWorkspaces: jest.fn().mockResolvedValue([]),
  createWorkspace: jest.fn(),
  addAgent: jest.fn(),
};
jest.mock("../workspaces", () => mockWorkspaces);
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

const userToken = jwt.sign({ id: "user-1", role: "user" }, JWT_SECRET, { expiresIn: "1h" });
const auth = (req) => req.set("Authorization", `Bearer ${userToken}`);

beforeEach(() => {
  mockDb.query.mockReset();
  mockWorkspaces.listWorkspaces.mockReset().mockResolvedValue([]);
  mockWorkspaces.createWorkspace.mockReset();
  mockWorkspaces.addAgent.mockReset();
});

describe("GET /workspaces", () => {
  it("rejects unauthenticated request", async () => {
    const res = await request(app).get("/workspaces");
    expect(res.status).toBe(401);
  });

  it("returns workspace list", async () => {
    mockWorkspaces.listWorkspaces.mockResolvedValueOnce([
      { id: "ws-1", name: "Dev", user_id: "user-1" },
    ]);

    const res = await auth(request(app).get("/workspaces"));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("POST /workspaces", () => {
  it("rejects missing name", async () => {
    const res = await auth(request(app).post("/workspaces").send({}));
    expect(res.status).toBe(400);
  });

  it("rejects name over 100 chars", async () => {
    const res = await auth(
      request(app).post("/workspaces").send({ name: "X".repeat(101) })
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1-100/);
  });

  it("creates workspace with valid name", async () => {
    mockWorkspaces.createWorkspace.mockResolvedValueOnce({
      id: "ws-new",
      name: "Production",
      user_id: "user-1",
    });

    const res = await auth(
      request(app).post("/workspaces").send({ name: "Production" })
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("name", "Production");
  });
});

describe("DELETE /workspaces/:id", () => {
  it("rejects if not owner", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // ownership check fails

    const res = await auth(request(app).delete("/workspaces/ws-1"));
    expect(res.status).toBe(404);
  });

  it("deletes owned workspace", async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: "ws-1" }] }) // ownership OK
      .mockResolvedValueOnce({ rows: [] })  // delete workspace_agents
      .mockResolvedValueOnce({ rows: [] }); // delete workspace

    const res = await auth(request(app).delete("/workspaces/ws-1"));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
  });
});

describe("POST /workspaces/:id/agents", () => {
  it("rejects if not workspace owner", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // ownership check fails

    const res = await auth(
      request(app).post("/workspaces/ws-1/agents").send({ agentId: "a1" })
    );
    expect(res.status).toBe(404);
  });
});
