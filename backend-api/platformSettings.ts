// @ts-nocheck
const db = require("./db");

const DEFAULT_DEPLOYMENT_DEFAULTS = Object.freeze({
  vcpu: 1,
  ram_mb: 1024,
  disk_gb: 10,
});
const DEFAULT_SYSTEM_BANNER = Object.freeze({
  enabled: false,
  severity: "warning",
  title: "",
  message: "",
});
const DEFAULT_AGENT_HUB_SETTINGS = Object.freeze({
  defaultShareTarget: "both",
  url: "https://nora.solomontsao.com",
});
const SYSTEM_BANNER_SEVERITIES = new Set(["warning", "critical"]);
const AGENT_HUB_SHARE_TARGETS = new Set(["internal", "community", "both"]);

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  }
  return fallback;
}

function clampInteger(value, min, max = Number.MAX_SAFE_INTEGER) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUrl(value, fallback = DEFAULT_AGENT_HUB_SETTINGS.url) {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fallback;
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

function normalizeDeploymentDefaults(
  input = {},
  fallback = DEFAULT_DEPLOYMENT_DEFAULTS
) {
  return {
    vcpu: parseInteger(input.vcpu ?? input.default_vcpu) ?? fallback.vcpu,
    ram_mb:
      parseInteger(input.ram_mb ?? input.default_ram_mb) ?? fallback.ram_mb,
    disk_gb:
      parseInteger(input.disk_gb ?? input.default_disk_gb) ?? fallback.disk_gb,
  };
}

function clampDeploymentDefaults(defaults = {}, limits = {}) {
  const normalized = normalizeDeploymentDefaults(defaults);
  return {
    vcpu: clampInteger(normalized.vcpu, 1, limits.max_vcpu),
    ram_mb: clampInteger(normalized.ram_mb, 512, limits.max_ram_mb),
    disk_gb: clampInteger(normalized.disk_gb, 1, limits.max_disk_gb),
  };
}

function parseRequiredDeploymentDefaults(input = {}) {
  const next = {};
  for (const key of ["vcpu", "ram_mb", "disk_gb"]) {
    const value = parseInteger(input[key]);
    if (value == null) {
      const error = new Error(`${key} must be an integer`);
      error.statusCode = 400;
      throw error;
    }
    next[key] = value;
  }
  return next;
}

function isSystemBannerFeatureEnabled() {
  return parseBoolean(process.env.NORA_SYSTEM_BANNER_ENABLED, false);
}

function normalizeSystemBanner(
  input = {},
  fallback = DEFAULT_SYSTEM_BANNER
) {
  const requestedSeverity = normalizeText(
    input.system_banner_severity ?? input.severity
  ).toLowerCase();
  return {
    enabled: parseBoolean(
      input.system_banner_enabled ?? input.enabled,
      fallback.enabled
    ),
    severity: SYSTEM_BANNER_SEVERITIES.has(requestedSeverity)
      ? requestedSeverity
      : fallback.severity,
    title: normalizeText(input.system_banner_title ?? input.title),
    message: normalizeText(input.system_banner_message ?? input.message),
  };
}

function resolveSystemBannerPayload(input = {}) {
  const normalized = normalizeSystemBanner(input);
  const featureEnabled = isSystemBannerFeatureEnabled();
  const hasContent = Boolean(normalized.title && normalized.message);
  return {
    ...normalized,
    featureEnabled,
    active: featureEnabled && normalized.enabled && hasContent,
  };
}

function parseRequiredSystemBanner(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    const error = new Error("system banner payload must be an object");
    error.statusCode = 400;
    throw error;
  }

  const rawSeverity = normalizeText(input.severity).toLowerCase();
  if (rawSeverity && !SYSTEM_BANNER_SEVERITIES.has(rawSeverity)) {
    const error = new Error("severity must be warning or critical");
    error.statusCode = 400;
    throw error;
  }

  const title = normalizeText(input.title);
  const message = normalizeText(input.message);
  if (title.length > 120) {
    const error = new Error("title must be 120 characters or fewer");
    error.statusCode = 400;
    throw error;
  }
  if (message.length > 600) {
    const error = new Error("message must be 600 characters or fewer");
    error.statusCode = 400;
    throw error;
  }

  const next = {
    enabled: parseBoolean(input.enabled, false),
    severity: rawSeverity || DEFAULT_SYSTEM_BANNER.severity,
    title,
    message,
  };

  if (next.enabled && !next.title) {
    const error = new Error("title is required when the system banner is enabled");
    error.statusCode = 400;
    throw error;
  }
  if (next.enabled && !next.message) {
    const error = new Error("message is required when the system banner is enabled");
    error.statusCode = 400;
    throw error;
  }

  return next;
}

function normalizeAgentHubSettings(input = {}, fallback = DEFAULT_AGENT_HUB_SETTINGS) {
  const rawShareTarget = normalizeText(
    input.agent_hub_default_share_target ?? input.defaultShareTarget,
  ).toLowerCase();
  const defaultShareTarget = AGENT_HUB_SHARE_TARGETS.has(rawShareTarget)
    ? rawShareTarget
    : fallback.defaultShareTarget;

  return {
    defaultShareTarget,
    url: normalizeUrl(input.agent_hub_url ?? input.url, fallback.url),
  };
}

function resolveAgentHubSettingsPayload(settings) {
  return {
    ...settings,
    envUrl: normalizeUrl(process.env.NORA_AGENT_HUB_URL, settings.url),
  };
}

