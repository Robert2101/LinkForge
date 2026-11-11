// npm run dev
//
// Starts the whole project for development with one command, without Docker:
//   1. installs dependencies if they are missing
//   2. applies any new database migrations
//   3. starts the API (http://localhost:5001) and the web app (http://localhost:5173)
//
// It uses the database in backend/.env (for example Neon). Redis is optional.
// Press Ctrl+C to stop both.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const say = (message) => console.log(`\n\x1b[1m▸ ${message}\x1b[0m`);

function fail(message) {
  console.error(`\n\x1b[31m✖ ${message}\x1b[0m\n`);
  process.exit(1);
}

// Runs a command and waits for it. Stops everything if it fails.
function runStep(cwd, args, onFailure) {
  const result = spawnSync(npm, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) fail(onFailure);
}

if (!fs.existsSync(path.join(backend, ".env"))) {
  fail(
    "backend/.env is missing.\n" +
      "  Create it with:  cp backend/.env.example backend/.env\n" +
      "  then set DATABASE_URL to your PostgreSQL connection string."
  );
}

for (const [name, dir] of [["backend", backend], ["frontend", frontend]]) {
  if (!fs.existsSync(path.join(dir, "node_modules"))) {
    say(`Installing ${name} dependencies`);
    runStep(dir, ["install"], `Could not install ${name} dependencies.`);
  }
}

say("Applying database migrations");
runStep(
  backend,
  ["run", "db:migrate"],
  "Database migration failed. Check DATABASE_URL in backend/.env.\n" +
    "  If the error is ECONNRESET on a Neon database, your network blocks PostgreSQL's port:\n" +
    "  add  DATABASE_DRIVER=neon-websocket  to backend/.env and run this again."
);

say("Starting the API on http://localhost:5001 and the web app on http://localhost:5173");

const children = [
  spawn(npm, ["run", "dev"], { cwd: backend, stdio: "inherit" }),
  spawn(npm, ["run", "dev"], { cwd: frontend, stdio: "inherit" }),
];

let stopping = false;
function stopAll(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 1500).unref();
}

// If either one stops, stop the other too: half a project is not useful.
for (const child of children) {
  child.on("exit", (code) => stopAll(code ?? 0));
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
