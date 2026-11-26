import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const MANIFEST_PATH = path.join(PUBLIC_DIR, "manifest.json");
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

const isWatch = process.argv.includes("--watch");
const isPackage = process.argv.includes("--package");
const isAudit = process.argv.includes("--audit");

function copyDirRecursive(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, dstPath);
    else fs.copyFileSync(srcPath, dstPath);
  }
}

function syncManifestVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const version = String(pkg.version || "").trim();
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) {
    throw new Error(`Invalid extension version in package.json: "${version}"`);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  if (manifest.version !== version) {
    manifest.version = version;
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`Synced public/manifest.json version -> ${version}`);
  }
  return version;
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

async function buildExtension() {
  if (!isWatch) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  copyDirRecursive(PUBLIC_DIR, DIST);

  const bgOpts = {
    ...sharedOptions,
    entryPoints: [path.join(ROOT, "src", "background.ts")],
    outfile: path.join(DIST, "background.js")
  };
  const contentOpts = {
    ...sharedOptions,
    entryPoints: [path.join(ROOT, "src", "content.ts")],
    outfile: path.join(DIST, "content.js")
  };

  if (isWatch) {
    const [bgCtx, contentCtx] = await Promise.all([
      esbuild.context(bgOpts),
      esbuild.context(contentOpts)
    ]);
    await Promise.all([bgCtx.watch(), contentCtx.watch()]);
    console.log("Watching src/ -> dist/ ...");
    return;
  }

  await Promise.all([esbuild.build(bgOpts), esbuild.build(contentOpts)]);
  const bgKb = (fs.statSync(path.join(DIST, "background.js")).size / 1024).toFixed(1);
  const contentKb = (fs.statSync(path.join(DIST, "content.js")).size / 1024).toFixed(1);
  console.log(`Built dist/ cleanly: background.js (${bgKb} KB), content.js (${contentKb} KB)`);
}

function runSecurityAudit() {
  const failures = [];
  const manifestPath = path.join(DIST, "manifest.json");
  const bgPath = path.join(DIST, "background.js");
  const contentPath = path.join(DIST, "content.js");

  for (const required of [manifestPath, bgPath, contentPath]) {
    if (!fs.existsSync(required)) {
      throw new Error(`Security audit requires built dist/ files (missing ${required}). Run npm run build first.`);
    }
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const bgCode = fs.readFileSync(bgPath, "utf8");
  const contentCode = fs.readFileSync(contentPath, "utf8");
  const combinedCode = `${bgCode}\n${contentCode}`;

  // 1. Manifest least-privilege verification
  if (manifest.manifest_version !== 3) failures.push("manifest_version must be 3");
  if (manifest.content_scripts?.length) failures.push("Persistent content_scripts are forbidden");
  if (manifest.web_accessible_resources?.length) failures.push("web_accessible_resources must be empty");

  const perms = [...(manifest.permissions || [])].sort();
  if (JSON.stringify(perms) !== JSON.stringify(["activeTab", "scripting", "storage"])) {
    failures.push(`Unexpected permissions: ${perms.join(", ")}`);
  }

  const hosts = [...(manifest.host_permissions || [])];
  if (JSON.stringify(hosts) !== JSON.stringify(["https://translate.googleapis.com/*"])) {
    failures.push(`Unexpected host_permissions: ${hosts.join(", ")}`);
  }

  const csp = manifest.content_security_policy?.extension_pages || "";
  if (!csp.includes("script-src 'self'") || !csp.includes("object-src 'none'")) {
    failures.push(`Strict extension_pages CSP missing: "${csp}"`);
  }

  // 2. Dangerous dynamic execution / XSS sink scan across compiled bundles
  const forbiddenPatterns = [
    { name: "eval()", regex: /\beval\s*\(/ },
    { name: "new Function()", regex: /\bnew\s+Function\s*\(/ },
    { name: "document.write()", regex: /\bdocument\.write\s*\(/ },
    { name: "outerHTML", regex: /\bouterHTML\b/ },
    { name: "remote <script> tag", regex: /<script\b/i }
  ];
  for (const check of forbiddenPatterns) {
    if (check.regex.test(combinedCode)) {
      failures.push(`Forbidden security sink detected in dist/: ${check.name}`);
    }
  }

  // 3. Verify every outbound HTTP(S) URL in the compiled extension is allowlisted
  const rawUrls = Array.from(new Set(combinedCode.match(/https?:\/\/[^\s"'`\\)<>]+/g) || []));
  const urls = rawUrls.map((u) => u.split("?")[0]);
  const allowedUrlPrefixes = ["https://translate.googleapis.com/translate_tts"];
  for (const url of urls) {
    if (!allowedUrlPrefixes.some((prefix) => url.startsWith(prefix))) {
      failures.push(`Unallowlisted external URL in dist/: ${url}`);
    }
  }

  // 4. Verify runtime sender validation & hard hardware mic teardown exist in bundles
  if (!bgCode.includes("chrome.runtime.id")) {
    failures.push("background.js missing sender.id === chrome.runtime.id check");
  }
  if (!contentCode.includes("chrome.runtime.id")) {
    failures.push("content.js missing sender.id === chrome.runtime.id check");
  }
  if (!contentCode.includes("pagehide") || !contentCode.includes("getTracks")) {
    failures.push("content.js missing hard pagehide MediaStreamTrack teardown");
  }

  if (failures.length > 0) {
    console.error("\nSecurity Audit FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("\nSecurity & Privacy Audit PASSED (dist/):");
  console.log("  [OK] Manifest V3 least-privilege (zero content_scripts, zero web_accessible_resources)");
  console.log("  [OK] Strict CSP: script-src 'self'; object-src 'none';");
  console.log("  [OK] Zero dangerous sinks (no eval, Function, document.write, outerHTML, <script>)");
  console.log(`  [OK] Outbound endpoints in bundle (${urls.length}): ${urls.join(", ") || "none"}`);
  console.log("  [OK] Strict sender.id validation & hard pagehide mic teardown verified");
}

async function packageRelease(version) {
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

  const verifyZip = await JSZip.loadAsync(zipBuffer);
  const actualEntries = Object.values(verifyZip.files)
    .filter((e) => !e.dir)
    .map((e) => e.name)
    .sort();
  const expectedEntries = [...RUNTIME_FILES].sort();

  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(
      `Release zip integrity mismatch. Expected ${expectedEntries.join(", ")}, got ${actualEntries.join(", ")}`
    );
  }

  const sha256 = crypto.createHash("sha256").update(zipBuffer).digest("hex");
  const checksumPath = path.join(RELEASE_DIR, "SHA256SUMS.txt");
  fs.writeFileSync(checksumPath, `${sha256}  ${zipName}\n`, "utf8");

  const sizeKb = (zipBuffer.length / 1024).toFixed(1);
  console.log(`\nPackaged release cleanly:`);
  console.log(`  release/${zipName} (${sizeKb} KB)`);
  console.log(`  SHA-256: ${sha256}`);
  console.log(`  Entries: ${actualEntries.join(", ")}`);
}

async function run() {
  if (isAudit) {
    runSecurityAudit();
    return;
  }

  if (isPackage) {
    const version = syncManifestVersion();
    await buildExtension();
    runSecurityAudit();
    await packageRelease(version);
    return;
  }

  await buildExtension();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
