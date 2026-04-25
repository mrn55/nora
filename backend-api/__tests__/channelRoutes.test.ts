// @ts-nocheck
const express = require("express");
const request = require("supertest");

const mockDb = { query: jest.fn() };
const mockChannels = {
  listChannels: jest.fn(),
  createChannel: jest.fn(),
  updateChannel: jest.fn(),
  deleteChannel: jest.fn(),
  testChannel: jest.fn(),
  getMessages: jest.fn(),
};
const mockListAdapterTypes = jest.fn();
const mockGetAdapter = jest.fn();
const mockOpenClaw = {
  connectOpenClawChannel: jest.fn(),
  listOpenClawChannels: jest.fn(),
  getOpenClawChannelType: jest.fn(),
  saveOpenClawChannel: jest.fn(),
  deleteOpenClawChannel: jest.fn(),
  startOpenClawChannelLogin: jest.fn(),
  waitOpenClawChannelLogin: jest.fn(),
  logoutOpenClawChannel: jest.fn(),
};

jest.mock("../db", () => mockDb);
jest.mock("../channels", () => mockChannels);
jest.mock("../channels/adapters", () => ({
  getAdapter: (...args) => mockGetAdapter(...args),
  listAdapterTypes: (...args) => mockListAdapterTypes(...args),
}));
jest.mock("../channels/openclaw", () => mockOpenClaw);

const router = require("../routes/channels");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "user-1" };
    next();
  });
  app.use("/", router);
  return app;
}

function queueOwnedAgent(agent) {
  mockDb.query.mockResolvedValueOnce({ rows: [agent] });
}

