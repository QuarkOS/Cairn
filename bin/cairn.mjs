#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "cli", "main.ts");
const tsconfig = join(root, "tsconfig.json");

function resolveTsxCli() {
  try {
    const require = createRequire(join(root, "package.json"));
    return require.resolve("tsx/cli");
  } catch {
    return null;
  }
}

const tsxCli = resolveTsxCli();
if (!tsxCli) {
  process.stderr.write(
    "Cairn needs tsx installed. Reinstall with: npm install @quarkos/cairn\n",
  );
  process.exit(1);
}

// Keep the caller's cwd so `init --project` writes into their folder.
// Pass the package tsconfig so path aliases resolve when cwd is not the package root
// (npx / MCP clients).
const child = spawn(
  process.execPath,
  [tsxCli, "--tsconfig", tsconfig, entry, ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  },
);

let shuttingDown = false;
const onSignal = (signal) => {
  if (shuttingDown || child.pid == null) return;
  shuttingDown = true;
  try {
    process.kill(child.pid, signal);
  } catch {
    // Child already gone.
  }
};
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

child.on("exit", (code, signal) => {
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
