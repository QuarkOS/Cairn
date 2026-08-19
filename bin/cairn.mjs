#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "cli", "main.ts");

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
    "Cairn needs tsx installed. Reinstall with: npm install cairn\n",
  );
  process.exit(1);
}

const child = spawn(process.execPath, [tsxCli, entry, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
