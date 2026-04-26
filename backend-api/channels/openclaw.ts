// @ts-nocheck
const { rpcCall } = require("../gatewayProxy");
const { resolveAgentRuntimeFamily } = require("../agentRuntimeFields");
const { OPENCLAW_GATEWAY_PORT } = require("../../agent-runtime/lib/contracts");

const REDACTED_SECRET = "[REDACTED]";
const OPENCLAW_RUNTIME_READY_STATUSES = new Set(["running", "warning"]);
const OPENCLAW_QR_LOGIN_CHANNELS = new Set(["whatsapp"]);
const OPENCLAW_LOGOUT_CHANNELS = new Set(["telegram", "qqbot", "whatsapp"]);
const OPENCLAW_QR_LOGIN_PROVIDER_INSTALLS = Object.freeze({
  whatsapp: Object.freeze({
    packageSpec: "@openclaw/whatsapp",
  }),
});
const OPENCLAW_GATEWAY_RESTART_RETRY_DELAYS_MS = Object.freeze([0, 750, 1500, 3000, 5000, 8000]);
const OPENCLAW_SELECTION_LABELS = Object.freeze({
  feishu: "Feishu/Lark (飞书)",
  googlechat: "Google Chat (Chat API)",
  nostr: "Nostr",
  msteams: "Microsoft Teams (Bot Framework)",
  mattermost: "Mattermost (plugin)",
  "nextcloud-talk": "Nextcloud Talk (self-hosted)",
  matrix: "Matrix (plugin)",
  bluebubbles: "BlueBubbles (macOS app)",
  line: "LINE (Messaging API)",
  zalo: "Zalo (Bot API)",
  zalouser: "Zalo (Personal Account)",
  "synology-chat": "Synology Chat (Webhook)",
  tlon: "Tlon (Urbit)",
  discord: "Discord (Bot API)",
  imessage: "iMessage (imsg)",
  irc: "IRC (Server + Nick)",
  qqbot: "QQ Bot",
  signal: "Signal (signal-cli)",
  slack: "Slack",
  telegram: "Telegram (Bot API)",
  twitch: "Twitch (Chat)",
  whatsapp: "WhatsApp (QR link)",
});
const OPENCLAW_CHANNEL_SEEDS = Object.freeze({
  whatsapp: Object.freeze({
    enabled: true,
    accounts: Object.freeze({
      default: Object.freeze({ enabled: true }),
    }),
  }),
  zalouser: Object.freeze({ enabled: true }),
});
const SECRET_LIKE_PATH_RE = /(^|\.)(token|secret|password|credential|auth|key)(\.|$)/i;
const MAX_SCHEMA_FIELD_DEPTH = 3;

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function redactSensitiveConfig(value, path = "") {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      redactSensitiveConfig(entry, path ? `${path}.${index}` : String(index)),
    );
  }

  if (isPlainObject(value)) {
    const redacted = {};
    for (const [key, nextValue] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      redacted[key] = redactSensitiveConfig(nextValue, nextPath);
    }
    return redacted;
  }

  if (typeof value === "string" && value && SECRET_LIKE_PATH_RE.test(path)) {
    return REDACTED_SECRET;
  }

  return value;
}

function restoreRedactedConfigValue(nextValue, currentValue) {
  if (nextValue === REDACTED_SECRET) {
    return currentValue;
  }

  if (Array.isArray(nextValue)) {
    const currentItems = Array.isArray(currentValue) ? currentValue : [];
    return nextValue.map((entry, index) => restoreRedactedConfigValue(entry, currentItems[index]));
  }

  if (isPlainObject(nextValue)) {
    const currentObject = isPlainObject(currentValue) ? currentValue : {};
    return Object.fromEntries(
      Object.entries(nextValue).map(([key, value]) => [
        key,
        restoreRedactedConfigValue(value, currentObject[key]),
      ]),
    );
  }

  return nextValue;
}

function deepMerge(target, patch) {
  if (!isPlainObject(patch)) {
    return Array.isArray(patch) ? cloneJson(patch) : patch;
  }

  const next = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      next[key] = cloneJson(value);
      continue;
    }
    if (isPlainObject(value)) {
      next[key] = deepMerge(next[key], value);
      continue;
    }
    next[key] = value;
  }
  return next;
}

