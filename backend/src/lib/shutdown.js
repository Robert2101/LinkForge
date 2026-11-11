import { pool } from "../db/client.js";
import { stopClickRecorder } from "../modules/analytics/clickRecorder.js";
import { redis } from "./redis.js";

// Releases everything the process holds open, in a safe order:
// first save the clicks still in memory, then close the connections.
export async function closeResources() {
  await stopClickRecorder();
  await pool.end();
  if (redis) await redis.quit().catch(() => redis.disconnect());
}
