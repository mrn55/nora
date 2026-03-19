// integration registry backed by PostgreSQL + catalog

const db = require("./db");
const { encrypt, decrypt } = require("./crypto");
const path = require("path");
const fs = require("fs");

// ── Catalog ──────────────────────────────────────────────

let catalogCache = null;

function loadCatalog() {
  if (catalogCache) return catalogCache;
  const catalogPath = path.join(__dirname, "integrations", "catalog", "catalog.json");
  try {
    catalogCache = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  } catch {
    catalogCache = [];
    console.warn("Could not load integration catalog from disk");
  }
  return catalogCache;
}

/**
 * Seed the integration_catalog table from the JSON spec files.
 * Called once on server startup.
 */
async function seedCatalog() {
  catalogCache = null; // force re-read from disk
  const catalog = loadCatalog();
  for (const item of catalog) {
    try {
      await db.query(
        `INSERT INTO integration_catalog(id, name, icon, category, description, auth_type, config_schema, enabled)
         VALUES($1, $2, $3, $4, $5, $6, $7, true)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           icon = EXCLUDED.icon,
           category = EXCLUDED.category,
           description = EXCLUDED.description,
           auth_type = EXCLUDED.auth_type,
           config_schema = EXCLUDED.config_schema`,
        [item.id, item.name, item.icon, item.category, item.description, item.authType, JSON.stringify(item)]
      );
    } catch (e) {
      // Table may not exist yet during first boot — silently skip
      if (!e.message.includes("does not exist")) {
        console.error(`Failed to seed catalog item ${item.id}:`, e.message);
      }
    }
  }
  console.log(`Integration catalog seeded: ${catalog.length} items`);
}

function hydrateRow(row) {
  const schema = typeof row.config_schema === "string" ? JSON.parse(row.config_schema) : (row.config_schema || {});
  return { ...row, configFields: schema.configFields || [], capabilities: schema.capabilities || [], authType: schema.authType || row.auth_type };
}

async function getCatalog(category) {
  let query = "SELECT * FROM integration_catalog WHERE enabled = true";
  const params = [];
  if (category) {
    query += " AND category = $1";
    params.push(category);
  }
  query += " ORDER BY category, name";
  try {
    const result = await db.query(query, params);
    return result.rows.map(hydrateRow);
  } catch {
    // Fallback to in-memory catalog if table doesn't exist yet
    const catalog = loadCatalog();
    if (category) return catalog.filter((c) => c.category === category);
    return catalog;
  }
}

async function getCatalogItem(catalogId) {
  try {
    const result = await db.query("SELECT * FROM integration_catalog WHERE id = $1", [catalogId]);
    return result.rows[0] ? hydrateRow(result.rows[0]) : null;
  } catch {
    return loadCatalog().find((c) => c.id === catalogId) || null;
  }
}

// ── Agent Integrations (CRUD) ────────────────────────────

async function connectIntegration(agentId, provider, token, config = {}) {
  // If no explicit token, try to extract from config (first password+required field)
  if (!token) {
    const catalogItem = await getCatalogItem(provider);
    if (catalogItem) {
      const fields = catalogItem.configFields || [];
      const tokenField = fields.find((f) => f.type === "password" && f.required);
      if (tokenField && config[tokenField.key]) {
        token = config[tokenField.key];
      }
    }
  }
  const encryptedToken = token ? encrypt(token) : null;
  const result = await db.query(
    "INSERT INTO integrations(agent_id, provider, catalog_id, access_token, config) VALUES($1, $2, $3, $4, $5) RETURNING *",
    [agentId, provider, provider, encryptedToken, JSON.stringify(config)]
  );
  return result.rows[0];
}

async function listIntegrations(agentId) {
  const result = await db.query(
    `SELECT i.id, i.agent_id, i.provider, i.catalog_id, i.config, i.status, i.created_at,
            ic.name as catalog_name, ic.icon as catalog_icon, ic.category as catalog_category, ic.description as catalog_description
     FROM integrations i
     LEFT JOIN integration_catalog ic ON i.catalog_id = ic.id
     WHERE i.agent_id = $1
     ORDER BY i.created_at DESC`,
    [agentId]
  );
  return result.rows;
}

