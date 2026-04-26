// @ts-nocheck
const DEFAULT_RUNTIME_FAMILY = "openclaw";
const KNOWN_RUNTIME_FAMILIES = Object.freeze(["openclaw", "hermes"]);
const KNOWN_DEPLOY_TARGETS = Object.freeze(["docker", "k8s", "proxmox"]);
const KNOWN_BACKENDS = KNOWN_DEPLOY_TARGETS;
const KNOWN_SANDBOX_PROFILES = Object.freeze(["standard", "nemoclaw"]);
const PROXMOX_RELEASE_BLOCKER_ISSUE =
  "Proxmox execution target is not configured for this Nora control plane.";

const OPENCLAW_OPERATOR_CONTRACT = Object.freeze([
  "deploy/redeploy",
  "readiness",
  "gateway/chat",
  "logs",
  "exec",
  "bootstrap/template files",
  "auth/integration sync",
]);
const HERMES_OPERATOR_CONTRACT = Object.freeze([
  "deploy/redeploy",
  "readiness",
  "logs",
  "exec",
  "provider/integration env sync",
]);

const MATURITY_METADATA = Object.freeze({
  ga: Object.freeze({
    id: "ga",
    label: "GA",
    summary: "Release-ready default path for normal onboarding.",
    onboardingVisible: true,
  }),
  beta: Object.freeze({
    id: "beta",
    label: "Beta",
    summary: "Usable with existing smoke coverage, but still maturing operationally.",
    onboardingVisible: true,
  }),
  experimental: Object.freeze({
    id: "experimental",
    label: "Experimental",
    summary: "Promising, but still under active contract validation and operator testing.",
    onboardingVisible: true,
  }),
  blocked: Object.freeze({
    id: "blocked",
    label: "Blocked",
    summary: "Visible for operator awareness, but intentionally excluded from normal onboarding.",
    onboardingVisible: false,
  }),
});

const RUNTIME_FAMILY_METADATA = Object.freeze({
  openclaw: Object.freeze({
    id: "openclaw",
    label: "OpenClaw",
    summary:
      "Default runtime family for Nora. Use deploy targets and sandbox profiles to change placement or isolation without changing the operator workflow.",
    contractStatus: "stable",
    contractStatusLabel: "Stable contract",
    operatorContract: [...OPENCLAW_OPERATOR_CONTRACT],
    operatorContractSummary:
      "Deploy/redeploy, readiness, gateway/chat, logs, exec, bootstrap/template files, and auth/integration sync all stay inside the OpenClaw contract.",
    expansionPolicy:
      "Add another runtime family only when it can satisfy Nora's full operator contract end-to-end.",
  }),
  hermes: Object.freeze({
    id: "hermes",
    label: "Hermes",
    summary:
      "Deploy Nous Hermes Agent under Nora lifecycle control while keeping the OpenClaw gateway surface out of the runtime contract.",
    contractStatus: "deployment-first",
    contractStatusLabel: "Deployment-first contract",
    operatorContract: [...HERMES_OPERATOR_CONTRACT],
    operatorContractSummary:
      "Deploy/redeploy, readiness, logs, exec, and provider or integration env sync stay inside the Hermes contract. OpenClaw gateway and chat surfaces are not part of this runtime family.",
    expansionPolicy:
      "Hermes can run on execution targets that provide the Hermes API and filesystem layout expected by Nora.",
  }),
});

const EXECUTION_TARGET_METADATA = Object.freeze({
  docker: Object.freeze({
    id: "docker",
    label: "Docker",
    shortLabel: "Docker",
    summary:
      "Containerized runtime on the local Docker host. This is the recommended default for most self-hosted deployments.",
    detail:
      "Run the selected runtime family as an isolated container on the local Docker host. This is the fastest and clearest path from install to live operations.",
    badges: ["Fast path", "Local socket", "General purpose"],
  }),
  k8s: Object.freeze({
    id: "k8s",
    label: "Kubernetes",
    shortLabel: "Kubernetes",
    summary:
      "Run agents as Kubernetes workloads when Nora should provision into a shared cluster instead of the local Docker host.",
    detail:
      "Use a shared cluster when your control plane is wired to Kubernetes and you want Nora to place runtimes as Deployments and Services.",
    badges: ["Cluster workload", "Service-backed", "Kube API"],
  }),
  proxmox: Object.freeze({
    id: "proxmox",
    label: "Proxmox",
    shortLabel: "Proxmox",
    summary:
      "Provision agents as Proxmox LXCs when your infrastructure standard is VM and LXC orchestration through the Proxmox API.",
    detail:
      "Use Proxmox when Nora should create LXCs through the Proxmox API instead of scheduling onto Docker or Kubernetes.",
    badges: ["LXC", "Proxmox API", "Infrastructure-specific"],
  }),
});

