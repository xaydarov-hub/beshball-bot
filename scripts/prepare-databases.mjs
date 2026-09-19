import fs from "node:fs";
import pg from "pg";
const c = JSON.parse(fs.readFileSync(".runtime/runtime.json", "utf8"));
const url = new URL(c.DATABASE_URL);
url.pathname = "/postgres";
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
for (const db of ["beshball", "beshball_test"]) {
  const r = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [
    db,
  ]);
  if (!r.rowCount) await client.query(`CREATE DATABASE ${db}`);
}
console.log("Mahalliy beshball va alohida beshball_test bazalari tayyor.");
await client.end();
