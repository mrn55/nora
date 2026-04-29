// @ts-nocheck
const {
  buildAgentRuntimeFields,
  isSameRuntimePath,
  resolveRequestedRuntimeFields,
} = require("../agentRuntimeFields");

const ENV_KEYS = [
  "ENABLED_BACKENDS",
  "ENABLED_RUNTIME_FAMILIES",
  "ENABLED_SANDBOX_PROFILES",
  "KUBECONFIG",
];

function clearRuntimeEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("agent runtime fields", () => {
  afterEach(() => {
    clearRuntimeEnv();
  });

  it("does not infer NemoClaw from legacy backend_type rows", () => {
    expect(
      buildAgentRuntimeFields({
        backend_type: "nemoclaw",
        sandbox_type: "nemoclaw",
      }),
    ).toEqual(
      expect.objectContaining({
        runtime_family: "openclaw",
        deploy_target: "docker",
        sandbox_profile: "nemoclaw",
        backend_type: "docker",
        sandbox_type: "nemoclaw",
      }),
    );
  });

  it("does not infer Hermes from legacy backend_type rows", () => {
    expect(
      buildAgentRuntimeFields({
        backend_type: "hermes",
      }),
    ).toEqual(
      expect.objectContaining({
        runtime_family: "openclaw",
        deploy_target: "docker",
        sandbox_profile: "standard",
        backend_type: "docker",
        sandbox_type: "standard",
      }),
    );
  });

  it("prefers explicit runtime fields over stale legacy aliases", () => {
    expect(
      buildAgentRuntimeFields({
        runtime_family: "openclaw",
        deploy_target: "k8s",
        sandbox_profile: "standard",
        backend_type: "nemoclaw",
        sandbox_type: "nemoclaw",
      }),
    ).toEqual(
      expect.objectContaining({
        runtime_family: "openclaw",
        deploy_target: "k8s",
        sandbox_profile: "standard",
        backend_type: "k8s",
        sandbox_type: "standard",
      }),
    );
  });

  it("keeps backend_type as the deploy target for Docker plus NemoClaw", () => {
    expect(
      buildAgentRuntimeFields({
        runtime_family: "openclaw",
        deploy_target: "docker",
        sandbox_profile: "nemoclaw",
      }),
    ).toEqual(
      expect.objectContaining({
        deploy_target: "docker",
        sandbox_profile: "nemoclaw",
        backend_type: "docker",
        sandbox_type: "nemoclaw",
      }),
    );
  });

  it("keeps backend_type as the deploy target for Hermes", () => {
    expect(
      buildAgentRuntimeFields({
        runtime_family: "hermes",
        deploy_target: "proxmox",
        sandbox_profile: "standard",
      }),
    ).toEqual(
      expect.objectContaining({
        runtime_family: "hermes",
        deploy_target: "proxmox",
        sandbox_profile: "standard",
        backend_type: "proxmox",
        sandbox_type: "standard",
      }),
    );
  });

  it("collapses unsupported runtime-family values back to the stable OpenClaw contract", () => {
    expect(
      buildAgentRuntimeFields({
        runtime_family: "future-runtime",
        deploy_target: "docker",
        sandbox_profile: "standard",
      }),
    ).toEqual(
      expect.objectContaining({
        runtime_family: "openclaw",
        deploy_target: "docker",
        sandbox_profile: "standard",
        backend_type: "docker",
        sandbox_type: "standard",
      }),
    );
  });

  it("treats a redeploy target override as a standard sandbox unless NemoClaw is explicitly requested", () => {
    process.env.ENABLED_BACKENDS = "docker,k8s";

    expect(
      resolveRequestedRuntimeFields({
        request: {
          deploy_target: "k8s",
        },
        fallback: {
          runtime_family: "openclaw",
          deploy_target: "docker",
          sandbox_profile: "nemoclaw",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        runtime_family: "openclaw",
        deploy_target: "k8s",
        sandbox_profile: "standard",
        backend_type: "k8s",
        sandbox_type: "standard",
      }),
    );
  });

  it("switches to Hermes defaults when the requested runtime family changes", () => {
    process.env.ENABLED_RUNTIME_FAMILIES = "openclaw,hermes";

    expect(
      resolveRequestedRuntimeFields({
        request: {
          runtime_family: "hermes",
        },
        fallback: {
          runtime_family: "openclaw",
          deploy_target: "k8s",
          sandbox_profile: "standard",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        runtime_family: "hermes",
        deploy_target: "docker",
        sandbox_profile: "standard",
        backend_type: "docker",
        sandbox_type: "standard",
      }),
    );
  });

  it("uses the enabled sandbox default when NemoClaw is the only OpenClaw sandbox profile", () => {
    process.env.ENABLED_SANDBOX_PROFILES = "nemoclaw";

    expect(resolveRequestedRuntimeFields()).toEqual(
      expect.objectContaining({
        runtime_family: "openclaw",
        deploy_target: "docker",
        sandbox_profile: "nemoclaw",
        backend_type: "docker",
        sandbox_type: "nemoclaw",
      }),
    );
  });

  it("uses the Hermes runtime-family default when Hermes is the only enabled runtime family", () => {
    process.env.ENABLED_RUNTIME_FAMILIES = "hermes";

    expect(resolveRequestedRuntimeFields()).toEqual(
      expect.objectContaining({
        runtime_family: "hermes",
        deploy_target: "docker",
        sandbox_profile: "standard",
        backend_type: "docker",
        sandbox_type: "standard",
      }),
    );
  });

  it("treats deploy-target aliases and explicit runtime metadata for the same path as equivalent", () => {
    expect(
      isSameRuntimePath(
        {
          backend_type: "kubernetes",
          sandbox_type: "standard",
        },
        {
          runtime_family: "openclaw",
          deploy_target: "k8s",
          sandbox_profile: "standard",
        },
      ),
    ).toBe(true);

    expect(
      isSameRuntimePath(
        {
          backend_type: "docker",
          sandbox_type: "standard",
        },
        {
          runtime_family: "openclaw",
          deploy_target: "docker",
          sandbox_profile: "nemoclaw",
        },
      ),
    ).toBe(false);
  });

  it("treats K3s as a Kubernetes deploy-target alias", () => {
    process.env.ENABLED_BACKENDS = "docker,k3s";
    process.env.KUBECONFIG = "/tmp/test-kubeconfig";

    expect(
      buildAgentRuntimeFields({
        runtime_family: "openclaw",
        deploy_target: "k3s",
        sandbox_profile: "nemoclaw",
      }),
    ).toEqual(
      expect.objectContaining({
        runtime_family: "openclaw",
        deploy_target: "k8s",
        sandbox_profile: "nemoclaw",
        backend_type: "k8s",
        sandbox_type: "nemoclaw",
      }),
    );

    expect(
      resolveRequestedRuntimeFields({
        request: {
          deploy_target: "k3s",
          sandbox_profile: "nemoclaw",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        deploy_target: "k8s",
        sandbox_profile: "nemoclaw",
        backend_type: "k8s",
      }),
    );
  });
});
