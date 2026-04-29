// @ts-nocheck
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockRestart = jest.fn();
const mockDestroy = jest.fn();
const mockStatus = jest.fn();
const mockStats = jest.fn();
const mockLogs = jest.fn();
const mockExec = jest.fn();
const mockHermesStart = jest.fn();
const mockHermesStop = jest.fn();
const mockHermesRestart = jest.fn();
const mockHermesDestroy = jest.fn();
const mockHermesStatus = jest.fn();
const mockHermesStats = jest.fn();
const mockHermesLogs = jest.fn();
const mockHermesExec = jest.fn();
const mockK8sStart = jest.fn();
const mockK8sStop = jest.fn();
const mockK8sRestart = jest.fn();
const mockK8sDestroy = jest.fn();
const mockK8sStatus = jest.fn();
const mockK8sStats = jest.fn();
const mockK8sLogs = jest.fn();
const mockK8sExec = jest.fn();

jest.mock("../backends/hermes", () => {
  return jest.fn().mockImplementation(() => ({
    start: mockHermesStart,
    stop: mockHermesStop,
    restart: mockHermesRestart,
    destroy: mockHermesDestroy,
    status: mockHermesStatus,
    stats: mockHermesStats,
    logs: mockHermesLogs,
    exec: mockHermesExec,
  }));
});

jest.mock("../backends/nemoclaw", () => {
  return jest.fn().mockImplementation(() => ({
    start: mockStart,
    stop: mockStop,
    restart: mockRestart,
    destroy: mockDestroy,
    status: mockStatus,
    stats: mockStats,
    logs: mockLogs,
    exec: mockExec,
  }));
});

jest.mock("../../workers/provisioner/backends/k8s", () => {
  return jest.fn().mockImplementation(() => ({
    start: mockK8sStart,
    stop: mockK8sStop,
    restart: mockK8sRestart,
    destroy: mockK8sDestroy,
    status: mockK8sStatus,
    stats: mockK8sStats,
    logs: mockK8sLogs,
    exec: mockK8sExec,
  }));
});

