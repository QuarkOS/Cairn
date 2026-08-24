import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const PACKAGE_NAME = "@quarkos/cairn";

type PackageJson = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

type PackageLock = {
  packages?: Record<string, { resolved?: string }>;
};

/**
 * Turn an npm dependency string or lock `resolved` URL into the specifier
 * MCP configs should pass to `npx -y`.
 */
export function normalizeInstallSpec(raw: string): string {
  const spec = raw.trim();
  if (!spec) return PACKAGE_NAME;

  const githubHttps = spec.match(
    /^(?:git\+)?https?:\/\/github\.com\/([^/]+)\/([^/#.]+?)(?:\.git)?(?:#.*)?$/i,
  );
  if (githubHttps) return `github:${githubHttps[1]}/${githubHttps[2]}`;

  const githubSsh = spec.match(
    /^(?:git\+)?ssh:\/\/git@github\.com\/([^/]+)\/([^/#.]+?)(?:\.git)?(?:#.*)?$/i,
  );
  if (githubSsh) return `github:${githubSsh[1]}/${githubSsh[2]}`;

  const githubScp = spec.match(
    /^git@github\.com:([^/]+)\/([^/#.]+?)(?:\.git)?(?:#.*)?$/i,
  );
  if (githubScp) return `github:${githubScp[1]}/${githubScp[2]}`;

  if (
    /^https?:\/\/registry\.npmjs\.org\/@quarkos\/cairn(?:\/|$)/i.test(spec)
  ) {
    return PACKAGE_NAME;
  }

  if (
    /^(github:|gitlab:|bitbucket:|gist:|git\+|https?:|file:|\.|\/)/i.test(spec)
  ) {
    return spec;
  }

  // Registry versions / ranges mean the published package name.
  if (
    spec === "*" ||
    spec === "latest" ||
    /^(?:[\^~>=<]|v?\d)/.test(spec)
  ) {
    return PACKAGE_NAME;
  }

  if (spec === PACKAGE_NAME || spec.startsWith(`${PACKAGE_NAME}@`)) {
    return PACKAGE_NAME;
  }

  // npm accepts "Org/Repo" as a GitHub shorthand.
  if (/^[^@][^/]*\/[^/]+$/.test(spec)) {
    return `github:${spec}`;
  }

  return spec;
}

function readJsonFile(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

/**
 * npx records the requested install specifier on the cache root package.json
 * (`dependencies["@quarkos/cairn"]` is `github:…` or a semver range).
 */
export function readSpecFromAncestorPackageJson(
  startDir: string,
): string | null {
  let dir = resolve(startDir);
  for (;;) {
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;

    const pkg = readJsonFile(join(dir, "package.json")) as PackageJson | null;
    if (!pkg || pkg.name === PACKAGE_NAME) continue;

    const raw =
      pkg.dependencies?.[PACKAGE_NAME] ??
      pkg.devDependencies?.[PACKAGE_NAME] ??
      pkg.optionalDependencies?.[PACKAGE_NAME];
    if (typeof raw === "string" && raw.trim()) {
      return normalizeInstallSpec(raw);
    }
  }
}

/**
 * Fall back to package-lock `resolved` when the parent only has a name pin.
 */
export function readSpecFromAncestorPackageLock(
  startDir: string,
): string | null {
  let dir = resolve(startDir);
  for (;;) {
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;

    const lock = readJsonFile(
      join(dir, "package-lock.json"),
    ) as PackageLock | null;
    const resolved =
      lock?.packages?.[`node_modules/${PACKAGE_NAME}`]?.resolved;
    if (typeof resolved === "string" && resolved.trim()) {
      return normalizeInstallSpec(resolved);
    }
  }
}

/**
 * Infer how this Cairn tree was installed so generated MCP configs reuse that
 * source (GitHub init must not point MCP at a stale npm tarball).
 */
export function detectInstallSpec(packageRoot: string): string {
  if (existsSync(join(packageRoot, ".git"))) {
    return resolve(packageRoot);
  }

  return (
    readSpecFromAncestorPackageJson(packageRoot) ??
    readSpecFromAncestorPackageLock(packageRoot) ??
    PACKAGE_NAME
  );
}

/**
 * Specifier passed to `npx` in generated MCP configs.
 * Defaults to the install source of this Cairn tree. Override with
 * CAIRN_NPX_SPEC when you need a different package for MCP.
 */
export function npxInstallSpec(packageRoot: string, env = process.env): string {
  const override = env.CAIRN_NPX_SPEC?.trim();
  if (override) return override;
  return detectInstallSpec(packageRoot);
}
