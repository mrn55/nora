// DB-backed node scheduler — selects least-loaded node
//
// Node names are read from SCHEDULER_NODES env var (comma-separated).
// Falls back to the provisioner backend name if not set.
// Agent counts are queried from PostgreSQL for accurate load balancing.

const db = require("./db");

const NODE_NAMES = (process.env.SCHEDULER_NODES || process.env.PROVISIONER_BACKEND || "docker")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function selectNode() {
  // Query current agent distribution across nodes
  const result = await db.query(
    "SELECT node, COUNT(*)::int AS agent_count FROM agents WHERE status NOT IN ('error', 'deleted') GROUP BY node"
  );
  const counts = {};
  result.rows.forEach((r) => {
    counts[r.node] = r.agent_count;
  });

  // Pick the node with fewest active agents
  let minCount = Infinity;
  let selected = NODE_NAMES[0];
  for (const name of NODE_NAMES) {
    const count = counts[name] || 0;
    if (count < minCount) {
      minCount = count;
      selected = name;
    }
  }

  return { name: selected, agentCount: minCount };
}

module.exports = { selectNode };
