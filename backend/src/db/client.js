import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { openDatabase } from "./connect.js";
import * as schema from "./schema.js";

// One shared connection pool for the whole process. Opening a PostgreSQL
// connection is slow, so requests borrow one from the pool and return it.
const { pool, drizzle } = await openDatabase({
  connectionString: env.DATABASE_URL,
  driver: env.DATABASE_DRIVER,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// An idle connection can be dropped by the server at any time. Without this
// listener that would crash the process.
pool.on("error", (err) => {
  logger.error({ err: err.message }, "Idle Postgres connection failed");
});

export { pool };
export const db = drizzle(pool, { schema });