describe("channel routes", () => {
  const app = buildApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
    mockChannels.listChannels.mockReset().mockResolvedValue([]);
    mockChannels.createChannel.mockReset();
    mockChannels.updateChannel.mockReset();
    mockChannels.deleteChannel.mockReset();
    mockChannels.testChannel.mockReset();
    mockChannels.getMessages.mockReset().mockResolvedValue([]);
    mockListAdapterTypes.mockReset().mockReturnValue([]);
    mockGetAdapter.mockReset();
    mockOpenClaw.connectOpenClawChannel.mockReset();
    mockOpenClaw.listOpenClawChannels.mockReset();
    mockOpenClaw.getOpenClawChannelType.mockReset();
    mockOpenClaw.saveOpenClawChannel.mockReset();
    mockOpenClaw.deleteOpenClawChannel.mockReset();
    mockOpenClaw.startOpenClawChannelLogin.mockReset();
    mockOpenClaw.waitOpenClawChannelLogin.mockReset();
    mockOpenClaw.logoutOpenClawChannel.mockReset();
  });

  it("returns the unified legacy channel payload with adapter metadata", async () => {
    queueOwnedAgent({
      id: "agent-legacy",
      user_id: "user-1",
      status: "running",
      runtime_family: "hermes",
    });
    mockChannels.listChannels.mockResolvedValueOnce([
      {
        id: "ch-1",
        type: "telegram",
        name: "Ops Telegram",
        enabled: true,
        config: { bot_token: "[REDACTED]" },
      },
    ]);
    mockListAdapterTypes.mockReturnValueOnce([
      {
        type: "telegram",
        label: "Telegram",
        icon: "send",
        configFields: [
          { key: "bot_token", label: "Bot Token", type: "password", required: true },
        ],
      },
    ]);

    const res = await request(app).get("/agent-legacy/channels");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      runtime: "legacy",
      capabilities: {
        supportsTesting: true,
        supportsMessageHistory: true,
        supportsArbitraryNames: true,
        supportsLazyTypeDefinitions: false,
      },
    });
    expect(res.body.channels).toEqual([
      expect.objectContaining({
        id: "ch-1",
        type: "telegram",
        name: "Ops Telegram",
        actions: expect.objectContaining({
          canEdit: true,
          canToggle: true,
          canDelete: true,
          canTest: true,
          canViewMessages: true,
        }),
      }),
    ]);
    expect(res.body.availableTypes).toEqual([
      expect.objectContaining({
        type: "telegram",
        label: "Telegram",
        configFields: [
          expect.objectContaining({
            key: "bot_token",
            type: "password",
          }),
        ],
      }),
    ]);
    expect(mockChannels.listChannels).toHaveBeenCalledWith("agent-legacy");
  });

  it("dispatches OpenClaw channel listing and type metadata through the helper", async () => {
    queueOwnedAgent({
      id: "agent-openclaw",
      user_id: "user-1",
      status: "running",
      runtime_family: "openclaw",
    });
    queueOwnedAgent({
      id: "agent-openclaw",
      user_id: "user-1",
      status: "running",
      runtime_family: "openclaw",
    });
    mockOpenClaw.listOpenClawChannels.mockResolvedValueOnce({
      runtime: "openclaw",
      channels: [{ type: "whatsapp" }],
      availableTypes: [{ type: "whatsapp", label: "WhatsApp (QR link)" }],
    });
    mockOpenClaw.getOpenClawChannelType.mockResolvedValueOnce({
      type: "whatsapp",
      configFields: [{ key: "enabled", type: "boolean" }],
    });

    const listRes = await request(app).get("/agent-openclaw/channels");
    const typeRes = await request(app).get("/agent-openclaw/channels/types/whatsapp");

    expect(listRes.status).toBe(200);
    expect(typeRes.status).toBe(200);
    expect(mockOpenClaw.listOpenClawChannels).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-openclaw" }),
    );
    expect(mockOpenClaw.getOpenClawChannelType).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-openclaw" }),
      "whatsapp",
    );
  });

  it("creates, updates, and deletes OpenClaw channels through the helper", async () => {
    queueOwnedAgent({
      id: "agent-openclaw-save",
      user_id: "user-1",
      status: "running",
      runtime_family: "openclaw",
    });
    queueOwnedAgent({
      id: "agent-openclaw-save",
      user_id: "user-1",
      status: "running",
      runtime_family: "openclaw",
    });
    queueOwnedAgent({
      id: "agent-openclaw-save",
      user_id: "user-1",
      status: "running",
      runtime_family: "openclaw",
    });
    mockOpenClaw.saveOpenClawChannel
      .mockResolvedValueOnce({ success: true, channel: "whatsapp" })
      .mockResolvedValueOnce({ success: true, channel: "whatsapp" });
    mockOpenClaw.deleteOpenClawChannel.mockResolvedValueOnce({
      success: true,
      channel: "whatsapp",
    });

    const createRes = await request(app)
      .post("/agent-openclaw-save/channels")
      .send({
        type: "WhatsApp",
        config: { accounts: { default: { enabled: true } } },
      });
    const updateRes = await request(app)
      .patch("/agent-openclaw-save/channels/whatsapp")
      .send({
        enabled: false,
      });
    const deleteRes = await request(app).delete("/agent-openclaw-save/channels/whatsapp");

    expect(createRes.status).toBe(200);
    expect(updateRes.status).toBe(200);
    expect(deleteRes.status).toBe(200);
    expect(mockOpenClaw.saveOpenClawChannel).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "agent-openclaw-save" }),
      "whatsapp",
      {
        type: "WhatsApp",
        config: { accounts: { default: { enabled: true } } },
      },
      { create: true },
    );
    expect(mockOpenClaw.saveOpenClawChannel).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "agent-openclaw-save" }),
      "whatsapp",
      { enabled: false },
    );
    expect(mockOpenClaw.deleteOpenClawChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-openclaw-save" }),
      "whatsapp",
    );
  });

  it("supports OpenClaw login and logout actions but blocks legacy login", async () => {
    queueOwnedAgent({
      id: "agent-openclaw-actions",
      user_id: "user-1",
      status: "running",
      runtime_family: "openclaw",
    });
    queueOwnedAgent({
      id: "agent-openclaw-actions",
      user_id: "user-1",
      status: "running",
      runtime_family: "openclaw",
    });
    queueOwnedAgent({
      id: "agent-openclaw-actions",
      user_id: "user-1",
      status: "running",
      runtime_family: "openclaw",
    });
    queueOwnedAgent({
      id: "agent-legacy-login",
      user_id: "user-1",
      status: "running",
      runtime_family: "hermes",
    });
    mockOpenClaw.startOpenClawChannelLogin.mockResolvedValueOnce({
      qrDataUrl: "data:image/png;base64,abc",
    });
    mockOpenClaw.waitOpenClawChannelLogin.mockResolvedValueOnce({
      success: true,
      connected: true,
    });
    mockOpenClaw.logoutOpenClawChannel.mockResolvedValueOnce({
      success: true,
    });

    const loginRes = await request(app)
      .post("/agent-openclaw-actions/channels/whatsapp/login")
      .send({ force: true });
    const waitRes = await request(app)
      .post("/agent-openclaw-actions/channels/whatsapp/login/wait")
      .send({ timeoutMs: 1000 });
    const logoutRes = await request(app)
      .post("/agent-openclaw-actions/channels/whatsapp/logout")
      .send({ accountId: "default" });
    const legacyLoginRes = await request(app)
      .post("/agent-legacy-login/channels/telegram/login")
      .send({ force: true });

    expect(loginRes.status).toBe(200);
    expect(waitRes.status).toBe(200);
    expect(logoutRes.status).toBe(200);
    expect(legacyLoginRes.status).toBe(409);
    expect(mockOpenClaw.startOpenClawChannelLogin).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-openclaw-actions" }),
      "whatsapp",
      { force: true },
    );
    expect(mockOpenClaw.waitOpenClawChannelLogin).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-openclaw-actions" }),
      "whatsapp",
      { timeoutMs: 1000 },
    );
    expect(mockOpenClaw.logoutOpenClawChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-openclaw-actions" }),
      "whatsapp",
      { accountId: "default" },
    );
    expect(legacyLoginRes.body.error).toMatch(/only available for OpenClaw/i);
  });

  it("connects an OpenClaw QR channel through the add-and-login helper", async () => {
    queueOwnedAgent({
      id: "agent-openclaw-connect",
      user_id: "user-1",
      status: "running",
      runtime_family: "openclaw",
    });
    queueOwnedAgent({
      id: "agent-legacy-connect",
      user_id: "user-1",
      status: "running",
      runtime_family: "hermes",
    });
    mockOpenClaw.connectOpenClawChannel.mockResolvedValueOnce({
      success: true,
      channel: "whatsapp",
      qrDataUrl: "data:image/png;base64,abc",
    });

    const connectRes = await request(app)
      .post("/agent-openclaw-connect/channels/whatsapp/connect")
      .send({ force: true, timeoutMs: 30000 });
    const legacyConnectRes = await request(app)
      .post("/agent-legacy-connect/channels/whatsapp/connect")
      .send({ force: true });

    expect(connectRes.status).toBe(200);
    expect(connectRes.body).toMatchObject({
      success: true,
      channel: "whatsapp",
      qrDataUrl: "data:image/png;base64,abc",
    });
    expect(legacyConnectRes.status).toBe(409);
    expect(mockOpenClaw.connectOpenClawChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-openclaw-connect" }),
      "whatsapp",
      { force: true, timeoutMs: 30000 },
    );
  });

  it("keeps legacy test and message routes working while blocking them for OpenClaw", async () => {
    queueOwnedAgent({
      id: "agent-legacy-actions",
      user_id: "user-1",
      status: "running",
      runtime_family: "hermes",
    });
    queueOwnedAgent({
      id: "agent-legacy-actions",
      user_id: "user-1",
      status: "running",
      runtime_family: "hermes",
    });
    queueOwnedAgent({
      id: "agent-openclaw-blocked",
      user_id: "user-1",
      status: "running",
      runtime_family: "openclaw",
    });
    queueOwnedAgent({
      id: "agent-openclaw-blocked",
      user_id: "user-1",
      status: "running",
      runtime_family: "openclaw",
    });
    mockChannels.testChannel.mockResolvedValueOnce({
      success: true,
      message: "Telegram is healthy",
    });
    mockChannels.getMessages.mockResolvedValueOnce([{ id: "msg-1", content: "hello" }]);

    const legacyTestRes = await request(app).post("/agent-legacy-actions/channels/ch-1/test");
    const legacyMessagesRes = await request(app).get(
      "/agent-legacy-actions/channels/ch-1/messages?limit=25",
    );
    const openClawTestRes = await request(app).post(
      "/agent-openclaw-blocked/channels/whatsapp/test",
    );
    const openClawMessagesRes = await request(app).get(
      "/agent-openclaw-blocked/channels/whatsapp/messages?limit=25",
    );

    expect(legacyTestRes.status).toBe(200);
    expect(legacyMessagesRes.status).toBe(200);
    expect(openClawTestRes.status).toBe(409);
    expect(openClawMessagesRes.status).toBe(409);
    expect(mockChannels.testChannel).toHaveBeenCalledWith("ch-1", "agent-legacy-actions");
    expect(mockChannels.getMessages).toHaveBeenCalledWith(
      "ch-1",
      "agent-legacy-actions",
      25,
    );
    expect(openClawTestRes.body.error).toMatch(/not available for OpenClaw/i);
    expect(openClawMessagesRes.body.error).toMatch(/not available for OpenClaw/i);
  });
});