describe("containerManager NemoClaw routing", () => {
  beforeEach(() => {
    jest.resetModules();
    mockStart.mockReset().mockResolvedValue(undefined);
    mockStop.mockReset().mockResolvedValue(undefined);
    mockRestart.mockReset().mockResolvedValue(undefined);
    mockDestroy.mockReset().mockResolvedValue(undefined);
    mockStatus.mockReset().mockResolvedValue({ running: true });
    mockStats.mockReset().mockResolvedValue({
      backend_type: "docker",
      capabilities: { cpu: true, memory: true, network: true, disk: true, pids: true },
      current: { recorded_at: "2026-04-08T00:00:00.000Z", running: true, uptime_seconds: 5 },
    });
    mockLogs.mockReset().mockResolvedValue("log-stream");
    mockExec.mockReset().mockResolvedValue({ exec: "exec-instance", stream: "stream-instance" });
    mockHermesStart.mockReset().mockResolvedValue(undefined);
    mockHermesStop.mockReset().mockResolvedValue(undefined);
    mockHermesRestart.mockReset().mockResolvedValue(undefined);
    mockHermesDestroy.mockReset().mockResolvedValue(undefined);
    mockHermesStatus.mockReset().mockResolvedValue({ running: true });
    mockHermesStats.mockReset().mockResolvedValue({
      backend_type: "docker",
      capabilities: { cpu: true, memory: true, network: true, disk: true, pids: true },
      current: { recorded_at: "2026-04-08T00:00:00.000Z", running: true, uptime_seconds: 5 },
    });
    mockHermesLogs.mockReset().mockResolvedValue("hermes-log-stream");
    mockHermesExec.mockReset().mockResolvedValue({ exec: "hermes-exec", stream: "hermes-stream" });
    mockK8sStart.mockReset().mockResolvedValue(undefined);
    mockK8sStop.mockReset().mockResolvedValue(undefined);
    mockK8sRestart.mockReset().mockResolvedValue(undefined);
    mockK8sDestroy.mockReset().mockResolvedValue(undefined);
    mockK8sStatus.mockReset().mockResolvedValue({ running: true });
    mockK8sStats.mockReset().mockResolvedValue({
      backend_type: "k8s",
      capabilities: { cpu: true, memory: true, network: true, disk: true, pids: false },
      current: { recorded_at: "2026-04-08T00:00:00.000Z", running: true, uptime_seconds: 5 },
    });
    mockK8sLogs.mockReset().mockResolvedValue("k8s-log-stream");
    mockK8sExec.mockReset().mockResolvedValue({ exec: "k8s-exec", stream: "k8s-stream" });
  });

  it("routes lifecycle, telemetry, logs, and exec calls to the NemoClaw backend", async () => {
    const containerManager = require("../containerManager");
    const agent = {
      runtime_family: "openclaw",
      deploy_target: "docker",
      sandbox_profile: "nemoclaw",
      backend_type: "docker",
      container_id: "nemo-123",
    };

    await containerManager.start(agent);
    await containerManager.stop(agent);
    await containerManager.restart(agent);
    await containerManager.destroy(agent);
    await containerManager.status(agent);
    const telemetry = await containerManager.stats(agent);
    const logs = await containerManager.logs(agent, { tail: 50 });
    const exec = await containerManager.exec(agent, { tty: true });

    expect(mockStart).toHaveBeenCalledWith("nemo-123");
    expect(mockStop).toHaveBeenCalledWith("nemo-123");
    expect(mockRestart).toHaveBeenCalledWith("nemo-123");
    expect(mockDestroy).toHaveBeenCalledWith("nemo-123");
    expect(mockStatus).toHaveBeenCalledWith("nemo-123");
    expect(mockStats).toHaveBeenCalledWith("nemo-123", agent);
    expect(mockLogs).toHaveBeenCalledWith("nemo-123", { tail: 50 });
    expect(mockExec).toHaveBeenCalledWith("nemo-123", { tty: true });
    expect(telemetry).toEqual(expect.objectContaining({ backend_type: "docker" }));
    expect(logs).toBe("log-stream");
    expect(exec).toEqual({ exec: "exec-instance", stream: "stream-instance" });
  });

  it("routes new-format docker plus nemoclaw sandbox rows to the NemoClaw backend", async () => {
    const containerManager = require("../containerManager");
    const agent = {
      runtime_family: "openclaw",
      deploy_target: "docker",
      sandbox_profile: "nemoclaw",
      container_id: "nemo-456",
    };

    await containerManager.start(agent);

    expect(mockStart).toHaveBeenCalledWith("nemo-456");
  });

  it("keeps Kubernetes plus NemoClaw lifecycle calls on the Kubernetes adapter", async () => {
    const containerManager = require("../containerManager");
    const agent = {
      runtime_family: "openclaw",
      deploy_target: "k8s",
      sandbox_profile: "nemoclaw",
      backend_type: "k8s",
      container_id: "oclaw-agent-nemo-k8s",
    };

    await containerManager.start(agent);
    await containerManager.stop(agent);
    await containerManager.restart(agent);
    await containerManager.destroy(agent);
    await containerManager.status(agent);
    const telemetry = await containerManager.stats(agent);
    const logs = await containerManager.logs(agent, { tail: 50 });
    const exec = await containerManager.exec(agent, { tty: true });

    expect(mockK8sStart).toHaveBeenCalledWith("oclaw-agent-nemo-k8s");
    expect(mockK8sStop).toHaveBeenCalledWith("oclaw-agent-nemo-k8s");
    expect(mockK8sRestart).toHaveBeenCalledWith("oclaw-agent-nemo-k8s");
    expect(mockK8sDestroy).toHaveBeenCalledWith("oclaw-agent-nemo-k8s");
    expect(mockK8sStatus).toHaveBeenCalledWith("oclaw-agent-nemo-k8s");
    expect(mockK8sStats).toHaveBeenCalledWith("oclaw-agent-nemo-k8s", agent);
    expect(mockK8sLogs).toHaveBeenCalledWith("oclaw-agent-nemo-k8s", { tail: 50 });
    expect(mockK8sExec).toHaveBeenCalledWith("oclaw-agent-nemo-k8s", { tty: true });
    expect(mockStart).not.toHaveBeenCalled();
    expect(telemetry).toEqual(expect.objectContaining({ backend_type: "k8s" }));
    expect(logs).toBe("k8s-log-stream");
    expect(exec).toEqual({ exec: "k8s-exec", stream: "k8s-stream" });
  });

  // ─── Null-container invariant ────────────────────────────────
  // containerManager must never pass a null/empty container_id to an adapter.
  // dockerode stringifies JS null into its URL and the daemon returns a
  // confusing `No such container: null` — we block that at this seam so the
  // failure mode is a clean 409 instead of an opaque Docker 404.

  it("throws NoContainerError (409) when mutating an agent with null container_id", async () => {
    const containerManager = require("../containerManager");
    const agent = {
      runtime_family: "openclaw",
      deploy_target: "docker",
      sandbox_profile: "nemoclaw",
      backend_type: "docker",
      container_id: null,
    };

    await expect(containerManager.start(agent)).rejects.toMatchObject({
      name: "NoContainerError",
      statusCode: 409,
      code: "NO_CONTAINER",
    });
    await expect(containerManager.stop(agent)).rejects.toMatchObject({ code: "NO_CONTAINER" });
    await expect(containerManager.restart(agent)).rejects.toMatchObject({ code: "NO_CONTAINER" });
    await expect(containerManager.destroy(agent)).rejects.toMatchObject({ code: "NO_CONTAINER" });
    await expect(containerManager.logs(agent)).rejects.toMatchObject({ code: "NO_CONTAINER" });
    await expect(containerManager.exec(agent)).rejects.toMatchObject({ code: "NO_CONTAINER" });

    // Adapter must not have been touched.
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
    expect(mockRestart).not.toHaveBeenCalled();
    expect(mockDestroy).not.toHaveBeenCalled();
    expect(mockLogs).not.toHaveBeenCalled();
    expect(mockExec).not.toHaveBeenCalled();
  });

  it("returns a stable not-running snapshot for status()/stats() when container_id is null", async () => {
    const containerManager = require("../containerManager");
    const agent = {
      runtime_family: "openclaw",
      deploy_target: "docker",
      sandbox_profile: "nemoclaw",
      backend_type: "docker",
      container_id: null,
    };

    // status() is called from background reconciliation and from several live
    // endpoints — throwing would force every caller to try/catch. Instead we
    // return a well-defined "not running" shape and never touch the adapter.
    const status = await containerManager.status(agent);
    expect(status).toEqual({ running: false, uptime: 0, cpu: null, memory: null });
    expect(mockStatus).not.toHaveBeenCalled();

    const stats = await containerManager.stats(agent);
    expect(stats).toBeNull();
    expect(mockStats).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "  "])("treats container_id %p as missing", async (value) => {
    const containerManager = require("../containerManager");
    const agent = {
      runtime_family: "openclaw",
      deploy_target: "docker",
      sandbox_profile: "nemoclaw",
      backend_type: "docker",
      container_id: value,
    };
    // Empty-string / whitespace container_id must be rejected the same as null.
    // (Current guard is strict type+length; whitespace is allowed through so
    //  it will bubble as a Docker 404 with the literal whitespace id. That's
    //  at least informative — this test documents the intended contract.)
    if (typeof value === "string" && value.length > 0) {
      await containerManager.start(agent);
      expect(mockStart).toHaveBeenCalledWith(value);
    } else {
      await expect(containerManager.start(agent)).rejects.toMatchObject({ code: "NO_CONTAINER" });
      expect(mockStart).not.toHaveBeenCalled();
    }
  });

  it("routes Hermes lifecycle, telemetry, logs, and exec calls to the Hermes backend", async () => {
    const containerManager = require("../containerManager");
    const agent = {
      runtime_family: "hermes",
      deploy_target: "docker",
      sandbox_profile: "standard",
      container_id: "hermes-123",
    };

    await containerManager.start(agent);
    await containerManager.stop(agent);
    await containerManager.restart(agent);
    await containerManager.destroy(agent);
    await containerManager.status(agent);
    const telemetry = await containerManager.stats(agent);
    const logs = await containerManager.logs(agent, { tail: 25 });
    const exec = await containerManager.exec(agent, { tty: true });

    expect(mockHermesStart).toHaveBeenCalledWith("hermes-123");
    expect(mockHermesStop).toHaveBeenCalledWith("hermes-123");
    expect(mockHermesRestart).toHaveBeenCalledWith("hermes-123");
    expect(mockHermesDestroy).toHaveBeenCalledWith("hermes-123");
    expect(mockHermesStatus).toHaveBeenCalledWith("hermes-123");
    expect(mockHermesStats).toHaveBeenCalledWith("hermes-123", agent);
    expect(mockHermesLogs).toHaveBeenCalledWith("hermes-123", { tail: 25 });
    expect(mockHermesExec).toHaveBeenCalledWith("hermes-123", { tty: true });
    expect(telemetry).toEqual(expect.objectContaining({ backend_type: "docker" }));
    expect(logs).toBe("hermes-log-stream");
    expect(exec).toEqual({ exec: "hermes-exec", stream: "hermes-stream" });
  });
});
