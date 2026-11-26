import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const DEMO_DIR = path.join(ROOT_DIR, "demo");
const CONTENT_BUNDLE_PATH = path.join(DIST_DIR, "content.js");

let server: http.Server;
let baseUrl: string;
let context: BrowserContext;
let userDataDir: string;

function startDemoServer(): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const urlPath = (req.url || "/").split("?")[0];
      const safeName = path.basename(urlPath);
      const filePath = path.join(DEMO_DIR, safeName);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(filePath).pipe(res);
    });
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Unexpected server address"));
        return;
      }
      resolve({ server: srv, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

/**
 * Installs a lightweight chrome.* test bridge in the page world before simulating
 * on-demand injection of dist/content.js (mirrors chrome.scripting.executeScript
 * without weakening manifest.json with persistent content_scripts or <all_urls>).
 */
async function attachChromeBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const STORAGE_KEY = "__uniattend_test_storage__";
    const readStore = (): Record<string, unknown> => {
      try {
        return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Record<
          string,
          unknown
        >;
      } catch {
        return {};
      }
    };
    const writeStore = (data: Record<string, unknown>): void => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // ignore
      }
    };

    const listeners: Array<(msg: unknown, sender: { id: string }) => void> = [];
    const chromeMock = {
      runtime: {
        id: "test-extension-id",
        lastError: null as null | { message: string },
        sendMessage: (
          msg: { action?: string },
          cb?: (res: Record<string, unknown>) => void
        ): void => {
          if (!cb) return;
          if (msg?.action === "GET_LOGO") {
            cb({ ok: true, dataUrl: "" });
            return;
          }
          if (msg?.action === "FETCH_NATIVE_TTS") {
            cb({ ok: false, errorCode: "offline", error: "Offline in test" });
            return;
          }
          cb({ ok: false });
        },
        onMessage: {
          addListener: (fn: (msg: unknown, sender: { id: string }) => void): void => {
            listeners.push(fn);
          }
        }
      },
      storage: {
        local: {
          get: (
            defaults: Record<string, unknown>,
            cb: (items: Record<string, unknown>) => void
          ): void => {
            const stored = readStore();
            cb({ ...defaults, ...stored });
          },
          set: (items: Record<string, unknown>, cb?: () => void): void => {
            const current = readStore();
            writeStore({ ...current, ...items });
            cb?.();
          }
        }
      }
    };

    (window as unknown as Record<string, unknown>).chrome = chromeMock;
    (window as unknown as Record<string, unknown>).__dispatchExtensionToggle = () => {
      listeners.forEach((fn) => fn({ action: "TOGGLE_HUD" }, { id: "test-extension-id" }));
    };
  });
}

async function injectContentScriptOnDemand(page: Page): Promise<void> {
  await page.addScriptTag({ path: CONTENT_BUNDLE_PATH });
  await expect(page.locator("#uni-attend-ai-host")).toBeAttached();
  // Ensure async loadSettings() + initial scanCheckboxes() completes
  await expect(page.locator("#uni-attend-ai-host >> #progressText")).not.toHaveText(
    "Student 0 / 0"
  );
}

