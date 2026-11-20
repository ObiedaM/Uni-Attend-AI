const ALLOWED_TTS_LANGS = new Set(["ar", "en", "en-US", "en-GB", "en-AU"]);
const MAX_TTS_TEXT_LEN = 120;
const MAX_CACHE_ENTRIES = 60;
const ttsCache = new Map();
let cachedLogoDataUrl = null;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(""));
}

function setBoundedCache(key, value) {
  if (ttsCache.has(key)) ttsCache.delete(key);
  ttsCache.set(key, value);
  if (ttsCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = ttsCache.keys().next().value;
    ttsCache.delete(oldestKey);
  }
}

async function getLogoDataUrl() {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const res = await fetch(chrome.runtime.getURL("logo.png"));
    if (!res.ok) return "";
    const buf = await res.arrayBuffer();
    cachedLogoDataUrl = "data:image/png;base64," + arrayBufferToBase64(buf);
    return cachedLogoDataUrl;
  } catch (_) {
    return "";
  }
}

async function toggleOnTab(tab) {
  if (!tab?.id || !tab.url) return;
  // Block injection attempts on restricted browser internal pages
  if (/^(chrome|edge|about|chrome-extension|devtools):/i.test(tab.url)) {
    chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#ef4444" });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: "" }).catch(() => {}), 1500);
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_HUD" });
  } catch (_) {
    // Content script not injected yet -> inject cleanly on demand
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
    } catch (_) {
      chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
      chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#ef4444" });
      setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: "" }).catch(() => {}), 1500);
    }
  }
}

// Toolbar icon click
chrome.action.onClicked.addListener((tab) => {
  toggleOnTab(tab);
});

// Global keyboard shortcut (Alt+A)
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-hud") return;
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) toggleOnTab(activeTab);
});

// Strict internal message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  if (msg?.action === "GET_LOGO") {
    getLogoDataUrl().then((dataUrl) => sendResponse({ ok: true, dataUrl }));
    return true;
  }

  if (msg?.action === "FETCH_NATIVE_TTS") {
    const cleanText = String(msg.text || "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim()
      .slice(0, MAX_TTS_TEXT_LEN);

    const lang = ALLOWED_TTS_LANGS.has(msg.lang) ? msg.lang : "ar";
    if (!cleanText) {
      sendResponse({ ok: false, error: "Empty text" });
      return false;
    }

    const cacheKey = `${lang}|${cleanText}`;
    if (ttsCache.has(cacheKey)) {
      sendResponse({ ok: true, base64: ttsCache.get(cacheKey), cached: true });
      return false;
    }

    const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(cleanText)}`;

    fetch(url, {
      credentials: "omit",
      referrerPolicy: "no-referrer"
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buffer) => {
        const base64 = arrayBufferToBase64(buffer);
        setBoundedCache(cacheKey, base64);
        sendResponse({ ok: true, base64 });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });

    return true;
  }

  return false;
});