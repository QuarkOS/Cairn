import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import {
  detectInstallSpec,
  normalizeInstallSpec,
  npxInstallSpec,
  PACKAGE_NAME,
} from "./npx-install-spec";

describe("normalizeInstallSpec", () => {
  it("keeps github: specs", () => {
    assert.equal(
      normalizeInstallSpec("github:QuarkOS/Cairn"),
      "github:QuarkOS/Cairn",
    );
  });

  it("maps git remotes to github:Org/Repo", () => {
    assert.equal(
      normalizeInstallSpec(
        "git+ssh://git@github.com/QuarkOS/Cairn.git#abc123",
      ),
      "github:QuarkOS/Cairn",
    );
    assert.equal(
      normalizeInstallSpec(
        "git+https://github.com/QuarkOS/Cairn.git#abc123",
      ),
      "github:QuarkOS/Cairn",
    );
    assert.equal(
      normalizeInstallSpec("git@github.com:QuarkOS/Cairn.git"),
      "github:QuarkOS/Cairn",
    );
  });

  it("maps registry versions to the scoped package name", () => {
    assert.equal(normalizeInstallSpec("^0.4.1"), PACKAGE_NAME);
    assert.equal(normalizeInstallSpec("0.4.1"), PACKAGE_NAME);
    assert.equal(normalizeInstallSpec("latest"), PACKAGE_NAME);
    assert.equal(
      normalizeInstallSpec(
        "https://registry.npmjs.org/@quarkos/cairn/-/cairn-0.4.1.tgz",
      ),
      PACKAGE_NAME,
    );
  });

  it("promotes Org/Repo shorthand to github:", () => {
    assert.equal(normalizeInstallSpec("QuarkOS/Cairn"), "github:QuarkOS/Cairn");
  });
});

describe("detectInstallSpec", () => {
  const dirs: string[] = [];
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  function scratch(): string {
    const dir = mkdtempSync(join(tmpdir(), "cairn-npx-spec-"));
    dirs.push(dir);
    return dir;
  }

  it("uses a local checkout path when .git is present", () => {
    const root = scratch();
    mkdirSync(join(root, ".git"));
    assert.equal(detectInstallSpec(root), root);
  });

  it("reads github: from the npx parent package.json", () => {
    const cache = scratch();
    const pkgRoot = join(cache, "node_modules", "@quarkos", "cairn");
    mkdirSync(pkgRoot, { recursive: true });
    writeFileSync(
      join(cache, "package.json"),
      JSON.stringify({
        dependencies: { [PACKAGE_NAME]: "github:QuarkOS/Cairn" },
      }),
    );
    writeFileSync(
      join(pkgRoot, "package.json"),
      JSON.stringify({ name: PACKAGE_NAME, version: "0.4.2" }),
    );

    assert.equal(detectInstallSpec(pkgRoot), "github:QuarkOS/Cairn");
  });

  it("reads the scoped name from an npm registry parent package.json", () => {
    const cache = scratch();
    const pkgRoot = join(cache, "node_modules", "@quarkos", "cairn");
    mkdirSync(pkgRoot, { recursive: true });
    writeFileSync(
      join(cache, "package.json"),
      JSON.stringify({
        dependencies: { [PACKAGE_NAME]: "^0.4.1" },
      }),
    );
    writeFileSync(
      join(pkgRoot, "package.json"),
      JSON.stringify({ name: PACKAGE_NAME, version: "0.4.1" }),
    );

    assert.equal(detectInstallSpec(pkgRoot), PACKAGE_NAME);
  });

  it("falls back to package-lock resolved git URLs", () => {
    const cache = scratch();
    const pkgRoot = join(cache, "node_modules", "@quarkos", "cairn");
    mkdirSync(pkgRoot, { recursive: true });
    writeFileSync(join(cache, "package.json"), JSON.stringify({}));
    writeFileSync(
      join(cache, "package-lock.json"),
      JSON.stringify({
        packages: {
          [`node_modules/${PACKAGE_NAME}`]: {
            resolved:
              "git+ssh://git@github.com/QuarkOS/Cairn.git#deadbeef",
          },
        },
      }),
    );

    assert.equal(detectInstallSpec(pkgRoot), "github:QuarkOS/Cairn");
  });

  it("defaults to the scoped package when nothing else is known", () => {
    const root = scratch();
    assert.equal(detectInstallSpec(root), PACKAGE_NAME);
  });

  it("lets CAIRN_NPX_SPEC override detection", () => {
    const root = scratch();
    mkdirSync(join(root, ".git"));
    assert.equal(
      npxInstallSpec(root, { CAIRN_NPX_SPEC: "github:Other/Fork" }),
      "github:Other/Fork",
    );
  });
});
