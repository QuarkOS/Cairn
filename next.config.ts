import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Published package: do not rewrite AGENTS.md / CLAUDE.md in consumer trees.
  agentRules: false,
  // When the package lives under another project's node_modules, pin the
  // Turbopack workspace to this package so compilation is hermetic. Requires
  // next/react/react-dom to resolve inside this package (see cli ensureDeskRuntime).
  outputFileTracingRoot: packageRoot,
  turbopack: {
    root: packageRoot,
  },
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