function parseRequiredAgentHubSettings(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    const error = new Error("agent hub settings payload must be an object");
    error.statusCode = 400;
    throw error;
  }

  const rawShareTarget = normalizeText(input.defaultShareTarget).toLowerCase();
  if (!AGENT_HUB_SHARE_TARGETS.has(rawShareTarget)) {
    const error = new Error("defaultShareTarget must be internal, community, or both");
    error.statusCode = 400;
    throw error;
  }

  const rawUrl = normalizeText(input.url);
  if (rawUrl.length > 500) {
    const error = new Error("url must be 500 characters or fewer");
    error.statusCode = 400;
    throw error;
  }

  const normalizedUrl = normalizeUrl(rawUrl, "");
  if (!normalizedUrl) {
    const error = new Error("url must be a valid http or https URL");
    error.statusCode = 400;
    throw error;
  }

  return {
    defaultShareTarget: rawShareTarget,
    url: normalizedUrl,
  };
}

async function getDeploymentDefaults() {
  const result = await db.query(
    `SELECT default_vcpu, default_ram_mb, default_disk_gb
       FROM platform_settings
      WHERE singleton = TRUE
      LIMIT 1`
  );
  return clampDeploymentDefaults(result.rows[0] || DEFAULT_DEPLOYMENT_DEFAULTS);
}

async function getSystemBanner() {
  const result = await db.query(
    `SELECT system_banner_enabled,
            system_banner_severity,
            system_banner_title,
            system_banner_message
       FROM platform_settings
      WHERE singleton = TRUE
      LIMIT 1`
  );

  return resolveSystemBannerPayload(
    result.rows[0] || DEFAULT_SYSTEM_BANNER
  );
}

async function getAgentHubSettings() {
  const result = await db.query(
    `SELECT agent_hub_default_share_target,
            agent_hub_url
       FROM platform_settings
      WHERE singleton = TRUE
      LIMIT 1`,
  );

  const settings = normalizeAgentHubSettings(result.rows[0] || DEFAULT_AGENT_HUB_SETTINGS);
  return resolveAgentHubSettingsPayload(settings);
}

async function updateDeploymentDefaults(defaults = {}, limits = {}) {
  const clamped = clampDeploymentDefaults(defaults, limits);
  const result = await db.query(
    `INSERT INTO platform_settings(
       singleton,
       default_vcpu,
       default_ram_mb,
       default_disk_gb,
       updated_at
     )
     VALUES(TRUE, $1, $2, $3, NOW())
     ON CONFLICT (singleton) DO UPDATE SET
       default_vcpu = EXCLUDED.default_vcpu,
       default_ram_mb = EXCLUDED.default_ram_mb,
       default_disk_gb = EXCLUDED.default_disk_gb,
       updated_at = NOW()
     RETURNING default_vcpu, default_ram_mb, default_disk_gb`,
    [clamped.vcpu, clamped.ram_mb, clamped.disk_gb]
  );

  return clampDeploymentDefaults(result.rows[0] || clamped, limits);
}

async function updateSystemBanner(banner = {}) {
  const next = parseRequiredSystemBanner(banner);
  const result = await db.query(
    `INSERT INTO platform_settings(
       singleton,
       system_banner_enabled,
       system_banner_severity,
       system_banner_title,
       system_banner_message,
       updated_at
     )
     VALUES(TRUE, $1, $2, $3, $4, NOW())
     ON CONFLICT (singleton) DO UPDATE SET
       system_banner_enabled = EXCLUDED.system_banner_enabled,
       system_banner_severity = EXCLUDED.system_banner_severity,
       system_banner_title = EXCLUDED.system_banner_title,
       system_banner_message = EXCLUDED.system_banner_message,
       updated_at = NOW()
     RETURNING system_banner_enabled,
               system_banner_severity,
               system_banner_title,
               system_banner_message`,
    [next.enabled, next.severity, next.title, next.message]
  );

  return resolveSystemBannerPayload(result.rows[0] || next);
}

async function updateAgentHubSettings(settings = {}) {
  const next = parseRequiredAgentHubSettings(settings);
  const result = await db.query(
    `INSERT INTO platform_settings(
       singleton,
       agent_hub_default_share_target,
       agent_hub_url,
       updated_at
     )
     VALUES(TRUE, $1, $2, NOW())
     ON CONFLICT (singleton) DO UPDATE SET
       agent_hub_default_share_target = EXCLUDED.agent_hub_default_share_target,
       agent_hub_url = EXCLUDED.agent_hub_url,
       updated_at = NOW()
     RETURNING agent_hub_default_share_target,
               agent_hub_url`,
    [next.defaultShareTarget, next.url],
  );

  return resolveAgentHubSettingsPayload(normalizeAgentHubSettings(result.rows[0] || next));
}

module.exports = {
  DEFAULT_DEPLOYMENT_DEFAULTS,
  DEFAULT_AGENT_HUB_SETTINGS,
  DEFAULT_SYSTEM_BANNER,
  AGENT_HUB_SHARE_TARGETS,
  SYSTEM_BANNER_SEVERITIES,
  clampDeploymentDefaults,
  getAgentHubSettings,
  getDeploymentDefaults,
  getSystemBanner,
  isSystemBannerFeatureEnabled,
  normalizeAgentHubSettings,
  normalizeDeploymentDefaults,
  normalizeSystemBanner,
  parseRequiredAgentHubSettings,
  parseRequiredDeploymentDefaults,
  parseRequiredSystemBanner,
  resolveSystemBannerPayload,
  updateAgentHubSettings,
  updateDeploymentDefaults,
  updateSystemBanner,
};
