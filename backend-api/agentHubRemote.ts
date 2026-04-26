// @ts-nocheck
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

let catalogCache = {
  url: "",
  expiresAt: 0,
  payload: null,
};

function normalizeHubBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function buildHubUrl(baseUrl, path) {
  const normalizedBase = normalizeHubBaseUrl(baseUrl);
  if (!normalizedBase) return "";
  return `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeCatalogItem(item = {}) {
  const listing = item.listing || item;
  const id = String(listing.id || listing.slug || item.id || "").trim();
  if (!id) return null;

  return {
    ...item,
    ...(item.listing ? {} : listing),
    id: `hub:${id}`,
    remote_id: id,
    remote: true,
    source_type: "community",
    status: listing.status || "published",
    name: listing.name || item.name || "Community Template",
    description: listing.description || item.description || "",
    category: listing.category || item.category || "General",
    price: listing.price || item.price || "Free",
    owner_name: listing.ownerName || listing.owner_name || item.owner_name || "Nora Community",
    current_version: listing.version || listing.current_version || item.current_version || 1,
  };
}

function normalizeCatalogPayload(payload = {}, { hubUrl = "", error = "" } = {}) {
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.items)
      ? payload.items
      : [];
  const items = rawItems.map(normalizeCatalogItem).filter(Boolean);
  return {
    items,
    hub: {
      url: hubUrl,
      lastSyncedAt: new Date().toISOString(),
      error,
    },
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs || 5000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Agent Hub request failed with ${response.status}`);
  }
  return payload;
}

async function fetchCatalog(settings = {}, options = {}) {
  const hubUrl = normalizeHubBaseUrl(settings.envUrl || settings.url);
  if (!hubUrl) {
    return normalizeCatalogPayload([], { error: "Agent Hub URL is not configured" });
  }

  const now = Date.now();
  if (
    !options.refresh &&
    catalogCache.url === hubUrl &&
    catalogCache.payload &&
    catalogCache.expiresAt > now
  ) {
    return catalogCache.payload;
  }

  try {
    const payload = await fetchJson(buildHubUrl(hubUrl, "/api/agent-hub/catalog"), {
      timeoutMs: options.timeoutMs || 5000,
    });
    const normalized = normalizeCatalogPayload(payload, { hubUrl });
    catalogCache = {
      url: hubUrl,
      expiresAt: now + (options.ttlMs || DEFAULT_CACHE_TTL_MS),
      payload: normalized,
    };
    return normalized;
  } catch (error) {
    const fallback =
      catalogCache.url === hubUrl && catalogCache.payload ? catalogCache.payload : null;
    return {
      items: fallback?.items || [],
      hub: {
        url: hubUrl,
        lastSyncedAt: fallback?.hub?.lastSyncedAt || null,
        error: error.message,
      },
    };
  }
}

async function fetchListing(settings = {}, remoteId) {
  const hubUrl = normalizeHubBaseUrl(settings.envUrl || settings.url);
  if (!hubUrl) {
    throw new Error("Agent Hub URL is not configured");
  }
  const normalizedRemoteId = String(remoteId || "")
    .replace(/^hub:/, "")
    .trim();
  if (!normalizedRemoteId) {
    throw new Error("remote listing id is required");
  }
  const payload = await fetchJson(
    buildHubUrl(hubUrl, `/api/agent-hub/catalog/${encodeURIComponent(normalizedRemoteId)}`),
  );
  const listing = normalizeCatalogItem(payload.listing || payload);
  if (!listing) {
    throw new Error("Remote Agent Hub listing not found");
  }
  return {
    ...payload,
    ...listing,
    id: `hub:${listing.remote_id}`,
    remote_id: listing.remote_id,
  };
}

async function submitListing(settings = {}, payload = {}) {
  const hubUrl = normalizeHubBaseUrl(settings.envUrl || settings.url);
  if (!hubUrl) {
    throw new Error("Agent Hub URL is not configured");
  }
  return fetchJson(buildHubUrl(hubUrl, "/api/agent-hub/submissions"), {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 5000,
  });
}

module.exports = {
  fetchCatalog,
  fetchListing,
  normalizeCatalogItem,
  normalizeHubBaseUrl,
  submitListing,
};
