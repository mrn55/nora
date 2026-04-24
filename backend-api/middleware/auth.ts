// @ts-nocheck
const jwt = require("jsonwebtoken");
const { readAuthCookie } = require("../authCookie");

function extractSessionToken(req) {
  // Cookie first — it's the preferred transport (HttpOnly, not JS-reachable).
  // Authorization header is still accepted for API clients, the embed flows,
  // and any legacy browser session that hasn't migrated yet.
  const cookieToken = readAuthCookie(req);
  if (cookieToken) return cookieToken;
  const authHeader = req.headers["authorization"] || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme === "Bearer" && token) return token;
  return null;
}

function authenticateToken(req, res, next) {
  const token = extractSessionToken(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

module.exports = { authenticateToken, requireAdmin };
