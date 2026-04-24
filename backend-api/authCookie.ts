// @ts-nocheck
// HttpOnly cookie for the primary user session token.
//
// Keeping the JWT out of localStorage closes the XSS-to-full-takeover path: a
// script injection can steal whatever's in localStorage, but it cannot read an
// HttpOnly cookie. SameSite=Lax permits the cookie on top-level navigations
// (OAuth callback redirects work) while blocking it on cross-origin
// subresource requests. Secure is on whenever the request came over HTTPS; in
// local dev over plain HTTP we fall back to non-Secure so the cookie still
// flows — Express sets this automatically via `req.secure` unless we force it.

const AUTH_COOKIE_NAME = "nora_auth";
// 7 days in ms — must match the JWT expiresIn to avoid premature cookie loss.
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const sep = entry.indexOf("=");
      if (sep === -1) return cookies;
      const key = entry.slice(0, sep).trim();
      const value = entry.slice(sep + 1).trim();
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

function readAuthCookie(req) {
  const cookies = parseCookieHeader(req.headers?.cookie || "");
  return cookies[AUTH_COOKIE_NAME] || null;
}

// Extract the session token from a WebSocket upgrade request. Prefers the
// HttpOnly cookie (automatically attached by the browser on same-origin
// upgrades), falls back to `?token=` for legacy clients that haven't migrated
// yet. The `?token=` path is retained for backward compatibility only — new
// code should rely on the cookie so the JWT never appears in access logs,
// browser history, or DevTools network panels.
function extractSessionTokenFromUpgrade(request, searchParams) {
  const cookieToken = readAuthCookie(request);
  if (cookieToken) return cookieToken;
  const queryToken = searchParams?.get?.("token");
  return queryToken || null;
}

function setAuthCookie(res, token, req) {
  const isSecure = Boolean(req?.secure) || req?.headers?.["x-forwarded-proto"] === "https";
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  });
}

function clearAuthCookie(res, req) {
  const isSecure = Boolean(req?.secure) || req?.headers?.["x-forwarded-proto"] === "https";
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
  });
}

module.exports = {
  AUTH_COOKIE_NAME,
  readAuthCookie,
  setAuthCookie,
  clearAuthCookie,
  parseCookieHeader,
  extractSessionTokenFromUpgrade,
};
