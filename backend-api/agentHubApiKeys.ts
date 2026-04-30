// @ts-nocheck
const crypto = require("crypto");
const db = require("./db");

const KEY_PREFIX = "nora_hub_";
const KEY_STATUS_ACTIVE = "active";
const KEY_STATUS_REVOKED = "revoked";

function normalizeLabel(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return (normalized || "Nora installation").slice(0, 120);
}

function generateRawKey() {
  return `${KEY_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

function hashApiKey(rawKey) {
  return crypto.createHash("sha256").update(String(rawKey || ""), "utf8").digest("hex");
}

function keyPrefix(rawKey) {
  return String(rawKey || "").slice(0, 18);
}

function maskKeyPrefix(prefix) {
  const normalized = String(prefix || "").trim();
  return normalized ? `${normalized}...` : "";
}

function serializeApiKey(row = {}) {
  return {
    id: row.id,
    label: row.label,
    keyPrefix: row.key_prefix,
    maskedKey: maskKeyPrefix(row.key_prefix),
    status: row.status || KEY_STATUS_ACTIVE,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

function extractApiKey(req) {
  const explicitHeader =
    req.headers["x-agent-hub-api-key"] || req.headers["x-api-key"] || req.headers["api-key"];
  if (explicitHeader) return String(explicitHeader).trim();

  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const [scheme, token] = String(authHeader).split(" ");
  if (scheme === "Bearer" && token) return token.trim();
  return "";
}

async function createApiKey(userId, label) {
  if (!userId) {
    const error = new Error("userId is required");
    error.statusCode = 400;
    throw error;
  }

  const rawKey = generateRawKey();
  const result = await db.query(
    `INSERT INTO agent_hub_api_keys(user_id, label, key_hash, key_prefix, status)
     VALUES($1, $2, $3, $4, $5)
     RETURNING id, label, key_prefix, status, created_at, last_used_at, revoked_at`,
    [userId, normalizeLabel(label), hashApiKey(rawKey), keyPrefix(rawKey), KEY_STATUS_ACTIVE],
  );

  return {
    ...serializeApiKey(result.rows[0]),
    apiKey: rawKey,
  };
}

async function listApiKeys(userId) {
  const result = await db.query(
    `SELECT id, label, key_prefix, status, created_at, last_used_at, revoked_at
       FROM agent_hub_api_keys
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map(serializeApiKey);
}

async function revokeApiKey(keyId, userId) {
  const result = await db.query(
    `UPDATE agent_hub_api_keys
        SET status = $1,
            revoked_at = COALESCE(revoked_at, NOW())
      WHERE id = $2
        AND user_id = $3
      RETURNING id, label, key_prefix, status, created_at, last_used_at, revoked_at`,
    [KEY_STATUS_REVOKED, keyId, userId],
  );
  return result.rows[0] ? serializeApiKey(result.rows[0]) : null;
}

async function verifyApiKey(rawKey) {
  const normalized = String(rawKey || "").trim();
  if (!normalized) return null;

  const result = await db.query(
    `SELECT k.id,
            k.user_id,
            k.label,
            k.key_prefix,
            k.status,
            k.created_at,
            k.last_used_at,
            k.revoked_at,
            u.email,
            u.name,
            u.avatar,
            u.role
       FROM agent_hub_api_keys k
       JOIN users u ON u.id = k.user_id
      WHERE k.key_hash = $1
        AND k.status = $2
        AND k.revoked_at IS NULL
      LIMIT 1`,
    [hashApiKey(normalized), KEY_STATUS_ACTIVE],
  );

  const row = result.rows[0];
  if (!row) return null;

  await db.query("UPDATE agent_hub_api_keys SET last_used_at = NOW() WHERE id = $1", [row.id]);
  return {
    key: serializeApiKey(row),
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      avatar: row.avatar,
      role: row.role,
    },
  };
}

async function requireAgentHubApiKey(req, res, next) {
  try {
    const rawKey = extractApiKey(req);
    if (!rawKey) {
      return res.status(401).json({
        error: "Agent Hub API key required",
        code: "agent_hub_api_key_required",
      });
    }

    const verified = await verifyApiKey(rawKey);
    if (!verified) {
      return res.status(401).json({
        error: "Invalid Agent Hub API key",
        code: "agent_hub_api_key_invalid",
      });
    }

    req.agentHubApiKey = verified.key;
    req.agentHubPublisher = verified.user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  KEY_PREFIX,
  KEY_STATUS_ACTIVE,
  KEY_STATUS_REVOKED,
  createApiKey,
  extractApiKey,
  hashApiKey,
  listApiKeys,
  maskKeyPrefix,
  requireAgentHubApiKey,
  revokeApiKey,
  verifyApiKey,
};
