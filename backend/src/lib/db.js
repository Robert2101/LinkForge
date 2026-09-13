import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { env } from "../config/env.js";
import * as schema from "../db/schema.js";

// Configures WebSocket transport for serverless connections
neonConfig.webSocketConstructor = globalThis.WebSocket || ws;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

// Initialize Drizzle ORM instance with typed schema and relations
export const db = drizzle(pool, { schema });

// Direct query helper for low-level diagnostics and manual SQL
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 150 && env.NODE_ENV === "development") {
      console.warn(`[Slow Query] (${duration}ms): ${text}`);
    }
    return res;
  } catch (error) {
    console.error(`[Database Error]: ${text}`, error);
    throw error;
  }
}
