export type RowStatus = "pending" | "present" | "absent";

export type LanguageMode = "ar-JO" | "en-US";

export type TtsEngineStatus =
  | "idle"
  | "cloud"
  | "cloud-cached"
  | "os"
  | "fallback-os"
  | "rate-limited";

export interface UserSettings {
  ttsEnabled: boolean;
  firstTwoNamesOnly: boolean;
  ttsVoice: string;
  ttsRate: number;
  ttsVolume: number;
  timerEnabled: boolean;
  timerDuration: number;
  micGain: number;
  colorPageRows: boolean;
  langMode: LanguageMode;
  invertMode: boolean;
  soundEffects: boolean;
  hudWidth: number;
  presentKeywords: string[];
  absentKeywords: string[];
}

export interface StudentRow {
  checkbox: HTMLElement;
  visualBox: HTMLElement;
  rowEl: HTMLElement | null;
  nameText: string;
  studentId: string;
  fullSpeechName: string;
  shortSpeechName: string;
  status: RowStatus;
}

export interface CompiledDictionary {
  single: Set<string>;
  phrases: string[];
}

export type KeywordDecision = "present" | "absent" | null;

export interface AbsentExportEntry {
  rowNumber: number;
  name: string;
  studentId: string;
}

export interface SavedSessionSnapshot {
  savedAt: number;
  invertMode: boolean;
  marks: Record<string, "present" | "absent">;
}

export type ExtensionMessage =
  | { action: "TOGGLE_HUD" }
  | { action: "GET_LOGO" }
  | { action: "FETCH_NATIVE_TTS"; text: string; lang: string };

export interface LogoResponse {
  ok: boolean;
  dataUrl?: string;
}

export type TtsErrorCode = "empty" | "rate_limited" | "timeout" | "offline" | "http_error";

export interface TtsFetchResponse {
  ok: boolean;
  base64?: string;
  cached?: boolean;
  error?: string;
  errorCode?: TtsErrorCode;
}

export interface BrowserSpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

export interface BrowserSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): BrowserSpeechRecognitionAlternative;
  [index: number]: BrowserSpeechRecognitionAlternative;
}

export interface BrowserSpeechRecognitionResultList {
  readonly length: number;
  item(index: number): BrowserSpeechRecognitionResult;
  [index: number]: BrowserSpeechRecognitionResult;
}

export interface BrowserSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: BrowserSpeechRecognitionResultList;
}

export interface BrowserSpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

export interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}

declare global {
  interface Window {
    __uniAttendInjected?: boolean;
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitAudioContext?: typeof AudioContext;
  }
}
