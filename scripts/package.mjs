import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "public", "manifest.json");
const DIST = path.join(ROOT, "dist");
const RELEASE_DIR = path.join(ROOT, "release");

const RUNTIME_FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png"
];

function syncManifestVersion() {
  const pkgPath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const version = String(pkg.version || "").trim();
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) {
    throw new Error(`Invalid extension version in package.json: "${version}"`);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  if (manifest.version !== version) {
    manifest.version = version;
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`Synced public/manifest.json version -> ${version}`);
  } else {
    console.log(`public/manifest.json version already synced (${version})`);
  }

  return version;
}

function buildProductionDist() {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "build.mjs")], {
    cwd: ROOT,
    stdio: "inherit"
  });
}

async function createReleaseZip(version) {
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  const zipName = `UniAttend-AI-v${version}.zip`;
  const zipPath = path.join(RELEASE_DIR, zipName);

  const zip = new JSZip();
  for (const relPath of RUNTIME_FILES) {
    const filePath = path.join(DIST, relPath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing required runtime file in dist/: ${relPath}`);
    }
    zip.file(relPath, fs.readFileSync(filePath));
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 }
  });

  fs.writeFileSync(zipPath, zipBuffer);

  // Verify zip contents contain ONLY the expected runtime files (excluding directory stubs)
  const verifyZip = await JSZip.loadAsync(zipBuffer);
  const actualEntries = Object.values(verifyZip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name)
    .sort();
  const expectedEntries = [...RUNTIME_FILES].sort();

  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(
      `Release zip integrity mismatch. Expected ${expectedEntries.join(", ")}, got ${actualEntries.join(", ")}`
    );
  }

  const sizeKb = (zipBuffer.length / 1024).toFixed(1);
  console.log(`\nPackaged release archive cleanly:`);
  console.log(`  release/${zipName} (${sizeKb} KB)`);
  console.log(`  Entries: ${actualEntries.join(", ")}`);
}

async function run() {
  const version = syncManifestVersion();
  buildProductionDist();
  await createReleaseZip(version);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
