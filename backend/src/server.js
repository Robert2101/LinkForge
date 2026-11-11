import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { waitForRedis } from "./lib/redis.js";
import { closeResources } from "./lib/shutdown.js";

// Starts the HTTP server and shuts it down cleanly.

await waitForRedis();

const server = app.listen(env.PORT, () => {
  logger.info(`LinkForge API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

// Docker and every hosting platform send SIGTERM before stopping a container.
// Stop taking new requests, let the running ones finish, save buffered clicks,
// close the database and Redis, then exit. Without this a deploy would cut
// requests off mid-flight and lose the last few seconds of analytics.
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);

  // If something hangs, do not wait forever.
  setTimeout(() => {
    logger.error("Shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000).unref();

  server.close(async () => {
    await closeResources();
    logger.info("Shutdown complete");
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// A promise rejection nobody handled is a bug. Log it and restart cleanly
// rather than carry on in an unknown state.
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  shutdown("unhandledRejection");
});
