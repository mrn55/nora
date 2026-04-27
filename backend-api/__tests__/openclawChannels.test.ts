// @ts-nocheck
const mockRpcCall = jest.fn();
const mockRunContainerCommand = jest.fn();

jest.mock("../gatewayProxy", () => ({
  rpcCall: (...args) => mockRpcCall(...args),
}));

jest.mock("../authSync", () => ({
  runContainerCommand: (...args) => mockRunContainerCommand(...args),
}));

const {
  connectOpenClawChannel,
  deleteOpenClawChannel,
  listOpenClawChannels,
  saveOpenClawChannel,
} = require("../channels/openclaw");

describe("openclaw channel catalog compatibility", () => {
  const agent = {
    id: "agent-openclaw-1",
    runtime_family: "openclaw",
    status: "running",
  };

  beforeEach(() => {
    mockRpcCall.mockReset();
    mockRunContainerCommand.mockReset();
  });

  it("builds available channel types from metadata maps when channel order is missing", async () => {
    mockRpcCall
      .mockResolvedValueOnce({
        channelMeta: [
          {
            id: "telegram",
            label: "Telegram",
            detailLabel: "Telegram (Bot API)",
          },
        ],
        channelLabels: {
          whatsapp: "WhatsApp (QR link)",
        },
        channelDetailLabels: {
          whatsapp: "WhatsApp (QR link)",
        },
        channelSystemImages: {
          whatsapp: "systems/whatsapp.png",
        },
      })
      .mockResolvedValueOnce({
        hash: "cfg-1",
        config: { channels: {} },
      });

    const payload = await listOpenClawChannels(agent);

    expect(payload.runtime).toBe("openclaw");
    expect(payload.channels).toEqual([]);
    expect(payload.availableTypes).toEqual([
      expect.objectContaining({
        type: "telegram",
        label: "Telegram (Bot API)",
        detailLabel: "Telegram (Bot API)",
      }),
      expect.objectContaining({
        type: "whatsapp",
        label: "WhatsApp (QR link)",
        detailLabel: "WhatsApp (QR link)",
        systemImage: "systems/whatsapp.png",
      }),
    ]);
  });

  it("merges schema channel types when runtime status only reports active providers", async () => {
    mockRpcCall
      .mockResolvedValueOnce({
        channelOrder: ["qqbot"],
        channelMeta: [{ id: "qqbot", label: "QQ Bot" }],
        channels: {
          qqbot: {
            configured: false,
          },
        },
      })
      .mockResolvedValueOnce({
        hash: "cfg-partial",
        config: { channels: {} },
      })
      .mockResolvedValueOnce({
        children: [
          {
            key: "telegram",
            path: "channels.telegram",
            hint: { label: "Telegram", help: "Telegram bot API." },
          },
          {
            key: "whatsapp",
            path: "channels.whatsapp",
            hint: { label: "WhatsApp", help: "QR login." },
          },
        ],
      });

    const payload = await listOpenClawChannels(agent);

    expect(payload.availableTypes.map((entry) => entry.type)).toEqual([
      "qqbot",
      "telegram",
      "whatsapp",
    ]);
    expect(payload.availableTypes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "telegram",
          label: "Telegram (Bot API)",
        }),
        expect.objectContaining({
          type: "whatsapp",
          label: "WhatsApp (QR link)",
        }),
      ]),
    );
  });

  it("keeps runtime channel types when schema lookup is unavailable", async () => {
    mockRpcCall
      .mockResolvedValueOnce({
        channelMeta: [{ id: "qqbot", label: "QQ Bot" }],
      })
      .mockResolvedValueOnce({
        hash: "cfg-schema-unavailable",
        config: { channels: {} },
      })
      .mockRejectedValueOnce(new Error("schema lookup unavailable"));

    const payload = await listOpenClawChannels(agent);

    expect(payload.availableTypes).toEqual([
      expect.objectContaining({
        type: "qqbot",
        label: "QQ Bot",
      }),
    ]);
  });

  it("allows creating a metadata-only OpenClaw channel", async () => {
    mockRpcCall
      .mockResolvedValueOnce({
        channelMeta: [{ id: "telegram", label: "Telegram" }],
      })
      .mockResolvedValueOnce({
        hash: "cfg-2",
        config: { channels: {} },
      })
      .mockResolvedValueOnce({
        restart: "requested",
      });

    const result = await saveOpenClawChannel(
      agent,
      "telegram",
      {
        config: {
          botToken: "secret-token",
        },
      },
      { create: true },
    );

    expect(result).toEqual({
      success: true,
      channel: "telegram",
      restart: "requested",
    });
    expect(mockRpcCall).toHaveBeenCalledTimes(3);
    expect(mockRpcCall).toHaveBeenNthCalledWith(
      3,
      agent,
      "config.patch",
      {
        raw: JSON.stringify({
          channels: {
            telegram: {
              enabled: true,
              botToken: "secret-token",
            },
          },
        }),
        baseHash: "cfg-2",
      },
      undefined,
    );
  });

  it("seeds WhatsApp config before starting QR login", async () => {
    mockRpcCall
      .mockResolvedValueOnce({
        channelMeta: [{ id: "whatsapp", label: "WhatsApp" }],
      })
      .mockResolvedValueOnce({
        hash: "cfg-connect",
        config: { channels: {} },
      })
      .mockResolvedValueOnce({
        restart: "requested",
      })
      .mockResolvedValueOnce({
        qrDataUrl: "data:image/png;base64,qr",
        message: "Scan this QR in WhatsApp.",
      });

    const result = await connectOpenClawChannel(agent, "whatsapp", {
      force: true,
      timeoutMs: 30000,
    });

    expect(result).toMatchObject({
      success: true,
      channel: "whatsapp",
      restart: "requested",
      qrDataUrl: "data:image/png;base64,qr",
      login: {
        qrDataUrl: "data:image/png;base64,qr",
      },
    });
    expect(mockRpcCall).toHaveBeenNthCalledWith(
      3,
      agent,
      "config.patch",
      {
        raw: JSON.stringify({
          channels: {
            whatsapp: {
              enabled: true,
              accounts: {
                default: {
                  enabled: true,
                },
              },
            },
          },
        }),
        baseHash: "cfg-connect",
      },
      undefined,
    );
    expect(mockRpcCall).toHaveBeenNthCalledWith(
      4,
      agent,
      "web.login.start",
      {
        force: true,
        timeoutMs: 30000,
      },
      undefined,
    );
  });

  it("retries QR login when the channel config restart briefly closes the gateway", async () => {
    mockRpcCall
      .mockResolvedValueOnce({
        channelMeta: [{ id: "whatsapp", label: "WhatsApp" }],
      })
      .mockResolvedValueOnce({
        hash: "cfg-connect-restart",
        config: { channels: {} },
      })
      .mockResolvedValueOnce({
        restart: "requested",
      })
      .mockRejectedValueOnce(new Error("Gateway connection closed"))
      .mockResolvedValueOnce({
        qrDataUrl: "data:image/png;base64,qr-after-restart",
        message: "Scan this QR in WhatsApp.",
      });

    const result = await connectOpenClawChannel(agent, "whatsapp", {
      force: true,
      timeoutMs: 30000,
    });

    expect(result).toMatchObject({
      success: true,
      channel: "whatsapp",
      restart: "requested",
      qrDataUrl: "data:image/png;base64,qr-after-restart",
    });
    expect(mockRpcCall).toHaveBeenNthCalledWith(
      4,
      agent,
      "web.login.start",
      {
        force: true,
        timeoutMs: 30000,
      },
      undefined,
    );
    expect(mockRpcCall).toHaveBeenNthCalledWith(
      5,
      agent,
      "web.login.start",
      {
        force: true,
        timeoutMs: 30000,
      },
      undefined,
    );
  });

  it("installs and restarts the WhatsApp provider when QR login is not loaded yet", async () => {
    mockRpcCall
      .mockResolvedValueOnce({
        channelMeta: [{ id: "whatsapp", label: "WhatsApp" }],
      })
      .mockResolvedValueOnce({
        hash: "cfg-connect-install",
        config: { channels: {} },
      })
      .mockResolvedValueOnce({
        restart: "requested",
      })
      .mockRejectedValueOnce(
        Object.assign(new Error("web login provider is not available"), {
          code: "INVALID_REQUEST",
        }),
      )
      .mockResolvedValueOnce({
        qrDataUrl: "data:image/png;base64,qr-after-install",
        message: "Scan this QR in WhatsApp.",
      });
    mockRunContainerCommand.mockResolvedValueOnce({
      exitCode: 0,
      output: "installed",
    });

    const result = await connectOpenClawChannel(agent, "whatsapp", {
      force: true,
      accountId: "default",
      timeoutMs: 30000,
    });

    expect(result).toMatchObject({
      success: true,
      channel: "whatsapp",
      qrDataUrl: "data:image/png;base64,qr-after-install",
    });
    expect(mockRunContainerCommand).toHaveBeenCalledWith(
      agent,
      expect.stringContaining('plugins install "$spec" --force'),
      { timeout: 240000 },
    );
    expect(mockRunContainerCommand.mock.calls[0][1]).toContain(
      "install_openclaw_plugin 'whatsapp' '@openclaw/whatsapp'",
    );
    expect(mockRunContainerCommand.mock.calls[0][1]).toContain(
      "OPENCLAW_PLUGIN_INSTALL_MAX_OLD_SPACE_MB:-256",
    );
    expect(mockRunContainerCommand.mock.calls[0][1]).toContain("gateway restart");
    expect(mockRpcCall).toHaveBeenNthCalledWith(
      5,
      agent,
      "web.login.start",
      {
        force: true,
        accountId: "default",
        timeoutMs: 30000,
      },
      undefined,
    );
  });

  it("explains code 137 WhatsApp provider install failures as likely memory pressure", async () => {
    mockRpcCall
      .mockResolvedValueOnce({
        channelMeta: [{ id: "whatsapp", label: "WhatsApp" }],
      })
      .mockResolvedValueOnce({
        hash: "cfg-connect-oom",
        config: { channels: {} },
      })
      .mockResolvedValueOnce({
        restart: "requested",
      })
      .mockRejectedValueOnce(
        Object.assign(new Error("web login provider is not available"), {
          code: "INVALID_REQUEST",
        }),
      );
    const killed = new Error("Container command exited with code 137");
    killed.exitCode = 137;
    mockRunContainerCommand.mockRejectedValueOnce(killed);

    await expect(
      connectOpenClawChannel(agent, "whatsapp", {
        force: true,
        timeoutMs: 30000,
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining("ran out of memory"),
    });
  });

  it("lists channel types from the config schema when runtime status exposes no catalog", async () => {
    mockRpcCall
      .mockResolvedValueOnce({
        channelMeta: [],
        channelOrder: [],
        channels: {},
      })
      .mockResolvedValueOnce({
        hash: "cfg-2b",
        config: { channels: {} },
      })
      .mockResolvedValueOnce({
        path: "channels",
        children: [
          {
            key: "signal",
            path: "channels.signal",
            required: false,
            hasChildren: true,
            hint: {
              label: "Signal",
              help: "Signal bridge settings.",
            },
          },
          {
            key: "telegram",
            path: "channels.telegram",
            required: false,
            hasChildren: true,
            hint: {
              label: "Telegram",
              help: "Telegram bot settings.",
            },
          },
        ],
      });

    const payload = await listOpenClawChannels(agent);

    expect(payload.availableTypes).toEqual([
      expect.objectContaining({
        type: "signal",
      }),
      expect.objectContaining({
        type: "telegram",
      }),
    ]);
  });

  it("allows creating a schema-only OpenClaw channel", async () => {
    mockRpcCall
      .mockResolvedValueOnce({
        channelMeta: [],
        channelOrder: [],
        channels: {},
      })
      .mockResolvedValueOnce({
        hash: "cfg-2c",
        config: { channels: {} },
      })
      .mockResolvedValueOnce({
        path: "channels",
        children: [
          {
            key: "signal",
            path: "channels.signal",
            required: false,
            hasChildren: true,
            hint: {
              label: "Signal",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        restart: "requested",
      });

    const result = await saveOpenClawChannel(
      agent,
      "signal",
      {
        config: {
          socketPath: "/tmp/signal.sock",
        },
      },
      { create: true },
    );

    expect(result).toEqual({
      success: true,
      channel: "signal",
      restart: "requested",
    });
    expect(mockRpcCall).toHaveBeenNthCalledWith(
      4,
      agent,
      "config.patch",
      {
        raw: JSON.stringify({
          channels: {
            signal: {
              enabled: true,
              socketPath: "/tmp/signal.sock",
            },
          },
        }),
        baseHash: "cfg-2c",
      },
      undefined,
    );
  });

  it("allows deleting a channel that only exists in the config snapshot", async () => {
    mockRpcCall
      .mockResolvedValueOnce({
        channelMeta: [],
        channelOrder: [],
        channels: {},
      })
      .mockResolvedValueOnce({
        hash: "cfg-3",
        config: {
          channels: {
            discord: {
              enabled: true,
            },
          },
        },
      })
      .mockResolvedValueOnce({
        restart: null,
      });

    const result = await deleteOpenClawChannel(agent, "discord");

    expect(result).toEqual({
      success: true,
      channel: "discord",
      restart: null,
    });
    expect(mockRpcCall).toHaveBeenCalledTimes(3);
    expect(mockRpcCall).toHaveBeenNthCalledWith(
      3,
      agent,
      "config.patch",
      {
        raw: JSON.stringify({
          channels: {
            discord: null,
          },
        }),
        baseHash: "cfg-3",
      },
      undefined,
    );
  });
});