async function removeIntegration(integrationId, agentId) {
  const result = await db.query(
    "DELETE FROM integrations WHERE id = $1 AND agent_id = $2 RETURNING id",
    [integrationId, agentId]
  );
  if (!result.rows[0]) throw new Error("Integration not found");
}

async function testIntegration(integrationId, agentId) {
  const result = await db.query(
    "SELECT * FROM integrations WHERE id = $1 AND agent_id = $2",
    [integrationId, agentId]
  );
  const integration = result.rows[0];
  if (!integration) throw new Error("Integration not found");

  if (!integration.access_token) {
    return { success: false, error: "No access token configured" };
  }

  const token = decrypt(integration.access_token);
  const provider = integration.provider;

  // Real API connectivity tests per provider
  const connectivityTests = {
    github: async () => {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "Nora-Platform" },
      });
      if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.login}` };
    },
    gitlab: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const baseUrl = config.base_url || "https://gitlab.com";
      const res = await fetch(`${baseUrl}/api/v4/user`, {
        headers: { "PRIVATE-TOKEN": token },
      });
      if (!res.ok) throw new Error(`GitLab API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.username}` };
    },
    slack: async () => {
      const res = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(`Slack: ${data.error}`);
      return { success: true, message: `Connected to ${data.team}` };
    },
    discord: async () => {
      const res = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bot ${token}` },
      });
      if (!res.ok) throw new Error(`Discord API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.username}` };
    },
    notion: async () => {
      const res = await fetch("https://api.notion.com/v1/users/me", {
        headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
      });
      if (!res.ok) throw new Error(`Notion API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.name || data.id}` };
    },
    jira: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const domain = config.site_url || config.domain || config.base_url;
      if (!domain) throw new Error("Jira site URL not configured");
      const url = domain.includes("://") ? domain : `https://${domain}`;
      const email = config.email;
      if (!email) throw new Error("Jira email not configured");
      const res = await fetch(`${url}/rest/api/3/myself`, {
        headers: { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`Jira API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.displayName}` };
    },
    linear: async () => {
      const res = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ viewer { id name } }" }),
      });
      if (!res.ok) throw new Error(`Linear API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.data?.viewer?.name || "verified"}` };
    },
    datadog: async () => {
      const res = await fetch("https://api.datadoghq.com/api/v1/validate", {
        headers: { "DD-API-KEY": token },
      });
      if (!res.ok) throw new Error(`Datadog API returned ${res.status}`);
      return { success: true, message: "API key validated" };
    },
    sentry: async () => {
      const res = await fetch("https://sentry.io/api/0/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Sentry API returned ${res.status}`);
      return { success: true, message: "Authenticated successfully" };
    },
    sendgrid: async () => {
      const res = await fetch("https://api.sendgrid.com/v3/user/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`SendGrid API returned ${res.status}`);
      return { success: true, message: "API key validated" };
    },
    openai: async () => {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`OpenAI API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected (${data.data?.length || 0} models available)` };
    },
    anthropic: async () => {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": token, "anthropic-version": "2023-06-01" },
      });
      if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
      return { success: true, message: "API key validated" };
    },
    huggingface: async () => {
      const res = await fetch("https://huggingface.co/api/whoami-v2", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Hugging Face API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.name || data.fullname || "verified"}` };
    },
    bitbucket: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const username = config.username;
      if (!username) throw new Error("Bitbucket username not configured");
      const res = await fetch("https://api.bitbucket.org/2.0/user", {
        headers: { Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}` },
      });
      if (!res.ok) throw new Error(`Bitbucket API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.username || data.display_name}` };
    },
    airtable: async () => {
      const res = await fetch("https://api.airtable.com/v0/meta/whoami", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Airtable API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.email || data.id}` };
    },
    asana: async () => {
      const res = await fetch("https://app.asana.com/api/1.0/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Asana API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.data?.name || "verified"}` };
    },
    monday: async () => {
      const res = await fetch("https://api.monday.com/v2", {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ me { name } }" }),
      });
      if (!res.ok) throw new Error(`Monday.com API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.data?.me?.name || "verified"}` };
    },
    clickup: async () => {
      const res = await fetch("https://api.clickup.com/api/v2/user", {
        headers: { Authorization: token },
      });
      if (!res.ok) throw new Error(`ClickUp API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.user?.username || "verified"}` };
    },
    trello: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const apiKey = config.api_key;
      if (!apiKey) throw new Error("Trello API key not configured");
      const res = await fetch(`https://api.trello.com/1/members/me?key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error(`Trello API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.username}` };
    },
    confluence: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const baseUrl = config.base_url;
      const email = config.email;
      if (!baseUrl) throw new Error("Confluence URL not configured");
      if (!email) throw new Error("Confluence email not configured");
      const url = baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`;
      const res = await fetch(`${url}/wiki/rest/api/user/current`, {
        headers: { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}` },
      });
      if (!res.ok) throw new Error(`Confluence API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.displayName || data.username || "verified"}` };
    },
    digitalocean: async () => {
      const res = await fetch("https://api.digitalocean.com/v2/account", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`DigitalOcean API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected (${data.account?.email || "verified"})` };
    },
    supabase: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const url = config.url;
      if (!url) throw new Error("Supabase project URL not configured");
      const res = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: token, Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Supabase API returned ${res.status}`);
      return { success: true, message: "Connected to Supabase" };
    },
    stripe: async () => {
      const res = await fetch("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Stripe API returned ${res.status}`);
      return { success: true, message: "Balance verified" };
    },
    hubspot: async () => {
      const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HubSpot API returned ${res.status}`);
      return { success: true, message: "Connected to HubSpot" };
    },
    pipedrive: async () => {
      const res = await fetch(`https://api.pipedrive.com/v1/users/me?api_token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error(`Pipedrive API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.data?.name || "verified"}` };
    },
    zendesk: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const subdomain = config.subdomain;
      const email = config.email;
      if (!subdomain) throw new Error("Zendesk subdomain not configured");
      if (!email) throw new Error("Zendesk email not configured");
      const res = await fetch(`https://${subdomain}.zendesk.com/api/v2/users/me.json`, {
        headers: { Authorization: `Basic ${Buffer.from(`${email}/token:${token}`).toString("base64")}` },
      });
      if (!res.ok) throw new Error(`Zendesk API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.user?.name || "verified"}` };
    },
    elasticsearch: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const nodeUrl = config.node_url;
      if (!nodeUrl) throw new Error("Elasticsearch node URL not configured");
      const headers = {};
      if (config.username) {
        headers.Authorization = `Basic ${Buffer.from(`${config.username}:${token}`).toString("base64")}`;
      }
      const res = await fetch(nodeUrl, { headers });
      if (!res.ok) throw new Error(`Elasticsearch returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected to cluster "${data.cluster_name || "unknown"}"` };
    },
    pinecone: async () => {
      const res = await fetch("https://api.pinecone.io/indexes", {
        headers: { "Api-Key": token },
      });
      if (!res.ok) throw new Error(`Pinecone API returned ${res.status}`);
      return { success: true, message: "Connected to Pinecone" };
    },
    algolia: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const appId = config.app_id;
      if (!appId) throw new Error("Algolia Application ID not configured");
      const res = await fetch(`https://${appId}-dsn.algolia.net/1/keys`, {
        headers: { "X-Algolia-Application-Id": appId, "X-Algolia-API-Key": token },
      });
      if (!res.ok) throw new Error(`Algolia API returned ${res.status}`);
      return { success: true, message: "Connected to Algolia" };
    },
    vercel: async () => {
      const res = await fetch("https://api.vercel.com/v2/user", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Vercel API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.user?.username || "verified"}` };
    },
    circleci: async () => {
      const res = await fetch("https://circleci.com/api/v2/me", {
        headers: { "Circle-Token": token },
      });
      if (!res.ok) throw new Error(`CircleCI API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.name || data.login || "verified"}` };
    },
    terraform: async () => {
      const res = await fetch("https://app.terraform.io/api/v2/account/details", {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.api+json" },
      });
      if (!res.ok) throw new Error(`Terraform Cloud API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.data?.attributes?.username || "verified"}` };
    },
    grafana: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const url = config.url;
      if (!url) throw new Error("Grafana URL not configured");
      const res = await fetch(`${url}/api/org`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Grafana API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected to ${data.name || "Grafana"}` };
    },
    pagerduty: async () => {
      const res = await fetch("https://api.pagerduty.com/users/me", {
        headers: { Authorization: `Token token=${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`PagerDuty API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.user?.name || "verified"}` };
    },
    jenkins: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const url = config.url;
      const username = config.username;
      if (!url) throw new Error("Jenkins URL not configured");
      if (!username) throw new Error("Jenkins username not configured");
      const res = await fetch(`${url}/api/json`, {
        headers: { Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}` },
      });
      if (!res.ok) throw new Error(`Jenkins API returned ${res.status}`);
      return { success: true, message: "Connected to Jenkins" };
    },
    dropbox: async () => {
      const res = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Dropbox API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.name?.display_name || "verified"}` };
    },
    twilio: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const sid = config.account_sid;
      if (!sid) throw new Error("Twilio Account SID not configured");
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
      });
      if (!res.ok) throw new Error(`Twilio API returned ${res.status}`);
      return { success: true, message: "Connected to Twilio" };
    },
    shopify: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const shop = config.shop_domain;
      if (!shop) throw new Error("Shopify shop domain not configured");
      const domain = shop.includes(".") ? shop : `${shop}.myshopify.com`;
      const res = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
        headers: { "X-Shopify-Access-Token": token },
      });
      if (!res.ok) throw new Error(`Shopify API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected to ${data.shop?.name || shop}` };
    },
    woocommerce: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const siteUrl = config.site_url;
      const consumerKey = config.consumer_key;
      if (!siteUrl) throw new Error("WooCommerce site URL not configured");
      if (!consumerKey) throw new Error("WooCommerce consumer key not configured");
      const url = siteUrl.replace(/\/+$/, "");
      const res = await fetch(`${url}/wp-json/wc/v3/system_status`, {
        headers: { Authorization: `Basic ${Buffer.from(`${consumerKey}:${token}`).toString("base64")}` },
      });
      if (!res.ok) throw new Error(`WooCommerce API returned ${res.status}`);
      return { success: true, message: "Connected to WooCommerce" };
    },
    linkedin: async () => {
      const res = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`LinkedIn API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.name || data.given_name || "verified"}` };
    },
    facebook: async () => {
      const res = await fetch(`https://graph.facebook.com/v18.0/me?access_token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error(`Facebook API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as ${data.name || "verified"}` };
    },
    "docker-hub": async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const username = config.username;
      if (!username) throw new Error("Docker Hub username not configured");
      const res = await fetch("https://hub.docker.com/v2/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: token }),
      });
      if (!res.ok) throw new Error(`Docker Hub API returned ${res.status}`);
      return { success: true, message: `Connected as ${username}` };
    },
    salesforce: async () => {
      const config = typeof integration.config === "string" ? JSON.parse(integration.config) : (integration.config || {});
      const instanceUrl = config.instance_url;
      if (!instanceUrl) throw new Error("Salesforce instance URL not configured");
      const res = await fetch(`${instanceUrl}/services/data/v59.0/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Salesforce API returned ${res.status}`);
      return { success: true, message: "Connected to Salesforce" };
    },
    twitter: async () => {
      const res = await fetch("https://api.twitter.com/2/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Twitter/X API returned ${res.status}`);
      const data = await res.json();
      return { success: true, message: `Connected as @${data.data?.username || "verified"}` };
    },
  };

  const tester = connectivityTests[provider];
  if (tester) {
    try {
      return await tester();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Fallback for providers without specific tests
  return { success: true, message: "Credentials stored (connectivity not verified for this provider)" };
}

/**
 * Build integration summary for syncing to agent containers.
 */
async function getIntegrationsForSync(agentId) {
  const result = await db.query(
    `SELECT i.id, i.provider, i.catalog_id, i.config, i.status,
            ic.name as catalog_name, ic.category as catalog_category
     FROM integrations i
     LEFT JOIN integration_catalog ic ON i.catalog_id = ic.id
     WHERE i.agent_id = $1 AND i.status = 'active'`,
    [agentId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    name: r.catalog_name || r.provider,
    category: r.catalog_category || "unknown",
    config: typeof r.config === "string" ? JSON.parse(r.config) : (r.config || {}),
    status: r.status,
  }));
}

module.exports = {
  seedCatalog,
  getCatalog,
  getCatalogItem,
  connectIntegration,
  listIntegrations,
  removeIntegration,
  testIntegration,
  getIntegrationsForSync,
};
