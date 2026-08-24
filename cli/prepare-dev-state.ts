/**
 * After a hard kill, Next/Turbopack can leave `.next/dev/lock` and a corrupt
 * `cache/turbopack/.../CURRENT`. The next `cairn dev` then dies (or 500s CSS)
 * while opening the persistence DB. Clear that stale state when the previous
 * desk PID is gone or CURRENT is unreadable.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
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

function turbopackCurrentIsHealthy(cacheRoot: string): boolean {
  if (!existsSync(cacheRoot)) return true;
  const stack = [cacheRoot];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        stack.push(full);
        continue;
      }
      if (name !== "CURRENT") continue;
      try {
        const raw = readFileSync(full, "utf8").trim();
        if (!raw) return false;
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed !== "object" || parsed === null) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}

export type PrepareNextDevStateResult = {
  clearedLock: boolean;
  clearedTurbopackCache: boolean;
  reason?: string;
};

/**
 * Ensure `.next/dev` is safe to reuse for a new `next dev`. Does nothing when
 * another desk PID still holds the lock.
 */
export function prepareNextDevState(packageRoot: string): PrepareNextDevStateResult {
  const devDir = join(packageRoot, ".next", "dev");
  const lockPath = join(devDir, "lock");
  const cacheRoot = join(devDir, "cache");
  const result: PrepareNextDevStateResult = {
    clearedLock: false,
    clearedTurbopackCache: false,
  };

  if (!existsSync(devDir)) return result;

  const lock = existsSync(lockPath) ? readDevLock(lockPath) : undefined;
  const lockPid = lock?.pid;
  if (typeof lockPid === "number" && pidIsAlive(lockPid)) {
    // Another next dev is running; leave state alone (Next will refuse the lock).
    return result;
  }

  const staleLock = existsSync(lockPath);
  const unhealthyCache = !turbopackCurrentIsHealthy(cacheRoot);
  if (!staleLock && !unhealthyCache) return result;

  if (staleLock) {
    rmSync(lockPath, { force: true });
    result.clearedLock = true;
  }
  if (unhealthyCache || staleLock) {
    // Stale lock after SIGKILL often pairs with a half-written turbopack DB.
    // Drop the cache so the next boot opens a fresh persistence directory.
    rmSync(cacheRoot, { recursive: true, force: true });
    mkdirSync(cacheRoot, { recursive: true });
    result.clearedTurbopackCache = true;
  }

  result.reason = staleLock
    ? unhealthyCache
      ? "stale-lock-and-corrupt-cache"
      : "stale-lock"
    : "corrupt-cache";
  return result;
}
