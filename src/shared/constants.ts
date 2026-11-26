import type { UserSettings } from "./types";

export const HOST_ID = "uni-attend-ai-host";
export const STYLE_ID = "ua-injected-styles";

export const SPEECH_COOLDOWN_MS = 650;
export const FLATLINE_FRAME_THRESHOLD = 105; // ~1.75s at 60fps
export const TTS_SAFETY_TIMEOUT_MS = 4800;
export const TTS_POST_SPEECH_DELAY_MS = 120;
export const TTS_FETCH_TIMEOUT_MS = 3500;
export const TTS_CLOUD_COOLDOWN_MS = 60_000;

export const ALLOWED_TTS_LANGS = new Set(["ar", "en", "en-US", "en-GB", "en-AU"]);
export const MAX_TTS_TEXT_LEN = 120;
export const MAX_TTS_CACHE_ENTRIES = 60;
export const MAX_TTS_AUDIO_BYTES = 512 * 1024; // 512 KB hard cap on upstream TTS audio payload

export const MAX_KEYWORD_LENGTH = 60;
export const MAX_KEYWORDS_PER_LIST = 200;

export const SESSION_STORAGE_PREFIX = "uniattend:session:";

export const DEFAULT_PRESENT_KEYWORDS: readonly string[] = [
  // Arabic (includes intentional clipped/misheard STT fragments like "حا", "حاض", "حاظر", "ر" seen in real classrooms)
  "نعم",
  "موجود",
  "موجودة",
  "موجوده",
  "حاضر",
  "حاضره",
  "حاضرة",
  "هلا",
  "اه",
  "أه",
  "آه",
  "حا",
  "حاض",
  "حاظر",
  "ر",
  "ايوه",
  "أيوه",
  "ايه",
  "أجل",
  "معك",
  "تمام",
  "صح",
  "هون",
  "هيني",
  "انا",
  "أنا",
  "شغال",
  "ماشي",
  "طيب",
  "حاضر دكتور",
  "موجود دكتور",
  "نعم دكتور",
  "اه دكتور",
  "عاش",
  // English
  "yes",
  "yeah",
  "yep",
  "here",
  "present",
  "okay",
  "ok",
  "attend",
  "attending",
  "in",
  "available",
  "ready",
  "sir",
  "doctor",
  "prof",
  "yo",
  "aye",
  // Phonetic (when Arabic recognizer transcribes English)
  "يس",
  "ياس",
  "ياه",
  "هير",
  "هيير",
  "اوكي",
  "أوكي",
  "اوك",
  "برنت",
  "برزنت",
  "بريزنت"
];

export const DEFAULT_ABSENT_KEYWORDS: readonly string[] = [
  // Arabic
  "غائب",
  "غايب",
  "غائبة",
  "غايبة",
  "غائبه",
  "غايبه",
  "غياب",
  "مش موجود",
  "مو موجود",
  "مش هون",
  "مو هون",
  "لا",
  "تجاوز",
  "التالي",
  "سكب",
  "طلع",
  "سحب",
  "اعتذر",
  "مفقود",
  // English
  "absent",
  "no",
  "not here",
  "skip",
  "next",
  "missing",
  "away",
  // Phonetic
  "ابسنت",
  "أبسنت",
  "سكيب",
  "نكست"
];

export function createDefaultSettings(): UserSettings {
  return {
    ttsEnabled: true,
    firstTwoNamesOnly: true,
    ttsVoice: "cloud-auto",
    ttsRate: 1.05,
    ttsVolume: 2.0,
    timerEnabled: true,
    timerDuration: 5,
    micGain: 2.5,
    colorPageRows: true,
    langMode: "ar-JO",
    invertMode: true,
    soundEffects: true,
    hudWidth: 380,
    presentKeywords: [...DEFAULT_PRESENT_KEYWORDS],
    absentKeywords: [...DEFAULT_ABSENT_KEYWORDS]
  };
}

export const DEFAULT_SETTINGS: UserSettings = createDefaultSettings();

export const HIGHLIGHT_CSS = `
  .ua-cb-active {
    outline: 3px solid #3b82f6 !important;
    outline-offset: 2px !important;
    box-shadow: 0 0 10px rgba(59, 130, 246, 0.75) !important;
  }
  .ua-row-active {
    outline: 2px solid #3b82f6 !important;
    background-color: rgba(59, 130, 246, 0.11) !important;
    transition: background-color 0.15s ease !important;
  }
  .ua-row-present {
    background-color: rgba(16, 185, 129, 0.13) !important;
  }
  .ua-row-absent {
    background-color: rgba(239, 68, 68, 0.15) !important;
  }
  .ua-pick-cursor, .ua-pick-cursor * {
    cursor: crosshair !important;
  }
  .ua-jump-mode .ua-row-jumpable, .ua-jump-mode .ua-row-jumpable * {
    cursor: pointer !important;
  }
  .ua-jump-mode .ua-row-jumpable:hover {
    outline: 2px dashed #38bdf8 !important;
    background-color: rgba(56, 189, 248, 0.14) !important;
  }
`;