const SANDBOX_PROFILE_METADATA = Object.freeze({
  standard: Object.freeze({
    id: "standard",
    label: "Standard",
    summary:
      "Default runtime environment for the selected Nora runtime family and execution target.",
    detail:
      "Standard keeps the usual runtime workflow while the runtime family decides the operator contract and the execution target decides where the runtime is provisioned.",
    badges: ["Default"],
  }),
  nemoclaw: Object.freeze({
    id: "nemoclaw",
    label: "NemoClaw",
    summary:
      "NVIDIA secure sandbox path for OpenClaw agents that need stronger runtime restrictions and compatible model routing.",
    detail:
      "NemoClaw + OpenClaw agents run with deny-by-default networking and capability-restricted sandbox controls on supported execution targets.",
    badges: ["Secure sandbox", "Deny-by-default network", "Capability-restricted"],
  }),
});

const NEMOCLAW_MODELS = Object.freeze([
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/llama-3.1-nemotron-ultra-253b-v1",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "nvidia/nemotron-3-nano-30b-a3b",
]);

function normalizeRuntimeFamilyName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return KNOWN_RUNTIME_FAMILIES.includes(normalized)
    ? normalized
    : DEFAULT_RUNTIME_FAMILY;
}

function normalizeDeployTargetName(value) {
  const normalized = String(value || "docker").trim().toLowerCase();
  if (normalized === "kubernetes") return "k8s";
  return KNOWN_DEPLOY_TARGETS.includes(normalized) ? normalized : "docker";
}

function normalizeBackendName(value) {
  return normalizeDeployTargetName(value);
}

function normalizeSandboxProfileName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return KNOWN_SANDBOX_PROFILES.includes(normalized) ? normalized : "standard";
}

function isKnownRuntimeFamily(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return KNOWN_RUNTIME_FAMILIES.includes(normalized);
}

function isKnownDeployTarget(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "kubernetes" || KNOWN_DEPLOY_TARGETS.includes(normalized);
}

function isKnownBackend(value) {
  return isKnownDeployTarget(value);
}

function isKnownSandboxProfile(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return KNOWN_SANDBOX_PROFILES.includes(normalized);
}

function getRuntimeFamilyMetadata(runtimeFamily) {
  return RUNTIME_FAMILY_METADATA[normalizeRuntimeFamilyName(runtimeFamily)];
}

function getExecutionTargetMetadata(deployTarget) {
  return EXECUTION_TARGET_METADATA[normalizeDeployTargetName(deployTarget)];
}

function getSandboxProfileMetadata(sandboxProfile) {
  return SANDBOX_PROFILE_METADATA[normalizeSandboxProfileName(sandboxProfile)];
}

function runtimeFamilyForBackend() {
  return DEFAULT_RUNTIME_FAMILY;
}

function deployTargetForBackend(backend) {
  return normalizeDeployTargetName(backend);
}

function sandboxForBackend() {
  return "standard";
}

function backendForRuntimeSelection({ deployTarget = "docker" } = {}) {
  return normalizeDeployTargetName(deployTarget);
}

function selectionTypeForBackend() {
  return "deploy_target";
}

function getBackendMetadata(backend) {
  const deployTarget = normalizeDeployTargetName(backend);
  const metadata = getExecutionTargetMetadata(deployTarget);
  return {
    ...metadata,
    id: deployTarget,
    runtimeFamily: DEFAULT_RUNTIME_FAMILY,
    deployTarget,
    sandboxProfile: "standard",
    label: `${getRuntimeFamilyMetadata(DEFAULT_RUNTIME_FAMILY).label} + ${metadata.label}`,
    maturityTier: resolveMaturityTier({
      runtimeFamily: DEFAULT_RUNTIME_FAMILY,
      deployTarget,
      sandboxProfile: "standard",
    }),
  };
}

