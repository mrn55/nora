// agent snapshot registry backed by PostgreSQL

const db = require("./db");

async function createSnapshot(agentId, name, description, config = {}) {
  const result = await db.query(
    "INSERT INTO snapshots(agent_id, name, description, config) VALUES($1, $2, $3, $4) RETURNING *",
    [agentId, name, description, JSON.stringify(config)]
  );
  return result.rows[0];
}

async function listSnapshots() {
  const result = await db.query("SELECT * FROM snapshots ORDER BY created_at DESC");
  return result.rows;
}

async function getSnapshot(id) {
  const result = await db.query("SELECT * FROM snapshots WHERE id = $1", [id]);
  return result.rows[0];
}

module.exports = { createSnapshot, listSnapshots, getSnapshot };
