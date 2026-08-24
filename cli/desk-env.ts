/**
 * Env for Next desk processes. `dev` forces Watchpack/Chokidar polling so the
 * desk survives low Linux inotify caps; Turbopack polling is configured in
 * next.config.ts (`watchOptions.pollIntervalMs`). Env-only polling is not
 * enough — Turbopack ignores WATCHPACK_POLLING.
 */
export function deskNextEnv(
  script: "dev" | "start",
  baseEnv: Record<string, string | undefined> = process.env,
): NodeJS.ProcessEnv {
  const env = { ...baseEnv } as NodeJS.ProcessEnv;
  if (script === "dev") {
    env.WATCHPACK_POLLING = "true";
    env.CHOKIDAR_USEPOLLING = "true";
    env.CHOKIDAR_INTERVAL = env.CHOKIDAR_INTERVAL?.trim() || "1000";
  }
  return env;
}