function normalizeSchemaType(value) {
  if (Array.isArray(value)) {
    return value.find((entry) => typeof entry === "string" && entry !== "null") || null;
  }
  return typeof value === "string" ? value : null;
}

function humanizeChannelId(channelId) {
  return (
    String(channelId || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase()) || "Channel"
  );
}

function buildSelectionLabel(channelId, meta = {}) {
  return (
    OPENCLAW_SELECTION_LABELS[channelId] ||
    meta.selectionLabel ||
    meta.detailLabel ||
    meta.label ||
    humanizeChannelId(channelId)
  );
}

function buildTypeTitle(channelId, meta = {}) {
  return meta.label || humanizeChannelId(channelId);
}

function serializeTypeMeta(channelId, meta = {}, extras = {}) {
  return {
    id: channelId,
    type: channelId,
    label: buildSelectionLabel(channelId, meta),
    title: buildTypeTitle(channelId, meta),
    detailLabel: meta.detailLabel || buildSelectionLabel(channelId, meta),
    systemImage: meta.systemImage || null,
    actions: {
      canQrLogin: OPENCLAW_QR_LOGIN_CHANNELS.has(channelId),
      canLogout: OPENCLAW_LOGOUT_CHANNELS.has(channelId),
    },
    ...extras,
  };
}

function assertOpenClawAgentReady(agent) {
  if (resolveAgentRuntimeFamily(agent) !== "openclaw") {
    throw createHttpError(409, "This agent does not use the OpenClaw runtime.");
  }
  if (
    !OPENCLAW_RUNTIME_READY_STATUSES.has(
      String(agent?.status || "")
        .trim()
        .toLowerCase(),
    )
  ) {
    throw createHttpError(
      409,
      `OpenClaw channels are unavailable while the agent is ${agent?.status || "not ready"}.`,
    );
  }
}

function toGatewayError(error, fallbackMessage) {
  if (error?.statusCode) return error;

  const message = error?.message || fallbackMessage || "OpenClaw channel request failed";
  const normalized = String(error?.code || "")
    .trim()
    .toUpperCase();

  if (normalized === "INVALID_REQUEST") {
    return createHttpError(400, message);
  }

  if (normalized === "GATEWAY_ERROR") {
    return createHttpError(502, message);
  }

  return createHttpError(502, message);
}

async function callGateway(agent, method, params = {}, timeout) {
  assertOpenClawAgentReady(agent);
  try {
    return await rpcCall(agent, method, params, timeout);
  } catch (error) {
    throw toGatewayError(error, `OpenClaw ${method} failed`);
  }
}

function isWebLoginProviderUnavailableError(error) {
  return /web login provider is not available/i.test(String(error?.message || ""));
}

function isTransientGatewayRestartError(error) {
  const statusCode = Number(error?.statusCode || 0);
  if (statusCode >= 500) return true;

  return /gateway|websocket|socket|connection|not connected|econnrefused|closed|unavailable|timed out/i.test(
    String(error?.message || ""),
  );
}

