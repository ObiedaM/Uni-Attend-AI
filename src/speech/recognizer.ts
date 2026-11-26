import type { BrowserSpeechRecognition, LanguageMode } from "../shared/types";

export interface SpeechControllerCallbacks {
  isRunning: () => boolean;
  isSpeakingName: () => boolean;
  isHardwareMuted: () => boolean;
  getLangMode: () => LanguageMode;
  onSpeechActivityUnmute: () => void;
  onFreshSlice: (freshSlice: string) => boolean;
  onStatusMessage: (message: string) => void;
  onPermissionBlocked: (message: string) => void;
  onAudioCaptureError: (message: string) => void;
}

/**
 * Manages webkitSpeechRecognition lifecycle with:
 * - Interim real-time slices (zero debounce drag)
 * - Echo suppression while TTS speaks a student's name
 * - Clean auto-restart on stream timeout and hard abort on stop/pause/close
 */
export class SpeechController {
  private recognition: BrowserSpeechRecognition | null = null;
  private processedCharCounts = new Map<number, number>();
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly callbacks: SpeechControllerCallbacks) {}

  public start(langMode: LanguageMode): void {
    this.processedCharCounts.clear();
    if (!this.recognition) {
      this.init();
    }
    if (!this.recognition) return;

    try {
      this.recognition.lang = langMode;
      this.recognition.start();
    } catch (_) {}
  }

  public ensureStarted(): void {
    if (!this.recognition) return;
    try {
      this.recognition.start();
    } catch (_) {}
  }

  public restartForLanguage(): void {
    if (!this.recognition) return;
    try {
      this.recognition.stop();
    } catch (_) {}
  }

  public retry(langMode: LanguageMode): void {
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.abort();
      } catch (_) {}
      this.recognition = null;
    }
    this.start(langMode);
  }

  public stop(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.processedCharCounts.clear();
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.abort();
      } catch (_) {}
      this.recognition = null;
    }
  }

  private init(): void {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      this.callbacks.onStatusMessage("⚠️ Use Chrome or Edge for Speech API");
      return;
    }

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.lang = this.callbacks.getLangMode();

    rec.onresult = (event) => {
      if (!this.callbacks.isRunning()) return;
      if (this.callbacks.isHardwareMuted()) {
        this.callbacks.onSpeechActivityUnmute();
      }

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || "";

        // Suppress self-echo while TTS is calling a student's name
        if (this.callbacks.isSpeakingName()) {
          this.processedCharCounts.set(i, transcript.length);
          continue;
        }

        const prevLen = this.processedCharCounts.get(i) || 0;
        const freshSlice = transcript.slice(prevLen);

        if (freshSlice.trim().length > 0) {
          const matchedAndAdvanced = this.callbacks.onFreshSlice(freshSlice);
          if (matchedAndAdvanced) {
            this.processedCharCounts.set(i, transcript.length);
            break;
          }
        }
      }
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.callbacks.onPermissionBlocked("⚠️ Microphone permission blocked");
      } else if (e.error === "audio-capture") {
        this.callbacks.onAudioCaptureError(
          "🔇 Mic capture failed — check laptop mic-mute key!"
        );
      } else if (e.error === "network") {
        this.callbacks.onStatusMessage("⚠️ Speech network glitch — retrying...");
      }
    };

    rec.onend = () => {
      this.processedCharCounts.clear();
      if (!this.callbacks.isRunning()) return;
      this.restartTimer = setTimeout(() => {
        if (!this.callbacks.isRunning() || !this.recognition) return;
        try {
          this.recognition.lang = this.callbacks.getLangMode();
          this.recognition.start();
        } catch (_) {}
      }, 120);
    };

    this.recognition = rec;
  }
}
