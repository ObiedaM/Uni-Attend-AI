import {
  ALLOWED_TTS_LANGS,
  MAX_TTS_AUDIO_BYTES,
  MAX_TTS_CACHE_ENTRIES,
  MAX_TTS_TEXT_LEN,
  TTS_FETCH_TIMEOUT_MS
} from "./shared/constants";
import type { ExtensionMessage, TtsErrorCode, TtsFetchResponse } from "./shared/types";

const RESTRICTED_URL_REGEX =
  /^(chrome|edge|about|chrome-extension|chrome-search|devtools|view-source):|^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com|microsoftedge\.microsoft\.com\/addons)/i;

const ttsCache = new Map<string, string>();
let cachedLogoDataUrl: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(""));
}

function getLruCache(key: string): string | undefined {
  const val = ttsCache.get(key);
  if (val === undefined) return undefined;
  // True LRU: refresh recency on cache hit
  ttsCache.delete(key);
  ttsCache.set(key, val);
  return val;
}

function setBoundedLruCache(key: string, value: string): void {
  if (ttsCache.has(key)) ttsCache.delete(key);
  ttsCache.set(key, value);
  if (ttsCache.size > MAX_TTS_CACHE_ENTRIES) {
    const oldestKey = ttsCache.keys().next().value;
    if (oldestKey !== undefined) {
      ttsCache.delete(oldestKey);
    }
  }
}

async function getLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const res = await fetch(chrome.runtime.getURL("icons/icon48.png"));
    if (!res.ok) return "";
    const buf = await res.arrayBuffer();
    cachedLogoDataUrl = `data:image/png;base64,${arrayBufferToBase64(buf)}`;
    return cachedLogoDataUrl;
  } catch (_) {
    return "";
  }
}

function flashErrorBadge(tabId: number): void {
  chrome.action.setBadgeText({ tabId, text: "!" }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#ef4444" }).catch(() => {});
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  }, 1500);
}

async function toggleOnTab(tab: chrome.tabs.Tab | undefined): Promise<void> {
  if (!tab?.id || !tab.url) return;
  const tabId = tab.id;

  // Block injection attempts on restricted browser/store internal pages
  if (RESTRICTED_URL_REGEX.test(tab.url)) {
    flashErrorBadge(tabId);
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, { action: "TOGGLE_HUD" } satisfies ExtensionMessage);
  } catch (_) {
    // Content script not injected yet -> inject cleanly on demand
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
    } catch (_) {
      flashErrorBadge(tabId);
    }
  }
}

async function fetchNativeTts(rawText: string, rawLang: string): Promise<TtsFetchResponse> {
  // eslint-disable-next-line no-control-regex
  const cleanText = String(rawText || "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, MAX_TTS_TEXT_LEN);
  const lang = ALLOWED_TTS_LANGS.has(rawLang) ? rawLang : "ar";

  if (!cleanText) {
    return { ok: false, error: "Empty text", errorCode: "empty" };
  }

  const cacheKey = `${lang}|${cleanText}`;
  const cachedBase64 = getLruCache(cacheKey);
  if (cachedBase64) {
    return { ok: true, base64: cachedBase64, cached: true };
  }

  const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(cleanText)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTS_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });

    if (!res.ok) {
      const errorCode: TtsErrorCode = res.status === 429 || res.status === 503 ? "rate_limited" : "http_error";
      return { ok: false, error: `HTTP ${res.status}`, errorCode };
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.includes("audio/") && !contentType.includes("octet-stream")) {
      return { ok: false, error: "Unexpected TTS content type", errorCode: "http_error" };
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_TTS_AUDIO_BYTES) {
      return { ok: false, error: "Invalid TTS audio payload size", errorCode: "http_error" };
    }

    const base64 = arrayBufferToBase64(buffer);
    setBoundedLruCache(cacheKey, base64);
    return { ok: true, base64, cached: false };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Request timed out", errorCode: "timeout" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
      errorCode: "offline"
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Toolbar icon click
chrome.action.onClicked.addListener((tab) => {
  void toggleOnTab(tab);
});

// Global keyboard shortcut (Alt+A)
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-hud") return;
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    await toggleOnTab(activeTab);
  }
});

// Strict internal message handler (sender.id verified)
chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (!msg || typeof msg !== "object" || !("action" in msg)) return false;

  const action = (msg as { action: unknown }).action;

  if (action === "GET_LOGO") {
    getLogoDataUrl().then((dataUrl) => sendResponse({ ok: true, dataUrl }));
    return true;
  }

  if (action === "FETCH_NATIVE_TTS") {
    const payload = msg as { text?: unknown; lang?: unknown };
    const text = typeof payload.text === "string" ? payload.text : "";
    const lang = typeof payload.lang === "string" ? payload.lang : "ar";
    fetchNativeTts(text, lang).then((result) => sendResponse(result));
    return true;
  }

  return false;
});
