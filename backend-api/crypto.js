// AES-256-GCM encryption for sensitive data at rest (integration tokens, etc.)

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 64-char hex string (32 bytes)

/**
 * Encrypt plaintext. Returns "iv:authTag:ciphertext" hex string.
 * If ENCRYPTION_KEY is not set, returns plaintext unchanged (graceful degradation).
 */
function encrypt(text) {
  if (!ENCRYPTION_KEY || !text) return text;
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt "iv:authTag:ciphertext" string back to plaintext.
 * If ENCRYPTION_KEY is not set or data doesn't look encrypted, returns as-is.
 */
function decrypt(data) {
  if (!ENCRYPTION_KEY || !data) return data;
  const parts = data.split(":");
  if (parts.length !== 3) return data; // not encrypted
  const [ivHex, authTagHex, encrypted] = parts;
  try {
    const key = Buffer.from(ENCRYPTION_KEY, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return data; // decryption failed — return raw value
  }
}

module.exports = { encrypt, decrypt };
