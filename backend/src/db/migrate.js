import fs from "node:fs";
import path from "node:path";
import { openDatabase } from "./connect.js";

// Applies the SQL files in backend/migrations, in filename order.
// A file that has already been applied is skipped, so this is safe to run on
// every deploy. Each file runs in its own transaction: all of it or none of it.
//
// This script needs only DATABASE_URL (and DATABASE_DRIVER if you use the
// WebSocket transport). It deliberately does not load the app's full
// configuration, so a migration job does not have to be given app secrets.

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../migrations");

// Any fixed number works. It names the lock that stops two instances
// from migrating at the same time.
const MIGRATION_LOCK_ID = 727_001;

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const { pool } = await openDatabase({
    connectionString: process.env.DATABASE_URL,
    driver: process.env.DATABASE_DRIVER || "pg",
  });

  // One dedicated connection for the whole run: the advisory lock and the
  // transactions below belong to a connection, not to the pool.
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "__linkforge_migrations" (
        "id" serial PRIMARY KEY,
        "name" varchar(255) NOT NULL UNIQUE,
        "applied_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);

    const { rows } = await client.query(`SELECT name FROM "__linkforge_migrations"`);
    const alreadyApplied = new Set(rows.map((row) => row.name));

    const files = fs.readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql")).sort();

    for (const file of files) {
      if (alreadyApplied.has(file)) {
        console.log(`skip   ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(`INSERT INTO "__linkforge_migrations" (name) VALUES ($1)`, [file]);
        await client.query("COMMIT");
        console.log(`apply  ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err });
      }
    }

    console.log("Database is up to date.");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
