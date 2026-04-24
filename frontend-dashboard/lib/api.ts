function hasHeader(headers, name) {
  const needle = String(name || "").toLowerCase();
  return Object.keys(headers || {}).some((key) => key.toLowerCase() === needle);
}

type FetchHeaders = Record<string, string>;
type FetchOptions = RequestInit & {
  headers?: FetchHeaders;
  body?: BodyInit | null;
};

// Session auth primarily rides on the HttpOnly `nora_auth` cookie that the
// backend sets at /auth/login. credentials:"include" makes the browser attach
// the cookie on every API call. The Authorization header is still sent when
// a legacy localStorage token exists, so sessions from before the cookie
// migration keep working until they expire or the user logs in again.
export async function fetchWithAuth(url: string, options: FetchOptions = {}) {
  const legacyToken =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: FetchHeaders = {
    ...options.headers,
  };
  if (legacyToken && !hasHeader(headers, "authorization")) {
    headers["Authorization"] = `Bearer ${legacyToken}`;
  }

  if (
    options.body != null &&
    typeof options.body === "string" &&
    !hasHeader(headers, "content-type")
  ) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  return res;
}

// Clear both the HttpOnly cookie (server-side) and any legacy localStorage
// token (client-side), then send the user back to login. Callers that want to
// redirect somewhere specific can do so after awaiting this.
export async function logout() {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // best-effort; still clear the local token and redirect
  }
  localStorage.removeItem("token");
}
