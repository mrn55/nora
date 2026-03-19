// workspace manager backed by PostgreSQL

const db = require("./db");

async function createWorkspace(userId, name) {
  const result = await db.query(
    "INSERT INTO workspaces(user_id, name) VALUES($1, $2) RETURNING *",
    [userId, name]
  );
  return result.rows[0];
}

async function listWorkspaces(userId) {
  const result = await db.query(
    "SELECT * FROM workspaces WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  return result.rows;
}

async function addAgent(workspaceId, agentId, role = "member") {
  const result = await db.query(
    "INSERT INTO workspace_agents(workspace_id, agent_id, role) VALUES($1, $2, $3) RETURNING *",
    [workspaceId, agentId, role]
  );
  return result.rows[0];
}

async function getWorkspaceAgents(workspaceId) {
  const result = await db.query(
    "SELECT wa.*, a.name as agent_name, a.status as agent_status FROM workspace_agents wa JOIN agents a ON wa.agent_id = a.id WHERE wa.workspace_id = $1",
    [workspaceId]
  );
  return result.rows;
}

module.exports = { createWorkspace, listWorkspaces, addAgent, getWorkspaceAgents };
