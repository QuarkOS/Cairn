/**
 * After a hard kill, Next/Turbopack can leave a torn `.next/dev` tree:
 * stale `lock`, corrupt `cache/turbopack/.../CURRENT`, half-written
 * static CSS chunks, and broken PostCSS pool chunks under `build/`.
 * Clearing only lock/CURRENT is not enough — globals.css PostCSS then 500s
 * on the next `cairn dev`. Wipe the whole `.next/dev` dir when the previous
 * desk PID is gone (or there is no live lock holder).
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

type DevLockInfo = {
  pid?: number;
};

function readDevLock(lockPath: string): DevLockInfo | undefined {
  try {
    const parsed = JSON.parse(readFileSync(lockPath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    const pid = (parsed as { pid?: unknown }).pid;
    return typeof pid === "number" && Number.isInteger(pid) ? { pid } : {};
  } catch {
    return undefined;
  }
}

function pidIsAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
    // EPERM: process exists but we can't signal it — treat as alive.
    return code === "EPERM";
  }
}

export type PrepareNextDevStateResult = {
  clearedDevDir: boolean;
  reason?: string;
};

/**
 * Ensure `.next/dev` is safe for a new `next dev`. Does nothing when another
 * desk PID still holds the lock. Otherwise removes the entire `.next/dev`
 * directory so PostCSS/CSS cannot restart from torn artifacts.
 */
export function prepareNextDevState(packageRoot: string): PrepareNextDevStateResult {
  const devDir = join(packageRoot, ".next", "dev");
  const lockPath = join(devDir, "lock");
  const result: PrepareNextDevStateResult = { clearedDevDir: false };

  if (!existsSync(devDir)) return result;

  const hadLock = existsSync(lockPath);
  const lock = hadLock ? readDevLock(lockPath) : undefined;
  const lockPid = lock?.pid;
  if (typeof lockPid === "number" && pidIsAlive(lockPid)) {
    // Another next dev is running; leave state alone (Next will refuse the lock).
    return result;
  }

  rmSync(devDir, { recursive: true, force: true });
  result.clearedDevDir = true;
  if (hadLock && typeof lockPid === "number") {
    result.reason = "stale-lock";
  } else if (hadLock) {
    result.reason = "invalid-lock";
  } else {
    result.reason = "previous-dev";
  }
  return result;
}
