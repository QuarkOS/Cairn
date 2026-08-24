import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type CairnPaths = {
  home: string;
  dbPath: string;
  canvasPath: string;
};

export function resolveCairnPaths(
  cwd = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): CairnPaths {
  const dbOverride = env.CAIRN_DB_PATH?.trim();
  const homeOverride = env.CAIRN_HOME?.trim();

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
