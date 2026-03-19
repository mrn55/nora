/**
 * __tests__/agents.test.js — Agent management endpoint tests
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

const userToken = jwt.sign({ id: "user-1", role: "user" }, JWT_SECRET, { expiresIn: "1h" });
const auth = (req) => req.set("Authorization", `Bearer ${userToken}`);

beforeEach(() => {
  mockDb.query.mockReset();
});

describe("GET /agents", () => {
  it("rejects unauthenticated request", async () => {
    const res = await request(app).get("/agents");
    expect(res.status).toBe(401);
  });

  it("returns agent list for authenticated user", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { id: "a1", name: "Agent 1", status: "running", created_at: new Date().toISOString() },
      ],
    });

    const res = await auth(request(app).get("/agents"));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty("name", "Agent 1");
  });
});

describe("POST /agents/deploy", () => {
  it("rejects unauthenticated request", async () => {
    const res = await request(app).post("/agents/deploy").send({});
    expect(res.status).toBe(401);
  });

  it("rejects agent name over 100 chars", async () => {
    const longName = "A".repeat(101);
    const res = await auth(
      request(app).post("/agents/deploy").send({ name: longName })
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/100/);
  });

  it("deploys agent with valid data", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: "a-new", name: "TestAgent", status: "deploying", user_id: "user-1" }],
    });

    const res = await auth(
      request(app).post("/agents/deploy").send({ name: "TestAgent" })
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("status", "deploying");
  });
});

describe("POST /agents/:id/stop", () => {
  it("stops a running agent", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: "a1", status: "stopped" }],
    });

    const res = await auth(
      request(app).post("/agents/a1/stop")
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /agents/:id/delete", () => {
  it("deletes an agent", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: "a1" }],
    });

    const res = await auth(
      request(app).post("/agents/a1/delete")
    );
    expect(res.status).toBe(200);
  });
});
