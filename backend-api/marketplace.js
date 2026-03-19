// marketplace registry backed by PostgreSQL

const db = require("./db");

async function publishSnapshot(snapshotId, name, description, price = "Free", category = "General") {
  const result = await db.query(
    "INSERT INTO marketplace_listings(snapshot_id, name, description, price, category) VALUES($1, $2, $3, $4, $5) RETURNING *",
    [snapshotId, name, description, price, category]
  );
  return result.rows[0];
}

async function listMarketplace() {
  const result = await db.query("SELECT * FROM marketplace_listings ORDER BY created_at DESC");
  return result.rows;
}

async function getListing(id) {
  const result = await db.query("SELECT * FROM marketplace_listings WHERE id = $1", [id]);
  return result.rows[0];
}

async function deleteListing(id) {
  await db.query("DELETE FROM marketplace_listings WHERE id = $1", [id]);
}

module.exports = { publishSnapshot, listMarketplace, getListing, deleteListing };