function sandboxProfileLabel(sandboxProfile) {
  return getSandboxProfileMetadata(sandboxProfile)?.label || "Standard";
}

function getMaturityMetadata(maturityTier) {
  return MATURITY_METADATA[maturityTier] || MATURITY_METADATA.ga;
}

function buildMaturityFields(maturityTier) {
  const maturity = getMaturityMetadata(maturityTier);
  return {
    maturity,
    maturityTier: maturity.id,
    maturityLabel: maturity.label,
    maturitySummary: maturity.summary,
    onboardingVisible: maturity.onboardingVisible,
  };
}

function resolveMaturityTier({ runtimeFamily, deployTarget, sandboxProfile }) {
  if (normalizeSandboxProfileName(sandboxProfile) === "nemoclaw") return "experimental";
  if (normalizeRuntimeFamilyName(runtimeFamily) === "hermes") return "experimental";

  switch (normalizeDeployTargetName(deployTarget)) {
    case "k8s":
    case "proxmox":
      return "beta";
    default:
      return "ga";
  }
}

function parseList(rawValue, isKnown, normalize) {
  const seen = new Set();
  const parsed = [];
  for (const entry of String(rawValue || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    if (!isKnown(entry)) continue;
    const normalized = normalize(entry);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    parsed.push(normalized);
  }
  return parsed;
}

function parseEnabledBackendList(rawValue) {
  return parseList(rawValue, isKnownDeployTarget, normalizeDeployTargetName);
}

function parseEnabledRuntimeFamilyList(rawValue) {
  return parseList(rawValue, isKnownRuntimeFamily, normalizeRuntimeFamilyName);
}

function parseEnabledSandboxProfileList(rawValue) {
  return parseList(rawValue, isKnownSandboxProfile, normalizeSandboxProfileName);
}

function getEnabledBackends(env = process.env) {
  const explicit = parseEnabledBackendList(env.ENABLED_BACKENDS);
  return explicit.length > 0 ? explicit : ["docker"];
}

function getEnabledRuntimeFamilies(env = process.env) {
  const explicit = parseEnabledRuntimeFamilyList(env.ENABLED_RUNTIME_FAMILIES);
  return explicit.length > 0 ? explicit : [DEFAULT_RUNTIME_FAMILY];
}

function getEnabledSandboxProfiles(env = process.env, options = {}) {
  const runtimeFamily = normalizeRuntimeFamilyName(
    options.runtimeFamily || getDefaultRuntimeFamily(env)
  );
  if (runtimeFamily === "hermes") return ["standard"];

  const explicit = parseEnabledSandboxProfileList(env.ENABLED_SANDBOX_PROFILES);
  return explicit.length > 0 ? explicit : ["standard"];
}

function executionTargetsForRuntimeFamily(runtimeFamily) {
  return normalizeRuntimeFamilyName(runtimeFamily) === "hermes"
    ? ["docker", "proxmox"]
    : [...KNOWN_DEPLOY_TARGETS];
}

function supportedSandboxProfilesForDeployTarget(runtimeFamily) {
  return normalizeRuntimeFamilyName(runtimeFamily) === "hermes"
    ? ["standard"]
    : [...KNOWN_SANDBOX_PROFILES];
}

function getEnabledDeployTargets(env = process.env, options = {}) {
  const runtimeFamily = normalizeRuntimeFamilyName(
    options.runtimeFamily || getDefaultRuntimeFamily(env)
  );
  const supportedTargets = new Set(executionTargetsForRuntimeFamily(runtimeFamily));
  return getEnabledBackends(env).filter((target) => supportedTargets.has(target));
}

function hasAnyValue(env, keys) {
  return keys.some((key) => typeof env[key] === "string" && env[key].trim() !== "");
}

function baseDeployTargetIssue(deployTarget, env = process.env) {
  switch (normalizeDeployTargetName(deployTarget)) {
    case "k8s":
      if (env.KUBECONFIG || env.KUBERNETES_SERVICE_HOST) return null;
      return "Kubernetes execution target requires KUBECONFIG or in-cluster Kubernetes environment variables.";
    case "proxmox":
      if (!env.PROXMOX_API_URL || !env.PROXMOX_TOKEN_ID || !env.PROXMOX_TOKEN_SECRET) {
        return "Proxmox execution target requires PROXMOX_API_URL, PROXMOX_TOKEN_ID, and PROXMOX_TOKEN_SECRET.";
      }
      if (!env.PROXMOX_SSH_HOST || !env.PROXMOX_SSH_USER) {
        return "Proxmox execution target requires PROXMOX_SSH_HOST and PROXMOX_SSH_USER for pct bootstrap.";
      }
      if (
        !hasAnyValue(env, [
          "PROXMOX_SSH_PRIVATE_KEY",
          "PROXMOX_SSH_PRIVATE_KEY_PATH",
          "PROXMOX_SSH_PASSWORD",
        ])
      ) {
        return "Proxmox execution target requires SSH key or password authentication.";
      }
      return null;
    default:
      return null;
  }
}

function runtimeSelectionIssue(
  { runtimeFamily = DEFAULT_RUNTIME_FAMILY, deployTarget = "docker", sandboxProfile = "standard" } = {},
  env = process.env
) {
  const normalizedRuntimeFamily = normalizeRuntimeFamilyName(runtimeFamily);
  const normalizedDeployTarget = normalizeDeployTargetName(deployTarget);
  const normalizedSandboxProfile = normalizeSandboxProfileName(sandboxProfile);

  if (!executionTargetsForRuntimeFamily(normalizedRuntimeFamily).includes(normalizedDeployTarget)) {
    return `${getRuntimeFamilyMetadata(normalizedRuntimeFamily).label} does not support the ${getExecutionTargetMetadata(normalizedDeployTarget).label} execution target.`;
  }

  if (!supportedSandboxProfilesForDeployTarget(normalizedRuntimeFamily, normalizedDeployTarget).includes(normalizedSandboxProfile)) {
    return `${getRuntimeFamilyMetadata(normalizedRuntimeFamily).label} does not support the ${sandboxProfileLabel(normalizedSandboxProfile)} sandbox profile.`;
  }

  const targetIssue = baseDeployTargetIssue(normalizedDeployTarget, env);
  if (targetIssue) return targetIssue;

  if (normalizedDeployTarget === "proxmox" && normalizedRuntimeFamily === "hermes" && !env.PROXMOX_HERMES_TEMPLATE) {
    return "Hermes on Proxmox requires PROXMOX_HERMES_TEMPLATE.";
  }

  if (normalizedDeployTarget === "proxmox" && normalizedSandboxProfile === "nemoclaw" && !env.PROXMOX_NEMOCLAW_TEMPLATE) {
    return "NemoClaw on Proxmox requires PROXMOX_NEMOCLAW_TEMPLATE.";
  }

  return null;
}

function backendConfigIssue(backend, env = process.env) {
  return baseDeployTargetIssue(backend, env);
}

function getRuntimeSelectionStatus(selection = {}, env = process.env) {
  const runtimeFamily = normalizeRuntimeFamilyName(selection.runtimeFamily || selection.runtime_family);
  const deployTarget = normalizeDeployTargetName(
    selection.deployTarget || selection.deploy_target || selection.backend || selection.backend_type
  );
  const sandboxProfile = normalizeSandboxProfileName(
    selection.sandboxProfile || selection.sandbox_profile || selection.sandbox || selection.sandbox_type
  );
  const enabled =
    getEnabledRuntimeFamilies(env).includes(runtimeFamily) &&
    getEnabledDeployTargets(env, { runtimeFamily }).includes(deployTarget) &&
    getEnabledSandboxProfiles(env, { runtimeFamily }).includes(sandboxProfile);
  const issue = runtimeSelectionIssue({ runtimeFamily, deployTarget, sandboxProfile }, env);
  return {
    enabled,
    configured: issue == null,
    available: enabled && issue == null,
    issue,
    runtimeFamily,
    deployTarget,
    sandboxProfile,
  };
}

function firstAvailable(candidates) {
  return candidates.find((candidate) => candidate.available) || candidates.find((candidate) => candidate.enabled) || candidates[0] || null;
}

function getDefaultRuntimeFamily(env = process.env) {
  const enabledFamilies = getEnabledRuntimeFamilies(env);
  const available = enabledFamilies.find((runtimeFamily) =>
    getEnabledDeployTargets(env, { runtimeFamily }).some((deployTarget) =>
      getEnabledSandboxProfiles(env, { runtimeFamily }).some(
        (sandboxProfile) =>
          getRuntimeSelectionStatus({ runtimeFamily, deployTarget, sandboxProfile }, env).available
      )
    )
  );
  return available || enabledFamilies[0] || DEFAULT_RUNTIME_FAMILY;
}

function getDefaultDeployTarget(env = process.env, options = {}) {
  const runtimeFamily = normalizeRuntimeFamilyName(
    options.runtimeFamily || getDefaultRuntimeFamily(env)
  );
  const sandboxProfile =
    options.sandbox === "nemoclaw" || options.sandboxProfile === "nemoclaw"
      ? "nemoclaw"
      : "standard";
  const requested = options.backend ? normalizeDeployTargetName(options.backend) : null;
  const candidates = getEnabledDeployTargets(env, { runtimeFamily })
    .filter((deployTarget) => executionTargetsForRuntimeFamily(runtimeFamily).includes(deployTarget))
    .map((deployTarget) => ({
      deployTarget,
      ...getRuntimeSelectionStatus({ runtimeFamily, deployTarget, sandboxProfile }, env),
    }));
  if (requested && candidates.some((candidate) => candidate.deployTarget === requested)) {
    return requested;
  }
  return firstAvailable(candidates)?.deployTarget || "docker";
}

function getDefaultSandboxProfile(env = process.env, options = {}) {
  const runtimeFamily = normalizeRuntimeFamilyName(
    options.runtimeFamily || getDefaultRuntimeFamily(env)
  );
  const deployTarget = normalizeDeployTargetName(
    options.deployTarget || getDefaultDeployTarget(env, { runtimeFamily })
  );
  const requested =
    options.sandbox === "nemoclaw" || options.sandboxProfile === "nemoclaw"
      ? "nemoclaw"
      : null;
  const candidates = getEnabledSandboxProfiles(env, { runtimeFamily })
    .filter((sandboxProfile) =>
      supportedSandboxProfilesForDeployTarget(runtimeFamily, deployTarget).includes(sandboxProfile)
    )
    .map((sandboxProfile) => ({
      sandboxProfile,
      ...getRuntimeSelectionStatus({ runtimeFamily, deployTarget, sandboxProfile }, env),
    }));
  if (requested && candidates.some((candidate) => candidate.sandboxProfile === requested)) {
    return requested;
  }
  return firstAvailable(candidates)?.sandboxProfile || "standard";
}

function getDefaultBackend(env = process.env, options = {}) {
  return getDefaultDeployTarget(env, options);
}

function buildSandboxProfileOption(
  runtimeFamily,
  deployTarget,
  sandboxProfile,
  env = process.env
) {
  const normalizedRuntimeFamily = normalizeRuntimeFamilyName(runtimeFamily);
  const normalizedDeployTarget = normalizeDeployTargetName(deployTarget);
  const normalizedSandboxProfile = normalizeSandboxProfileName(sandboxProfile);
  const runtimeFamilyMetadata = getRuntimeFamilyMetadata(normalizedRuntimeFamily);
  const deployTargetMetadata = getExecutionTargetMetadata(normalizedDeployTarget);
  const sandboxMetadata = getSandboxProfileMetadata(normalizedSandboxProfile);
  const status = getRuntimeSelectionStatus(
    {
      runtimeFamily: normalizedRuntimeFamily,
      deployTarget: normalizedDeployTarget,
      sandboxProfile: normalizedSandboxProfile,
    },
    env
  );
  const maturityFields = buildMaturityFields(
    resolveMaturityTier({
      runtimeFamily: normalizedRuntimeFamily,
      deployTarget: normalizedDeployTarget,
      sandboxProfile: normalizedSandboxProfile,
    })
  );
  const fullLabel =
    normalizedSandboxProfile === "nemoclaw"
      ? `${runtimeFamilyMetadata.label} + ${deployTargetMetadata.label} + ${sandboxMetadata.label}`
      : `${runtimeFamilyMetadata.label} + ${deployTargetMetadata.label}`;

  return {
    ...sandboxMetadata,
    ...status,
    isDefault:
      normalizedDeployTarget === getDefaultDeployTarget(env, { runtimeFamily: normalizedRuntimeFamily }) &&
      normalizedSandboxProfile === getDefaultSandboxProfile(env, {
        runtimeFamily: normalizedRuntimeFamily,
        deployTarget: normalizedDeployTarget,
      }),
    runtimeFamily: normalizedRuntimeFamily,
    runtimeFamilyLabel: runtimeFamilyMetadata.label,
    deployTarget: normalizedDeployTarget,
    deployTargetLabel: deployTargetMetadata.label,
    sandboxProfile: normalizedSandboxProfile,
    sandboxProfileLabel: sandboxMetadata.label,
    fullLabel,
    legacyBackendId: normalizedDeployTarget,
    selectionId: `${normalizedRuntimeFamily}:${normalizedDeployTarget}:${normalizedSandboxProfile}`,
    selectionType: "sandbox_profile",
    models: normalizedSandboxProfile === "nemoclaw" ? [...NEMOCLAW_MODELS] : [],
    defaultModel:
      normalizedSandboxProfile === "nemoclaw"
        ? env.NEMOCLAW_DEFAULT_MODEL || NEMOCLAW_MODELS[0]
        : null,
    sandboxImage:
      normalizedSandboxProfile === "nemoclaw"
        ? env.NEMOCLAW_SANDBOX_IMAGE ||
          "ghcr.io/nvidia/openshell-community/sandboxes/openclaw"
        : null,
    availableForOnboarding: maturityFields.onboardingVisible && status.available,
    ...maturityFields,
  };
}

function buildExecutionTargetEntry(
  runtimeFamily,
  deployTarget,
  env = process.env
) {
  const normalizedRuntimeFamily = normalizeRuntimeFamilyName(runtimeFamily);
  const normalizedDeployTarget = normalizeDeployTargetName(deployTarget);
  const metadata = getExecutionTargetMetadata(normalizedDeployTarget);
  const runtimeFamilyMetadata = getRuntimeFamilyMetadata(normalizedRuntimeFamily);
  const supportedSandboxProfiles = supportedSandboxProfilesForDeployTarget(
    normalizedRuntimeFamily,
    normalizedDeployTarget
  );
  const sandboxProfiles = supportedSandboxProfiles.map((sandboxProfile) =>
    buildSandboxProfileOption(
      normalizedRuntimeFamily,
      normalizedDeployTarget,
      sandboxProfile,
      env
    )
  );
  const enabledSandboxProfiles = sandboxProfiles
    .filter((option) => option.enabled)
    .map((option) => option.id);
  const availableSandboxProfiles = sandboxProfiles
    .filter((option) => option.available)
    .map((option) => option.id);
  const selectableSandboxProfiles = sandboxProfiles.filter(
    (option) => option.enabled && option.availableForOnboarding
  );
  const defaultSelection =
    sandboxProfiles.find((option) => option.isDefault) ||
    sandboxProfiles.find((option) => option.available) ||
    sandboxProfiles.find((option) => option.enabled) ||
    sandboxProfiles[0];
  const enabled = sandboxProfiles.some((option) => option.enabled);
  const configured = sandboxProfiles.some((option) => option.configured);
  const available = sandboxProfiles.some((option) => option.available);
  const maturityFields = buildMaturityFields(
    defaultSelection?.maturityTier ||
      resolveMaturityTier({
        runtimeFamily: normalizedRuntimeFamily,
        deployTarget: normalizedDeployTarget,
        sandboxProfile: defaultSelection?.id || "standard",
      })
  );

  return {
    ...metadata,
    enabled,
    configured,
    available,
    issue:
      enabled && !available
        ? defaultSelection?.issue ||
          sandboxProfiles.find((option) => option.issue)?.issue ||
          null
        : null,
    isDefault:
      normalizedDeployTarget ===
      getDefaultDeployTarget(env, { runtimeFamily: normalizedRuntimeFamily }),
    runtimeFamily: runtimeFamilyMetadata.id,
    runtimeFamilyLabel: runtimeFamilyMetadata.label,
    defaultSandboxProfile: defaultSelection?.id || "standard",
    enabledSandboxProfiles,
    availableSandboxProfiles,
    supportedSandboxProfiles,
    supportsSandboxSelection: selectableSandboxProfiles.length > 1,
    sandboxProfiles,
    availableForOnboarding: selectableSandboxProfiles.length > 0,
    fullLabel:
      defaultSelection?.fullLabel ||
      `${runtimeFamilyMetadata.label} + ${metadata.label}`,
    ...maturityFields,
  };
}

function getExecutionTargetCatalog(env = process.env, options = {}) {
  const runtimeFamily = normalizeRuntimeFamilyName(
    options.runtimeFamily || getDefaultRuntimeFamily(env)
  );
  return executionTargetsForRuntimeFamily(runtimeFamily).map((deployTarget) =>
    buildExecutionTargetEntry(runtimeFamily, deployTarget, env)
  );
}

function getSandboxProfileCatalog(env = process.env, options = {}) {
  const runtimeFamily = normalizeRuntimeFamilyName(
    options.runtimeFamily || getDefaultRuntimeFamily(env)
  );
  const executionTargets = getExecutionTargetCatalog(env, { runtimeFamily });
  const supportedSandboxProfiles =
    runtimeFamily === "hermes" ? ["standard"] : [...KNOWN_SANDBOX_PROFILES];

  return supportedSandboxProfiles.map((sandboxProfile) => {
    const relatedTargets = executionTargets.filter((target) =>
      target.enabled &&
      target.sandboxProfiles.some(
        (option) => option.id === sandboxProfile && option.enabled
      )
    );
    const relatedOptions = relatedTargets.flatMap((target) =>
      target.sandboxProfiles.filter((option) => option.id === sandboxProfile)
    );
    const metadata = getSandboxProfileMetadata(sandboxProfile);
    const defaultOption =
      relatedOptions.find((option) => option.isDefault) ||
      relatedOptions.find((option) => option.available) ||
      relatedOptions.find((option) => option.enabled) ||
      null;
    const maturityFields = buildMaturityFields(
      defaultOption?.maturityTier ||
        (sandboxProfile === "nemoclaw" || runtimeFamily === "hermes" ? "experimental" : "ga")
    );

    return {
      ...metadata,
      enabled: relatedOptions.some((option) => option.enabled),
      configured: relatedOptions.some((option) => option.configured),
      available: relatedOptions.some((option) => option.available),
      issue:
        relatedOptions.length > 0 && !relatedOptions.some((option) => option.available)
          ? relatedOptions.find((option) => option.issue)?.issue || null
          : null,
      executionTargets: relatedTargets.map((target) => target.id),
      models: sandboxProfile === "nemoclaw" ? [...NEMOCLAW_MODELS] : [],
      defaultModel:
        sandboxProfile === "nemoclaw"
          ? env.NEMOCLAW_DEFAULT_MODEL || NEMOCLAW_MODELS[0]
          : null,
      sandboxImage:
        sandboxProfile === "nemoclaw"
          ? env.NEMOCLAW_SANDBOX_IMAGE ||
            "ghcr.io/nvidia/openshell-community/sandboxes/openclaw"
          : null,
      availableForOnboarding:
        maturityFields.onboardingVisible &&
        relatedOptions.some((option) => option.available),
      ...maturityFields,
    };
  });
}

function buildCatalogEntry(backendId, env = process.env, options = {}) {
  const deployTarget = normalizeDeployTargetName(backendId);
  const runtimeFamily = normalizeRuntimeFamilyName(
    options.runtimeFamily || getDefaultRuntimeFamily(env)
  );
  const target = buildExecutionTargetEntry(runtimeFamily, deployTarget, env);
  const metadata = getBackendMetadata(deployTarget);
  return {
    ...metadata,
    ...target,
    id: deployTarget,
    deployTarget,
    deployTargetLabel: target.label,
    sandboxProfile: target.defaultSandboxProfile,
    sandboxProfileLabel: sandboxProfileLabel(target.defaultSandboxProfile),
    selectionId: deployTarget,
    selectionLabel: target.fullLabel,
    selectionType: "deploy_target",
    legacyBackendId: deployTarget,
  };
}

function getBackendCatalog(env = process.env, options = {}) {
  const runtimeFamily = normalizeRuntimeFamilyName(
    options.runtimeFamily || getDefaultRuntimeFamily(env)
  );
  return KNOWN_DEPLOY_TARGETS.map((backendId) =>
    buildCatalogEntry(backendId, env, { runtimeFamily })
  );
}

function isBackendEnabled(backend, env = process.env) {
  return getEnabledBackends(env).includes(normalizeDeployTargetName(backend));
}

function getBackendStatus(backend, env = process.env) {
  return buildCatalogEntry(backend, env);
}

function buildBackendEnablementMessage(backendOrStatus, env = process.env) {
  const status =
    backendOrStatus && typeof backendOrStatus === "object"
      ? backendOrStatus
      : getBackendStatus(backendOrStatus, env);
  return (
    `${status.label} is not enabled. Enable it with ` +
    `ENABLED_BACKENDS=${status.id}.`
  );
}

function getRuntimeCatalog(env = process.env) {
  const defaultRuntimeFamily = getDefaultRuntimeFamily(env);

  return getEnabledRuntimeFamilies(env).map((runtimeFamily) => {
    const metadata = getRuntimeFamilyMetadata(runtimeFamily);
    const executionTargets = getExecutionTargetCatalog(env, { runtimeFamily });
    const sandboxProfiles = getSandboxProfileCatalog(env, { runtimeFamily });
    const enabled = executionTargets.some((target) => target.enabled);
    const configured = executionTargets.some((target) => target.configured);
    const available = executionTargets.some((target) => target.available);

    return {
      ...metadata,
      enabled,
      configured,
      available,
      isDefault: runtimeFamily === defaultRuntimeFamily,
      defaultDeployTarget: getDefaultDeployTarget(env, { runtimeFamily }),
      defaultSandboxProfile: getDefaultSandboxProfile(env, { runtimeFamily }),
      enabledDeployTargets: getEnabledDeployTargets(env, { runtimeFamily }),
      enabledSandboxProfiles: getEnabledSandboxProfiles(env, { runtimeFamily }),
      executionTargets,
      sandboxProfiles,
      availableForOnboarding: executionTargets.some(
        (target) => target.availableForOnboarding
      ),
      issue:
        enabled && !available
          ? executionTargets.find((target) => target.issue)?.issue || null
          : null,
    };
  });
}

module.exports = {
  DEFAULT_RUNTIME_FAMILY,
  KNOWN_RUNTIME_FAMILIES,
  KNOWN_BACKENDS,
  KNOWN_DEPLOY_TARGETS,
  KNOWN_SANDBOX_PROFILES,
  NEMOCLAW_MODELS,
  PROXMOX_RELEASE_BLOCKER_ISSUE,
  RUNTIME_FAMILY_METADATA,
  backendConfigIssue,
  backendForRuntimeSelection,
  buildBackendEnablementMessage,
  deployTargetForBackend,
  getBackendCatalog,
  getBackendMetadata,
  getBackendStatus,
  getDefaultBackend,
  getDefaultDeployTarget,
  getDefaultRuntimeFamily,
  getDefaultSandboxProfile,
  getEnabledBackends,
  getEnabledDeployTargets,
  getEnabledRuntimeFamilies,
  getEnabledSandboxProfiles,
  getExecutionTargetCatalog,
  getExecutionTargetMetadata,
  getRuntimeCatalog,
  getRuntimeFamilyMetadata,
  getRuntimeSelectionStatus,
  getSandboxProfileCatalog,
  getSandboxProfileMetadata,
  isBackendEnabled,
  isKnownBackend,
  isKnownDeployTarget,
  isKnownRuntimeFamily,
  isKnownSandboxProfile,
  normalizeBackendName,
  normalizeDeployTargetName,
  normalizeRuntimeFamilyName,
  normalizeSandboxProfileName,
  runtimeFamilyForBackend,
  runtimeSelectionIssue,
  sandboxForBackend,
  sandboxProfileLabel,
  selectionTypeForBackend,
};
