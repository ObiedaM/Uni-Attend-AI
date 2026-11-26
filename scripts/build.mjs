import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");
const isWatch = process.argv.includes("--watch");

function copyDirRecursive(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function copyStaticAssets() {
  fs.mkdirSync(DIST, { recursive: true });
  copyDirRecursive(PUBLIC_DIR, DIST);
}

function printBundleSummary() {
  const files = ["background.js", "content.js"];
  for (const file of files) {
    const full = path.join(DIST, file);
    if (fs.existsSync(full)) {
      const kb = (fs.statSync(full).size / 1024).toFixed(1);
      console.log(`  dist/${file}  ${kb} KB`);
    }
  }
}

/** @type {import("esbuild").BuildOptions} */
const sharedOptions = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome116"],
  charset: "utf8",
  minify: !isWatch,
  sourcemap: isWatch ? "inline" : false,
  legalComments: "none",
  logLevel: "info"
};

async function run() {
  if (!isWatch) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  copyStaticAssets();

  const backgroundOptions = {
    ...sharedOptions,
    entryPoints: [path.join(ROOT, "src", "background.ts")],
    outfile: path.join(DIST, "background.js")
  };

  const contentOptions = {
    ...sharedOptions,
    entryPoints: [path.join(ROOT, "src", "content.ts")],
    outfile: path.join(DIST, "content.js")
  };

  if (isWatch) {
    const [bgCtx, contentCtx] = await Promise.all([
      esbuild.context(backgroundOptions),
      esbuild.context(contentOptions)
    ]);
    await Promise.all([bgCtx.watch(), contentCtx.watch()]);
    console.log("Watching src/ for changes -> dist/ ...");
  } else {
    await Promise.all([
      esbuild.build(backgroundOptions),
      esbuild.build(contentOptions)
    ]);
    console.log("Production extension built cleanly in dist/:");
    printBundleSummary();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