test.beforeAll(async () => {
  expect(fs.existsSync(path.join(DIST_DIR, "manifest.json"))).toBe(true);
  expect(fs.existsSync(CONTENT_BUNDLE_PATH)).toBe(true);

  const started = await startDemoServer();
  server = started.server;
  baseUrl = started.baseUrl;

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "uniattend-pw-"));
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${DIST_DIR}`,
      `--load-extension=${DIST_DIR}`,
      "--no-sandbox"
    ]
  });
});

test.afterAll(async () => {
  if (context) {
    await context.close();
  }
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("MV3 extension loads cleanly with zero idle footprint and strict manifest rules", async () => {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }

  const manifestInfo = await serviceWorker.evaluate(async () => {
    const manifest = chrome.runtime.getManifest();
    const icon48Res = await fetch(chrome.runtime.getURL("icons/icon48.png"));
    const icon128Res = await fetch(chrome.runtime.getURL("icons/icon128.png"));
    const csp = manifest.content_security_policy;
    return {
      manifestVersion: manifest.manifest_version,
      hasContentScripts: Boolean(manifest.content_scripts?.length),
      hasWebAccessibleResources: Boolean(manifest.web_accessible_resources?.length),
      permissions: manifest.permissions || [],
      hasToggleCommand: Boolean(manifest.commands?.["toggle-hud"]),
      hasCsp: typeof csp === "object" && Boolean(csp?.extension_pages),
      iconsOk: icon48Res.ok && icon128Res.ok
    };
  });

  expect(manifestInfo.manifestVersion).toBe(3);
  expect(manifestInfo.hasContentScripts).toBe(false);
  expect(manifestInfo.hasWebAccessibleResources).toBe(false);
  expect(manifestInfo.permissions).toEqual(
    expect.arrayContaining(["activeTab", "scripting", "storage"])
  );
  expect(manifestInfo.hasToggleCommand).toBe(true);
  expect(manifestInfo.hasCsp).toBe(true);
  expect(manifestInfo.iconsOk).toBe(true);

  // Opening a portal page MUST NOT auto-inject the HUD (zero idle footprint)
  const page = await context.newPage();
  await page.goto(`${baseUrl}/test-portal.html`);
  await page.waitForTimeout(300);
  await expect(page.locator("#uni-attend-ai-host")).toHaveCount(0);
  await page.close();
});

test("test-portal.html: on-demand HUD, keyboard shortcuts, mode flip, and Absent CSV export", async () => {
  const page = await context.newPage();
  await attachChromeBridge(page);
  await page.goto(`${baseUrl}/test-portal.html`);
  await injectContentScriptOnDemand(page);

  const hud = page.locator("#uni-attend-ai-host");
  await expect(hud.locator("#progressText")).toHaveText("Student 1 / 10");
  await expect(hud.locator("#currentName")).toContainText("محمد عبدالسلام");

  // Default mode: Checked = Absent
  const checkboxes = page.locator('.student-row input[type="checkbox"]');

  // ArrowRight -> Student #1 Present (checkbox stays unchecked)
  await page.keyboard.press("ArrowRight");
  await expect(checkboxes.nth(0)).not.toBeChecked();
  await expect(hud.locator("#statPresent")).toHaveText("1");
  await expect(hud.locator("#progressText")).toHaveText("Student 2 / 10");

  // ArrowDown -> Student #2 Absent (checkbox becomes checked)
  await page.keyboard.press("ArrowDown");
  await expect(checkboxes.nth(1)).toBeChecked();
  await expect(hud.locator("#statAbsent")).toHaveText("1");
  await expect(hud.locator("#progressText")).toHaveText("Student 3 / 10");

  // ArrowDown -> Student #3 Absent (عبدالرحمن أحمد الكردي, 2024003)
  await page.keyboard.press("ArrowDown");
  await expect(checkboxes.nth(2)).toBeChecked();
  await expect(hud.locator("#statAbsent")).toHaveText("2");

  // ArrowLeft -> step back to Student #3
  await page.keyboard.press("ArrowLeft");
  await expect(hud.locator("#progressText")).toHaveText("Student 3 / 10");

  // Export Absent List -> CSV Backup download verification
  await hud.locator("#exportToggleBtn").click();
  await expect(hud.locator("#exportSummary")).toHaveText("Absent Students: 2");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    hud.locator("#downloadCsvBtn").click()
  ]);

  expect(download.suggestedFilename()).toMatch(/^uniattend-absent-\d{4}-\d{2}-\d{2}\.csv$/);
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const csvRaw = fs.readFileSync(downloadedPath!, "utf8");
  expect(csvRaw.startsWith("\uFEFF")).toBe(true);
  expect(csvRaw).toContain("Row,Student Name,Student ID,Status,Date");
  expect(csvRaw).toContain("2024002");
  expect(csvRaw).toContain("2024003");
  expect(csvRaw).toContain("عبدالرحمن أحمد الكردي");

  // Flip mode: Box Checked = Present
  await hud.locator("#modeSelect").selectOption("present");
  // Existing 2 checked boxes (#2, #3) now register as Present on re-scan
  await expect(hud.locator("#statPresent")).toHaveText("2");
  await expect(hud.locator("#statAbsent")).toHaveText("0");
  await expect(hud.locator("#progressText")).toHaveText("Student 1 / 10");

  // In Checked=Present mode: ArrowRight CHECKS box #1, ArrowDown UNCHECKS box #2
  await page.keyboard.press("ArrowRight");
  await expect(checkboxes.nth(0)).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(checkboxes.nth(1)).not.toBeChecked();

  await page.close();
});

test("primefaces-mock.html: PrimeFaces .ui-chkbox, same-origin iframe, and Pick 1st Checkbox column lock", async () => {
  const page = await context.newPage();
  await attachChromeBridge(page);
  await page.goto(`${baseUrl}/primefaces-mock.html`);
  await injectContentScriptOnDemand(page);

  const hud = page.locator("#uni-attend-ai-host");

  // Auto-scan detects 3 Excused + 3 Absent PrimeFaces boxes + 2 same-origin iframe boxes = 8
  // (Header Select-All checkbox inside <thead> is automatically ignored)
  await expect(hud.locator("#progressText")).toHaveText("Student 1 / 8");

  // Use Pick 1st Checkbox to lock strictly onto the "Absent" column (3 PrimeFaces rows)
  await hud.locator("#pickBtn").click();
  await page.locator('tr[data-student-row="1"] .ui-chkbox-box[data-col="absent"]').click();

  await expect(hud.locator("#progressText")).toHaveText("Student 1 / 3");
  await expect(hud.locator("#currentName")).toContainText("عبد الرحمن محمد علي");

  // Mark Student #1 Absent (ArrowDown) -> PrimeFaces Absent box checks & activates, Excused stays unchecked
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('input[name="absent_1"]')).toBeChecked();
  await expect(
    page.locator('tr[data-student-row="1"] .ui-chkbox-box[data-col="absent"]')
  ).toHaveClass(/ui-state-active/);
  await expect(page.locator('input[name="excused_1"]')).not.toBeChecked();

  // Verify cursor advanced to Student #2 (صلاح الدين الأيوبي حسن)
  await expect(hud.locator("#progressText")).toHaveText("Student 2 / 3");
  await expect(hud.locator("#currentName")).toContainText("صلاح الدين الأيوبي حسن");

  // Verify same-origin iframe checkbox can also be locked and marked
  await hud.locator("#pickBtn").click();
  await page.frameLocator("#rosterIframe").locator('input[name="iframe_1"]').click();
  await expect(hud.locator("#progressText")).toHaveText("Student 1 / 2");
  await expect(hud.locator("#currentName")).toContainText("طارق زياد الشريف");
  await page.keyboard.press("ArrowDown");
  await expect(page.frameLocator("#rosterIframe").locator('input[name="iframe_1"]')).toBeChecked();

  await page.close();
});

test("Phase 2 UX: Click-Row-to-Jump, Custom Keywords drawer, and Session Recovery after reload", async () => {
  const page = await context.newPage();
  await attachChromeBridge(page);
  await page.goto(`${baseUrl}/test-portal.html`);
  await injectContentScriptOnDemand(page);

  const hud = page.locator("#uni-attend-ai-host");
  const rows = page.locator(".student-row");

  // Mark Student #1 Present and Student #2 Absent
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(hud.locator("#progressText")).toHaveText("Student 3 / 10");

  // 1. Alt + Click Student #7 row -> jumps directly without toggling its checkbox
  await rows.nth(6).click({ modifiers: ["Alt"] });
  await expect(hud.locator("#progressText")).toHaveText("Student 7 / 10");
  await expect(rows.nth(6).locator('input[type="checkbox"]')).not.toBeChecked();

  // 2. Quick Jump toggle -> click Student #4 row -> jumps & exits jump mode
  await hud.locator("#jumpBtn").click();
  await rows.nth(3).click();
  await expect(hud.locator("#progressText")).toHaveText("Student 4 / 10");
  await expect(hud.locator("#jumpBtn")).toHaveText("📍 Jump Row");

  // 3. Custom Keywords drawer: add custom word (typing space/arrows inside input must NOT mark students)
  await hud.locator("#keywordsToggleBtn").click();
  const kwInput = hud.locator("#kwInput");
  await kwInput.fill("متواجد الآن");
  await kwInput.press("Enter");
  await expect(hud.locator("#kwChips")).toContainText("متواجد الآن");
  await expect(hud.locator("#progressText")).toHaveText("Student 4 / 10");

  // Reset keywords to defaults
  await hud.locator("#resetKeywordsBtn").click();
  await expect(hud.locator("#kwChips")).not.toContainText("متواجد الآن");

  // 4. Session Recovery Guard: reload page (wiping unsaved DOM checkboxes) and re-open HUD
  await page.reload();
  await injectContentScriptOnDemand(page);

  await expect(hud.locator("#recoveryBanner")).toHaveClass(/visible/);
  await expect(hud.locator("#recoveryText")).toContainText("2 saved marks");

  await hud.locator("#restoreSessionBtn").click();
  await expect(hud.locator("#recoveryBanner")).not.toHaveClass(/visible/);
  await expect(rows.nth(0).locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(rows.nth(1).locator('input[type="checkbox"]')).toBeChecked();
  await expect(hud.locator("#statPresent")).toHaveText("1");
  await expect(hud.locator("#statAbsent")).toHaveText("1");
  await expect(hud.locator("#progressText")).toHaveText("Student 3 / 10");

  await page.close();
});
