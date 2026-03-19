/**
 * __tests__/auth.test.js — Authentication endpoint tests
 */
const request = require("supertest");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "secret";

// Mock DB
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

beforeEach(() => {
  mockDb.query.mockReset();
});

describe("POST /auth/signup", () => {
  it("rejects missing email", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ password: "testpassword123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("rejects invalid email format", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: "notanemail", password: "testpassword123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("rejects short password", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: "test@example.com", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  it("creates user and returns token on valid signup", async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // check existing user
      .mockResolvedValueOnce({
        rows: [{ id: "uuid-1", email: "new@example.com", role: "user" }],
      }); // insert user

    const res = await request(app)
      .post("/auth/signup")
      .send({ email: "new@example.com", password: "validpassword123" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");

    // Verify the token is valid JWT
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded).toHaveProperty("id", "uuid-1");
  });

  it("rejects duplicate email", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: "uuid-1", email: "dup@example.com" }],
    });

    const res = await request(app)
      .post("/auth/signup")
      .send({ email: "dup@example.com", password: "validpassword123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exists/i);
  });
});

describe("POST /auth/login", () => {
  it("rejects missing credentials", async () => {
    const res = await request(app).post("/auth/login").send({});
    expect(res.status).toBe(400);
  });

  it("rejects wrong email", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "testpassword123" });
    expect(res.status).toBe(401);
  });

  it("returns token on valid login", async () => {
    const hash = await bcrypt.hash("correctpassword", 10);
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: "uuid-1", email: "user@example.com", password_hash: hash, role: "user" }],
    });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "user@example.com", password: "correctpassword" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
  });
});
