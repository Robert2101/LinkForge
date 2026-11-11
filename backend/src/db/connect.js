import pg from "pg";

// Opens a PostgreSQL connection pool using one of two transports.
//
//   "pg"              The standard PostgreSQL protocol over TCP port 5432.
//                     Works with every PostgreSQL: Docker, Neon, RDS, CI.
//                     This is the default and what production uses.
//
//   "neon-websocket"  Neon's driver, which carries the same protocol inside a
//                     WebSocket on port 443 (HTTPS). Use it when the network
//                     you are on blocks port 5432 or resets PostgreSQL
//                     traffic, which some college and office networks do.
//                     It can only talk to a Neon database.
//
// Both return a pool with the same API (query, connect, end), so nothing else
// in the codebase needs to know which one is in use.
//
// This file deliberately reads no configuration itself: the migration script
// uses it too and must not depend on the app's full environment.
export async function openDatabase({ connectionString, driver = "pg", ...poolOptions }) {
  if (driver === "neon-websocket") {
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    neonConfig.webSocketConstructor = WebSocket; // built into Node 22+
    return { pool: new Pool({ connectionString, ...poolOptions }), drizzle };
  }

  const { drizzle } = await import("drizzle-orm/node-postgres");
  return { pool: new pg.Pool({ connectionString, ...poolOptions }), drizzle };
}
