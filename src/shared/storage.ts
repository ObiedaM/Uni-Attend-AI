import {
  createDefaultSettings,
  DEFAULT_ABSENT_KEYWORDS,
  DEFAULT_PRESENT_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  MAX_KEYWORDS_PER_LIST
} from "./constants";
import type { ExtensionMessage, LanguageMode, UserSettings } from "./types";

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeLangMode(value: unknown, fallback: LanguageMode): LanguageMode {
  return value === "ar-JO" || value === "en-US" ? value : fallback;
}

function sanitizeVoiceChoice(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, 140);
  return trimmed || fallback;
}

function sanitizeKeywordList(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, MAX_KEYWORD_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS_PER_LIST);
}

/**
 * Validates and clamps a raw persisted settings object so corrupted storage
 * values can never break HUD sliders, voice playback, or timers.
 */
export function sanitizeSettings(raw: Record<string, unknown> | null | undefined): UserSettings {
  const defaults = createDefaultSettings();
  if (!raw || typeof raw !== "object") return defaults;

  return {
    ttsEnabled: sanitizeBoolean(raw.ttsEnabled, defaults.ttsEnabled),
    firstTwoNamesOnly: sanitizeBoolean(raw.firstTwoNamesOnly, defaults.firstTwoNamesOnly),
    ttsVoice: sanitizeVoiceChoice(raw.ttsVoice, defaults.ttsVoice),
    ttsRate: clampNumber(raw.ttsRate, 0.8, 1.5, defaults.ttsRate),
    ttsVolume: clampNumber(raw.ttsVolume, 0.5, 3.0, defaults.ttsVolume),
    timerEnabled: sanitizeBoolean(raw.timerEnabled, defaults.timerEnabled),
    timerDuration: clampNumber(raw.timerDuration, 2, 15, defaults.timerDuration),
    micGain: clampNumber(raw.micGain, 1, 5, defaults.micGain),
    colorPageRows: sanitizeBoolean(raw.colorPageRows, defaults.colorPageRows),
    langMode: sanitizeLangMode(raw.langMode, defaults.langMode),
    invertMode: sanitizeBoolean(raw.invertMode, defaults.invertMode),
    soundEffects: sanitizeBoolean(raw.soundEffects, defaults.soundEffects),
    hudWidth: Math.round(clampNumber(raw.hudWidth, 320, 640, defaults.hudWidth)),
    presentKeywords: sanitizeKeywordList(raw.presentKeywords, DEFAULT_PRESENT_KEYWORDS),
    absentKeywords: sanitizeKeywordList(raw.absentKeywords, DEFAULT_ABSENT_KEYWORDS)
  };
}

export function loadSettings(): Promise<UserSettings> {
  return new Promise((resolve) => {
    const defaults = createDefaultSettings();
    try {
      chrome.storage.local.get(defaults, (stored) => {
        if (!chrome.runtime.lastError && stored) {
          resolve(sanitizeSettings(stored));
          return;
        }
        resolve(defaults);
      });
    } catch (_) {
      resolve(defaults);
    }
  });
}

export function saveSettings(settings: UserSettings): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    const clean = sanitizeSettings(settings as unknown as Record<string, unknown>);
    try {
      chrome.storage.local.set(clean);
    } catch (_) {}
  }, 150);
}

export function sendRuntimeMessage<T>(message: ExtensionMessage): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response: T | undefined) => {
        if (chrome.runtime.lastError || response === undefined) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (_) {
      resolve(null);
    }
  });
}
