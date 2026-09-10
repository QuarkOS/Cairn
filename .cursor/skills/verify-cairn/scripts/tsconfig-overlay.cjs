"use strict";

/**
 * Point Next's typecheck at a skill-owned tsconfig without writing the
 * product tsconfig.json. Reads (and writes) of the repo-root tsconfig are
 * redirected to VERIFY_CAIRN_TSCONFIG.
 *
 * Product gap: cli/main.test.ts fails Next's ProcessEnv.NODE_ENV typing.
 * Do not "fix" that here — exclude tests from the verify build instead.
 */
const fs = require("fs");
const path = require("path");

const product = path.resolve(process.env.VERIFY_CAIRN_PRODUCT_TSCONFIG || "");
const overlay = process.env.VERIFY_CAIRN_TSCONFIG || "";

function isProductTsconfig(file) {
  if (!product || !overlay || file == null || typeof file === "number") {
    return false;
  }
  try {
    const asPath =
      typeof file === "string"
        ? file
        : Buffer.isBuffer(file)
          ? file.toString()
          : typeof file === "object" && typeof file.href === "string"
            ? file.pathname
            : null;
    if (!asPath) return false;
    return path.resolve(asPath) === product;
  } catch {
    return false;
  }
}

const origReadFileSync = fs.readFileSync.bind(fs);
fs.readFileSync = function (file, options) {
  return origReadFileSync(isProductTsconfig(file) ? overlay : file, options);
};

const origReadFile = fs.readFile.bind(fs);
fs.readFile = function (file, options, cb) {
  if (typeof options === "function") {
    return origReadFile(isProductTsconfig(file) ? overlay : file, options);
  }
  return origReadFile(
    isProductTsconfig(file) ? overlay : file,
    options,
    cb,
  );
};

const origWriteFileSync = fs.writeFileSync.bind(fs);
fs.writeFileSync = function (file, data, options) {
  return origWriteFileSync(
    isProductTsconfig(file) ? overlay : file,
    data,
    options,
  );
};

if (fs.promises?.readFile) {
  const orig = fs.promises.readFile.bind(fs.promises);
  fs.promises.readFile = function (file, options) {
    return orig(isProductTsconfig(file) ? overlay : file, options);
  };
}

if (fs.promises?.writeFile) {
  const orig = fs.promises.writeFile.bind(fs.promises);
  fs.promises.writeFile = function (file, data, options) {
    return orig(isProductTsconfig(file) ? overlay : file, data, options);
  };
}
