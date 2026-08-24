import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, it } from "node:test";

import { resolveCairnPaths, resolveDeskHome, resolveInvocationCwd } from "./paths";

describe("resolveInvocationCwd", () => {
  const callerCwd = resolve(tmpdir(), "my-app");
  const packageRoot = resolve(tmpdir(), "npx-cache", "@quarkos", "cairn");

  it("keeps the caller cwd when it is not the package root", () => {
    const cwd = resolveInvocationCwd({
      cwd: callerCwd,
      packageRoot,
    });
    assert.equal(cwd, callerCwd);
  });

  it("uses INIT_CWD when cwd has already switched to the package", () => {
    const cwd = resolveInvocationCwd({
      cwd: packageRoot,
      packageRoot,
      initCwd: callerCwd,
    });
    assert.equal(cwd, callerCwd);
  });
});

describe("resolveDeskHome", () => {
  const root = mkdtempSync(join(tmpdir(), "cairn-desk-home-"));
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("pins CAIRN_HOME to the project .cairn, not the package tree", () => {
    const project = join(root, "proj");
    const pkg = join(root, "pkg");
    mkdirSync(join(project, ".cairn"), { recursive: true });
    mkdirSync(pkg, { recursive: true });

    const paths = resolveDeskHome({
      cwd: project,
      packageRoot: pkg,
      env: {},
    });
    assert.equal(paths.home, join(project, ".cairn"));
    assert.equal(paths.dbPath, join(project, ".cairn", "cairn.db"));
    assert.equal(paths.canvasPath, join(project, ".cairn", "canvas.json"));
  });

  it("uses INIT_CWD .cairn when Next already runs from the package", () => {
    const project = join(root, "from-init-cwd");
    const pkg = join(root, "installed-pkg");
    mkdirSync(join(project, ".cairn"), { recursive: true });
    mkdirSync(pkg, { recursive: true });

    const paths = resolveDeskHome({
      cwd: pkg,
      packageRoot: pkg,
      env: { INIT_CWD: project },
    });
    assert.equal(paths.home, join(project, ".cairn"));
  });

  it("lets CAIRN_HOME override the invocation directory", () => {
    const project = join(root, "overridden");
    const pkg = join(root, "pkg-override");
    const custom = join(root, "custom-home");
    mkdirSync(join(project, ".cairn"), { recursive: true });
    mkdirSync(pkg, { recursive: true });

    const paths = resolveDeskHome({
      cwd: project,
      packageRoot: pkg,
      env: { CAIRN_HOME: custom },
    });
    assert.equal(paths.home, custom);
    assert.equal(resolveCairnPaths(project, { CAIRN_HOME: custom }).home, custom);
  });
});
