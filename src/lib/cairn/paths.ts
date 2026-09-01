import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type CairnPaths = {
  home: string;
  dbPath: string;
  canvasPath: string;
};

/**
 * Directory the user invoked the CLI from.
 *
 * `cairn dev` / `cairn start` must spawn Next.js with cwd = the installed
 * package (so next.config.ts resolves). npm/npx still set INIT_CWD to the
 * original directory. Prefer that when cwd has already been switched to the
 * package root.
 */
export function resolveInvocationCwd(input: {
  cwd: string;
  packageRoot: string;
  initCwd?: string;
}): string {
  const cwd = resolve(input.cwd);
  const packageRoot = resolve(input.packageRoot);
  if (cwd !== packageRoot) return cwd;
  const initCwd = input.initCwd?.trim();
  if (initCwd) {
    const resolvedInit = resolve(initCwd);
    if (resolvedInit !== packageRoot) return resolvedInit;
  }
  return cwd;
}

/**
 * Treat empty values and unsubstituted `${VAR}` placeholders as unset.
 *
 * Cursor plugin Configure injects optional variables into mcp.json `env`.
 * When CAIRN_HOME is left blank, hosts may pass "" or the literal
 * `${CAIRN_HOME}`. Either would skip native resolution (CAIRN_HOME, else
 * ./.cairn, else ~/.cairn) if we treated them as a real path.
 */
function usablePathOverride(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(trimmed)) return undefined;
  return trimmed;
}

export function resolveCairnPaths(
  cwd = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): CairnPaths {
  const dbOverride = usablePathOverride(env.CAIRN_DB_PATH);
  const homeOverride = usablePathOverride(env.CAIRN_HOME);

  let home: string;
  if (homeOverride) {
    home = resolve(homeOverride);
  } else {
    const projectHome = resolve(cwd, ".cairn");
    home = existsSync(projectHome) ? projectHome : resolve(homedir(), ".cairn");
  }

  const dbPath = dbOverride ? resolve(dbOverride) : join(home, "cairn.db");
  const canvasPath = join(home, "canvas.json");

  return { home, dbPath, canvasPath };
}

/** Paths `dev`/`start` should pin on the Next.js child via CAIRN_HOME. */
export function resolveDeskHome(input: {
  cwd: string;
  packageRoot: string;
  env?: Record<string, string | undefined>;
}): CairnPaths {
  const env = input.env ?? {};
  const invocationCwd = resolveInvocationCwd({
    cwd: input.cwd,
    packageRoot: input.packageRoot,
    initCwd: env.INIT_CWD,
  });
  return resolveCairnPaths(invocationCwd, env);
}
