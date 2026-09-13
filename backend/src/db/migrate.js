import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, query } from "../lib/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  console.log("🚀 Starting database schema migration...");
  const migrationDir = path.resolve(__dirname, "../../drizzle");
  
  if (!fs.existsSync(migrationDir)) {
    console.error("Migration directory not found:", migrationDir);
    process.exit(1);
  }

  // Create migrations tracker table if not exists
  await query(`
    CREATE TABLE IF NOT EXISTS "__linkforge_migrations" (
      "id" serial PRIMARY KEY,
      "name" varchar(255) NOT NULL UNIQUE,
      "applied_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  const appliedRows = await query(`SELECT name FROM "__linkforge_migrations";`);
  const applied = new Set(appliedRows.rows.map((r) => r.name));

  const sqlFiles = fs
    .readdirSync(migrationDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of sqlFiles) {
    if (applied.has(file)) {
      console.log(`✓ Already applied: ${file}`);
      continue;
    }

    console.log(`⚙ Applying migration: ${file}...`);
    const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    const client = await pool.connect();
    try {
      await client.query("BEGIN;");
      for (const stmt of statements) {
        await client.query(stmt);
      }
      await client.query(
        `INSERT INTO "__linkforge_migrations" (name) VALUES ($1);`,
        [file]
      );
      await client.query("COMMIT;");
      console.log(`✅ Successfully applied: ${file}`);
    } catch (err) {
      await client.query("ROLLBACK;");
      console.error(`❌ Failed migration ${file}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log("🎉 All database migrations are up to date.");
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error("Fatal migration error:", err);
  process.exit(1);
});