function sleep(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildOpenClawPluginInstallCommand(channelId) {
  const install = OPENCLAW_QR_LOGIN_PROVIDER_INSTALLS[channelId];
  if (!install) return "";

  return [
    "set -eu",
    'OPENCLAW_BIN="${OPENCLAW_CLI_PATH:-/usr/local/bin/openclaw}"',
    'if [ ! -x "$OPENCLAW_BIN" ]; then OPENCLAW_BIN="$(command -v openclaw 2>/dev/null || true)"; fi',
    '[ -n "$OPENCLAW_BIN" ] && [ -x "$OPENCLAW_BIN" ]',
    `OPENCLAW_GATEWAY_PORT="\${OPENCLAW_GATEWAY_PORT:-${OPENCLAW_GATEWAY_PORT}}"`,
    "export OPENCLAW_GATEWAY_PORT",
    `"$OPENCLAW_BIN" plugins install ${install.packageSpec} --force`,
    'if ! "$OPENCLAW_BIN" gateway restart; then',
    '  printf "%s\\n" "OpenClaw plugin install completed, but gateway restart did not complete through the CLI."',
    "fi",
  ].join("\n");
}

function evictGatewayConnection(agent) {
  try {
    const { evictConnection } = require("../gatewayProxy");
    if (typeof evictConnection === "function") {
      evictConnection(agent);
    }
  } catch {
    // Gateway proxy eviction is a best-effort recovery step after restart.
  }
}

async function installOpenClawLoginProvider(agent, channelId) {
  const install = OPENCLAW_QR_LOGIN_PROVIDER_INSTALLS[channelId];
  if (!install) return false;

  const { runContainerCommand } = require("../authSync");
  const command = buildOpenClawPluginInstallCommand(channelId);
  try {
    await runContainerCommand(agent, command, { timeout: 240000 });
    evictGatewayConnection(agent);
    return true;
  } catch (error) {
    throw createHttpError(
      502,
      `OpenClaw could not install the ${buildSelectionLabel(channelId)} plugin (${install.packageSpec}): ${error?.message || "plugin install failed"}`,
    );
  }
}

async function startLoginViaGateway(agent, options = {}) {
  return await callGateway(agent, "web.login.start", {
    ...(typeof options?.force === "boolean" ? { force: options.force } : {}),
    ...(typeof options?.accountId === "string" && options.accountId.trim()
      ? { accountId: options.accountId.trim() }
      : {}),
    ...(typeof options?.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {}),
  });
}

async function startLoginWithGatewayRetry(
  agent,
  channelId,
  options = {},
  { retryProviderUnavailable = false } = {},
) {
  let lastError = null;
  for (const delayMs of OPENCLAW_GATEWAY_RESTART_RETRY_DELAYS_MS) {
    await sleep(delayMs);
    try {
      return await startLoginViaGateway(agent, options);
    } catch (error) {
      lastError = error;
      if (
        !(retryProviderUnavailable && isWebLoginProviderUnavailableError(error)) &&
        !isTransientGatewayRestartError(error)
      ) {
        throw error;
      }
    }
  }

  if (isWebLoginProviderUnavailableError(lastError)) {
    throw createHttpError(
      409,
      `${buildSelectionLabel(channelId)} was installed, but the OpenClaw gateway has not loaded the QR login provider yet. Restart the agent and try connecting again.`,
    );
  }

  throw lastError || createHttpError(502, "OpenClaw QR login did not become available.");
}

function getConfigChannels(snapshot = {}) {
  return isPlainObject(snapshot?.config?.channels) ? snapshot.config.channels : {};
}

function normalizeChannelId(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeLabel(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mergeTypeMeta(target, channelId, patch = {}) {
  const normalizedId = normalizeChannelId(channelId);
  if (!normalizedId) return;

  const current = target.get(normalizedId) || { id: normalizedId };
  const next = { ...current, id: normalizedId };

  for (const [key, value] of Object.entries(patch)) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    next[key] = value;
  }

  target.set(normalizedId, next);
}

function buildTypeMetaById(status = {}) {
  const metaById = new Map();
  const entries = Array.isArray(status?.channelMeta) ? status.channelMeta : [];

  for (const entry of entries) {
    mergeTypeMeta(metaById, entry?.id || entry?.type, entry);
  }

  for (const [channelId, label] of Object.entries(status?.channelLabels || {})) {
    mergeTypeMeta(metaById, channelId, {
      label: normalizeLabel(label),
    });
  }

  for (const [channelId, detailLabel] of Object.entries(status?.channelDetailLabels || {})) {
    mergeTypeMeta(metaById, channelId, {
      detailLabel: normalizeLabel(detailLabel),
    });
  }

  for (const [channelId, systemImage] of Object.entries(status?.channelSystemImages || {})) {
    mergeTypeMeta(metaById, channelId, {
      systemImage: normalizeLabel(systemImage),
    });
  }

  return metaById;
}

function extractSchemaChannelEntries(lookup = {}) {
  const children = Array.isArray(lookup?.children) ? lookup.children : [];
  return children
    .map((child) => {
      const id = normalizeChannelId(child?.key);
      if (!id || id === "*") return null;
      return {
        id,
        label: normalizeLabel(child?.hint?.label),
        detailLabel: normalizeLabel(child?.hint?.label),
        description: normalizeLabel(child?.hint?.help),
      };
    })
    .filter(Boolean);
}

function buildAvailableChannelIds(status = {}, configSnapshot = {}) {
  const known = new Set();

  for (const rawId of Array.isArray(status?.channelOrder) ? status.channelOrder : []) {
    const id = normalizeChannelId(rawId);
    if (id) known.add(id);
  }

  for (const id of Object.keys(status?.channels || {})) {
    const normalizedId = normalizeChannelId(id);
    if (normalizedId) known.add(normalizedId);
  }

  for (const id of Object.keys(status?.channelAccounts || {})) {
    const normalizedId = normalizeChannelId(id);
    if (normalizedId) known.add(normalizedId);
  }

  for (const id of Object.keys(status?.channelDefaultAccountId || {})) {
    const normalizedId = normalizeChannelId(id);
    if (normalizedId) known.add(normalizedId);
  }

  for (const id of buildTypeMetaById(status).keys()) {
    const normalizedId = normalizeChannelId(id);
    if (normalizedId) known.add(normalizedId);
  }

  for (const id of Object.keys(getConfigChannels(configSnapshot))) {
    const normalizedId = normalizeChannelId(id);
    if (normalizedId) known.add(normalizedId);
  }
  return Array.from(known);
}

function mergeSchemaEntriesIntoTypeMeta(metaById, schemaEntries = []) {
  for (const entry of schemaEntries) {
    mergeTypeMeta(metaById, entry.id, entry);
  }
}

function buildChannelState({ configured, connected, running, lastError }) {
  if (lastError) return "error";
  if (connected) return "connected";
  if (running) return "running";
  if (configured) return "configured";
  return "not_configured";
}

function serializeAccount(account = {}) {
  return {
    accountId: account.accountId || "default",
    name: account.name || null,
    enabled: account.enabled !== false,
    configured: account.configured === true,
    linked: account.linked === true,
    running: account.running === true,
    connected: account.connected === true,
    healthState: account.healthState || null,
    lastError: account.lastError || null,
    lastConnectedAt: account.lastConnectedAt || null,
    lastProbeAt: account.lastProbeAt || null,
  };
}

function serializeChannelEntry(channelId, meta, status = {}, configSnapshot = {}) {
  const configChannels = getConfigChannels(configSnapshot);
  const channelConfig = isPlainObject(configChannels[channelId]) ? configChannels[channelId] : {};
  const summary = isPlainObject(status?.channels?.[channelId]) ? status.channels[channelId] : {};
  const accounts = Array.isArray(status?.channelAccounts?.[channelId])
    ? status.channelAccounts[channelId].map(serializeAccount)
    : [];
  const defaultAccountId = status?.channelDefaultAccountId?.[channelId] || "default";
  const primaryAccount =
    accounts.find((account) => account.accountId === defaultAccountId) || accounts[0] || null;
  const configured =
    summary.configured === true ||
    primaryAccount?.configured === true ||
    Object.keys(channelConfig).length > 0;
  const connected = primaryAccount?.connected === true;
  const running = primaryAccount?.running === true;
  const enabled =
    typeof channelConfig.enabled === "boolean"
      ? channelConfig.enabled
      : typeof primaryAccount?.enabled === "boolean"
        ? primaryAccount.enabled
        : configured;
  const lastError = primaryAccount?.lastError || summary.lastError || null;

  return {
    id: channelId,
    type: channelId,
    name: buildTypeTitle(channelId, meta),
    selectionLabel: buildSelectionLabel(channelId, meta),
    detailLabel: meta?.detailLabel || buildSelectionLabel(channelId, meta),
    systemImage: meta?.systemImage || null,
    configured,
    enabled,
    readOnly: false,
    defaultAccountId,
    accounts,
    accountCount: accounts.length,
    config: redactSensitiveConfig(channelConfig),
    status: {
      state: buildChannelState({ configured, connected, running, lastError }),
      connected,
      running,
      healthState: primaryAccount?.healthState || null,
      lastError,
      lastConnectedAt: primaryAccount?.lastConnectedAt || null,
      lastProbeAt: primaryAccount?.lastProbeAt || null,
    },
    actions: {
      canEdit: true,
      canToggle: true,
      canDelete: true,
      canTest: false,
      canViewMessages: false,
      canQrLogin: OPENCLAW_QR_LOGIN_CHANNELS.has(channelId),
      canLogout: OPENCLAW_LOGOUT_CHANNELS.has(channelId),
    },
  };
}

function shouldIncludeChannel(channel = {}) {
  return (
    channel.configured ||
    channel.enabled ||
    channel.accountCount > 0 ||
    Boolean(channel.status?.lastError) ||
    channel.status?.state === "connected" ||
    channel.status?.state === "running"
  );
}

async function readChannelSnapshot(agent) {
  const [status, configSnapshot] = await Promise.all([
    callGateway(agent, "channels.status"),
    callGateway(agent, "config.get"),
  ]);

  return { status, configSnapshot };
}

function requireSnapshotHash(snapshot = {}) {
  const hash = typeof snapshot?.hash === "string" ? snapshot.hash.trim() : "";
  if (!hash) {
    throw createHttpError(
      409,
      "OpenClaw config hash is unavailable. Reload the channel tab and retry.",
    );
  }
  return hash;
}

async function writeConfigPatch(agent, snapshot, patch) {
  const baseHash = requireSnapshotHash(snapshot);
  return await callGateway(agent, "config.patch", {
    raw: JSON.stringify(patch),
    baseHash,
  });
}

async function safeLookup(agent, path) {
  try {
    return await callGateway(agent, "config.schema.lookup", { path });
  } catch (error) {
    if (error?.statusCode === 400 && /path not found/i.test(String(error.message || ""))) {
      return null;
    }
    throw error;
  }
}

async function loadSchemaChannelEntries(agent) {
  const lookup = await safeLookup(agent, "channels");
  return extractSchemaChannelEntries(lookup);
}

function relativeFieldKey(basePath, fullPath) {
  if (!fullPath.startsWith(`${basePath}.`)) return fullPath;
  return fullPath.slice(basePath.length + 1);
}

function resolveFieldOptions(schema = {}) {
  if (Array.isArray(schema.enum)) {
    return schema.enum.map((value) => ({ label: String(value), value }));
  }
  if (Object.prototype.hasOwnProperty.call(schema, "const")) {
    return [{ label: String(schema.const), value: schema.const }];
  }
  return [];
}

function buildFieldDefinition(basePath, child, lookup) {
  const schema = isPlainObject(lookup?.schema) ? lookup.schema : {};
  const options = resolveFieldOptions(schema);
  const key = relativeFieldKey(basePath, child.path);
  const resolvedType = normalizeSchemaType(schema.type || child.type);
  const sensitive = child?.hint?.sensitive === true || SECRET_LIKE_PATH_RE.test(key);
  const label = child?.hint?.label || key.split(".").slice(-1)[0];
  const help = child?.hint?.help || "";
  const placeholder = child?.hint?.placeholder || "";

  if (options.length > 0) {
    return {
      key,
      label,
      help,
      placeholder,
      required: child.required === true,
      type: "select",
      options,
      order: Number.isInteger(child?.hint?.order) ? child.hint.order : 9999,
    };
  }

  if (resolvedType === "array") {
    const item = Array.isArray(lookup?.children)
      ? lookup.children.find((entry) => entry.key === "*")
      : null;
    const itemType = normalizeSchemaType(item?.type);
    if (
      item &&
      !item.hasChildren &&
      (!itemType || itemType === "string" || itemType === "integer" || itemType === "number")
    ) {
      return {
        key,
        label,
        help,
        placeholder,
        required: child.required === true,
        type: "list",
        itemType: itemType || "string",
        order: Number.isInteger(child?.hint?.order) ? child.hint.order : 9999,
      };
    }
    return null;
  }

  if (resolvedType === "boolean") {
    return {
      key,
      label,
      help,
      placeholder,
      required: child.required === true,
      type: "boolean",
      order: Number.isInteger(child?.hint?.order) ? child.hint.order : 9999,
    };
  }

  if (resolvedType === "integer") {
    return {
      key,
      label,
      help,
      placeholder,
      required: child.required === true,
      type: "integer",
      order: Number.isInteger(child?.hint?.order) ? child.hint.order : 9999,
    };
  }

  if (resolvedType === "number") {
    return {
      key,
      label,
      help,
      placeholder,
      required: child.required === true,
      type: "number",
      order: Number.isInteger(child?.hint?.order) ? child.hint.order : 9999,
    };
  }

  if (resolvedType === "object") {
    return null;
  }

  const format = typeof schema.format === "string" ? schema.format : "";
  const inputType =
    format === "url" ? "url" : format === "email" ? "email" : sensitive ? "password" : "text";

  if (resolvedType == null && child.hasChildren) {
    return null;
  }

  return {
    key,
    label,
    help,
    placeholder,
    required: child.required === true,
    type: inputType,
    order: Number.isInteger(child?.hint?.order) ? child.hint.order : 9999,
  };
}

async function collectConfigFields(agent, basePath, lookup, depth = 0, state = null) {
  const nextState = state || { fields: [], hasComplexFields: false };
  const children = Array.isArray(lookup?.children) ? lookup.children : [];

  for (const child of children) {
    if (!child?.path) continue;
    if (child.key === "*") {
      nextState.hasComplexFields = true;
      continue;
    }

    const childLookup = await safeLookup(agent, child.path);
    if (!childLookup) {
      nextState.hasComplexFields = true;
      continue;
    }

    const field = buildFieldDefinition(basePath, child, childLookup);
    if (field) {
      nextState.fields.push(field);
      continue;
    }

    if (child.hasChildren && depth < MAX_SCHEMA_FIELD_DEPTH) {
      const before = nextState.fields.length;
      await collectConfigFields(agent, basePath, childLookup, depth + 1, nextState);
      if (nextState.fields.length === before) {
        nextState.hasComplexFields = true;
      }
      continue;
    }

    nextState.hasComplexFields = true;
  }

  return nextState;
}

function sortConfigFields(fields = []) {
  return [...fields].sort((left, right) => {
    const leftOrder = Number.isInteger(left?.order) ? left.order : 9999;
    const rightOrder = Number.isInteger(right?.order) ? right.order : 9999;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left?.label || left?.key || "").localeCompare(
      String(right?.label || right?.key || ""),
    );
  });
}

function requireSupportedQrChannel(channelId) {
  if (!OPENCLAW_QR_LOGIN_CHANNELS.has(channelId)) {
    throw createHttpError(
      409,
      `${buildSelectionLabel(channelId)} does not expose QR login through this OpenClaw gateway build.`,
    );
  }
}

function requireSupportedLogoutChannel(channelId) {
  if (!OPENCLAW_LOGOUT_CHANNELS.has(channelId)) {
    throw createHttpError(
      409,
      `${buildSelectionLabel(channelId)} does not expose a Nora logout action yet.`,
    );
  }
}

function buildSeededChannelConfig(channelId, currentConfig = {}) {
  const seeded = deepMerge(
    OPENCLAW_CHANNEL_SEEDS[channelId] ? cloneJson(OPENCLAW_CHANNEL_SEEDS[channelId]) : {},
    isPlainObject(currentConfig) ? currentConfig : {},
  );

  if (typeof seeded.enabled !== "boolean") {
    seeded.enabled = true;
  }

  return seeded;
}

async function ensureKnownChannel(agent, channelId) {
  const snapshot = await readChannelSnapshot(agent);
  let ids = buildAvailableChannelIds(snapshot.status, snapshot.configSnapshot);

  if (!ids.includes(channelId)) {
    const schemaEntries = await loadSchemaChannelEntries(agent);
    ids = Array.from(new Set([...ids, ...schemaEntries.map((entry) => entry.id)]));
    if (ids.includes(channelId)) {
      snapshot.schemaEntries = schemaEntries;
    }
  }

  if (!ids.includes(channelId)) {
    throw createHttpError(404, `Unknown OpenClaw channel type: ${channelId}`);
  }
  return snapshot;
}

async function listOpenClawChannels(agent) {
  const { status, configSnapshot } = await readChannelSnapshot(agent);
  const typeMetaById = buildTypeMetaById(status);
  let channelIds = buildAvailableChannelIds(status, configSnapshot);

  if (channelIds.length === 0) {
    const schemaEntries = await loadSchemaChannelEntries(agent);
    mergeSchemaEntriesIntoTypeMeta(typeMetaById, schemaEntries);
    channelIds = Array.from(new Set(schemaEntries.map((entry) => entry.id)));
  }

  const availableTypes = channelIds.map((channelId) =>
    serializeTypeMeta(channelId, typeMetaById.get(channelId)),
  );
  const channels = channelIds
    .map((channelId) =>
      serializeChannelEntry(channelId, typeMetaById.get(channelId), status, configSnapshot),
    )
    .filter(shouldIncludeChannel);

  return {
    runtime: "openclaw",
    title: "OpenClaw Channels",
    description:
      "Nora manages these channels through the underlying OpenClaw gateway and config API.",
    capabilities: {
      supportsTesting: false,
      supportsMessageHistory: false,
      supportsArbitraryNames: false,
      supportsLazyTypeDefinitions: true,
    },
    channels,
    availableTypes,
  };
}

async function getOpenClawChannelType(agent, channelId) {
  const { status, schemaEntries } = await ensureKnownChannel(agent, channelId);
  const typeMetaById = buildTypeMetaById(status);
  if (Array.isArray(schemaEntries) && schemaEntries.length > 0) {
    mergeSchemaEntriesIntoTypeMeta(typeMetaById, schemaEntries);
  }
  const meta = typeMetaById.get(channelId) || {};
  const basePath = `channels.${channelId}`;
  const lookup = await safeLookup(agent, basePath);
  const fieldState = lookup
    ? await collectConfigFields(agent, basePath, lookup)
    : { fields: [], hasComplexFields: true };

  return serializeTypeMeta(channelId, meta, {
    description: lookup?.hint?.help || "",
    configFields: sortConfigFields(fieldState.fields),
    hasComplexFields: fieldState.hasComplexFields,
  });
}

async function saveOpenClawChannel(agent, channelId, input = {}, { create = false } = {}) {
  const { configSnapshot } = await ensureKnownChannel(agent, channelId);
  const snapshot = configSnapshot;
  const currentConfig = getConfigChannels(snapshot)[channelId];
  let nextConfig = create
    ? buildSeededChannelConfig(channelId, currentConfig)
    : buildSeededChannelConfig(channelId, currentConfig);

  if (isPlainObject(input?.config)) {
    nextConfig = deepMerge(nextConfig, restoreRedactedConfigValue(input.config, currentConfig));
  }

  if (typeof input?.enabled === "boolean") {
    nextConfig.enabled = input.enabled;
  }

  const result = await writeConfigPatch(agent, snapshot, {
    channels: {
      [channelId]: nextConfig,
    },
  });

  return {
    success: true,
    channel: channelId,
    restart: result?.restart || null,
  };
}

async function connectOpenClawChannel(agent, channelId, options = {}) {
  requireSupportedQrChannel(channelId);

  const saveResult = await saveOpenClawChannel(
    agent,
    channelId,
    {
      enabled: true,
      ...(isPlainObject(options?.config) ? { config: options.config } : {}),
    },
    { create: true },
  );
  if (saveResult?.restart) {
    evictGatewayConnection(agent);
  }
  const loginResult = await startOpenClawChannelLogin(agent, channelId, options);

  return {
    success: true,
    channel: channelId,
    restart: saveResult?.restart || null,
    login: loginResult,
    ...loginResult,
  };
}

async function deleteOpenClawChannel(agent, channelId) {
  const { configSnapshot } = await ensureKnownChannel(agent, channelId);
  const snapshot = configSnapshot;
  const result = await writeConfigPatch(agent, snapshot, {
    channels: {
      [channelId]: null,
    },
  });

  return {
    success: true,
    channel: channelId,
    restart: result?.restart || null,
  };
}

async function startOpenClawChannelLogin(agent, channelId, options = {}) {
  requireSupportedQrChannel(channelId);
  try {
    return await startLoginWithGatewayRetry(agent, channelId, options);
  } catch (error) {
    if (!isWebLoginProviderUnavailableError(error)) {
      throw error;
    }
    const installed = await installOpenClawLoginProvider(agent, channelId);
    if (!installed) {
      throw error;
    }
    return await startLoginWithGatewayRetry(agent, channelId, options, {
      retryProviderUnavailable: true,
    });
  }
}

async function waitOpenClawChannelLogin(agent, channelId, options = {}) {
  requireSupportedQrChannel(channelId);
  return await callGateway(agent, "web.login.wait", {
    ...(typeof options?.accountId === "string" && options.accountId.trim()
      ? { accountId: options.accountId.trim() }
      : {}),
    ...(typeof options?.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {}),
  });
}

async function logoutOpenClawChannel(agent, channelId, options = {}) {
  requireSupportedLogoutChannel(channelId);
  return await callGateway(agent, "channels.logout", {
    channel: channelId,
    ...(typeof options?.accountId === "string" && options.accountId.trim()
      ? { accountId: options.accountId.trim() }
      : {}),
  });
}

module.exports = {
  connectOpenClawChannel,
  getOpenClawChannelType,
  listOpenClawChannels,
  saveOpenClawChannel,
  deleteOpenClawChannel,
  startOpenClawChannelLogin,
  waitOpenClawChannelLogin,
  logoutOpenClawChannel,
};
