export async function fetchWithAuth(url, options = {}) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = { ...options.headers };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  return res;
}
