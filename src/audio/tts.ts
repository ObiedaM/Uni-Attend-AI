import {
  MAX_TTS_CACHE_ENTRIES,
  TTS_CLOUD_COOLDOWN_MS,
  TTS_POST_SPEECH_DELAY_MS,
  TTS_SAFETY_TIMEOUT_MS
} from "../shared/constants";
import { sendRuntimeMessage } from "../shared/storage";
import type { StudentRow, TtsEngineStatus, TtsFetchResponse } from "../shared/types";
import type { AudioFeedbackEngine } from "./feedback";

export interface TtsSpeakOptions {
  row: StudentRow | undefined;
  enabled: boolean;
  force?: boolean;
  firstTwoNamesOnly: boolean;
  voiceChoice: string;
  rate: number;
  volumeGain: number;
  onStart?: (spokenText: string) => void;
  onStatusChange?: (status: TtsEngineStatus) => void;
  onComplete?: () => void;
}

export class TtsEngine {
  private activeBufferSource: AudioBufferSourceNode | null = null;
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;
  private postSpeechTimer: ReturnType<typeof setTimeout> | null = null;
  private osVoicesCache: SpeechSynthesisVoice[] = [];
  private decodedCache = new Map<string, AudioBuffer>();
  private speakToken = 0;
  private speaking = false;
  private cloudCooldownUntil = 0;
  private lastCloudFailureReason: "rate-limited" | "fallback-os" = "fallback-os";

  constructor(private readonly feedback: AudioFeedbackEngine) {}

  public isSpeaking(): boolean {
    return this.speaking;
  }

  public resetCloudCooldown(): void {
    this.cloudCooldownUntil = 0;
  }

  public getOsVoices(): SpeechSynthesisVoice[] {
    if ("speechSynthesis" in window) {
      const voices = window.speechSynthesis.getVoices() || [];
      if (voices.length > 0) {
        this.osVoicesCache = voices;
      }
    }
    return this.osVoicesCache;
  }

  public stop(): void {
    this.speakToken++;
    if (this.safetyTimer !== null) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    if (this.postSpeechTimer !== null) {
      clearTimeout(this.postSpeechTimer);
      this.postSpeechTimer = null;
    }
    if (this.activeBufferSource) {
      try {
        this.activeBufferSource.onended = null;
        this.activeBufferSource.stop();
      } catch (_) {}
      this.activeBufferSource = null;
    }
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    this.speaking = false;
  }

  public speakStudent(options: TtsSpeakOptions): void {
    const { row, enabled, force = false, firstTwoNamesOnly, voiceChoice, rate, volumeGain } = options;
    if ((!enabled && !force) || !row) {
      this.speaking = false;
      options.onComplete?.();
      return;
    }

    this.stop();
    const token = this.speakToken;

    const textToSpeak = firstTwoNamesOnly ? row.shortSpeechName : row.fullSpeechName;
    if (!textToSpeak || textToSpeak.startsWith("Student #")) {
      this.speaking = false;
      options.onComplete?.();
      return;
    }

    this.speaking = true;
    options.onStart?.(textToSpeak);

    const hasArabic = /[\u0600-\u06FF]/.test(textToSpeak);
    let finished = false;

    const finishSpeaking = (): void => {
      if (finished || token !== this.speakToken) return;
      finished = true;
      if (this.safetyTimer !== null) {
        clearTimeout(this.safetyTimer);
        this.safetyTimer = null;
      }
      this.postSpeechTimer = setTimeout(() => {
        if (token !== this.speakToken) return;
        this.speaking = false;
        options.onComplete?.();
      }, TTS_POST_SPEECH_DELAY_MS);
    };

    this.safetyTimer = setTimeout(finishSpeaking, TTS_SAFETY_TIMEOUT_MS);

    // 1. Explicit offline OS voice selected
    if (voiceChoice.startsWith("os:")) {
      const uri = voiceChoice.slice(3);
      options.onStatusChange?.("os");
      this.speakWithSystemVoice(textToSpeak, hasArabic, uri, rate, volumeGain, finishSpeaking);
      return;
    }

    const targetLang = this.resolveCloudLang(voiceChoice, hasArabic);
    const cacheKey = `${targetLang}|${textToSpeak}`;

    // 2. Instant (~0ms) playback from local decoded AudioBuffer LRU cache (works even if offline!)
    const cachedBuffer = this.getDecodedCache(cacheKey);
    if (cachedBuffer) {
      options.onStatusChange?.("cloud-cached");
      this.playAudioBuffer(cachedBuffer, rate, volumeGain, token, finishSpeaking);
      return;
    }

    // 3. Offline / Cloud rate-limit circuit breaker: avoid stalling attendance timer
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      options.onStatusChange?.("fallback-os");
      this.speakWithSystemVoice(textToSpeak, hasArabic, null, rate, volumeGain, finishSpeaking);
      return;
    }

    if (Date.now() < this.cloudCooldownUntil) {
      options.onStatusChange?.(this.lastCloudFailureReason);
      this.speakWithSystemVoice(textToSpeak, hasArabic, null, rate, volumeGain, finishSpeaking);
      return;
    }

    // 4. Fetch Base64 MP3 via service worker (CSP-proof) and decode in Web Audio memory
    void sendRuntimeMessage<TtsFetchResponse>({
      action: "FETCH_NATIVE_TTS",
      text: textToSpeak,
      lang: targetLang
    }).then((response) => {
      if (token !== this.speakToken || finished) return;

      if (!response?.ok || !response.base64) {
        const isRateLimited = response?.errorCode === "rate_limited";
        const fallbackStatus: TtsEngineStatus = isRateLimited ? "rate-limited" : "fallback-os";
        this.lastCloudFailureReason = fallbackStatus;
        this.cloudCooldownUntil = Date.now() + TTS_CLOUD_COOLDOWN_MS;
        options.onStatusChange?.(fallbackStatus);
        this.speakWithSystemVoice(textToSpeak, hasArabic, null, rate, volumeGain, finishSpeaking);
        return;
      }

      options.onStatusChange?.(response.cached ? "cloud-cached" : "cloud");
      this.decodeAndPlayBase64(cacheKey, response.base64, rate, volumeGain, token, finishSpeaking);
    });
  }

  private resolveCloudLang(voiceChoice: string, hasArabic: boolean): string {
    if (voiceChoice === "cloud-ar") return "ar";
    if (voiceChoice === "cloud-en-us") return "en-US";
    if (voiceChoice === "cloud-en-gb") return "en-GB";
    if (voiceChoice === "cloud-en-au") return "en-AU";
    return hasArabic ? "ar" : "en-US";
  }

  private getDecodedCache(key: string): AudioBuffer | undefined {
    const buf = this.decodedCache.get(key);
    if (!buf) return undefined;
    this.decodedCache.delete(key);
    this.decodedCache.set(key, buf);
    return buf;
  }

  private setDecodedCache(key: string, buffer: AudioBuffer): void {
    if (this.decodedCache.has(key)) this.decodedCache.delete(key);
    this.decodedCache.set(key, buffer);
    if (this.decodedCache.size > MAX_TTS_CACHE_ENTRIES) {
      const oldest = this.decodedCache.keys().next().value;
      if (oldest !== undefined) {
        this.decodedCache.delete(oldest);
      }
    }
  }

  private decodeAndPlayBase64(
    cacheKey: string,
    base64Str: string,
    rate: number,
    volumeGain: number,
    token: number,
    onFinish: () => void
  ): void {
    try {
      const binary = atob(base64Str);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const ctx = this.feedback.getContext();
      ctx.decodeAudioData(
        bytes.buffer,
        (audioBuffer) => {
          if (token !== this.speakToken) return;
          this.setDecodedCache(cacheKey, audioBuffer);
          this.playAudioBuffer(audioBuffer, rate, volumeGain, token, onFinish);
        },
        () => onFinish()
      );
    } catch (_) {
      onFinish();
    }
  }

  private playAudioBuffer(
    audioBuffer: AudioBuffer,
    rate: number,
    volumeGain: number,
    token: number,
    onFinish: () => void
  ): void {
    try {
      if (token !== this.speakToken) return;
      const ctx = this.feedback.getContext();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = rate;

      const gainNode = ctx.createGain();
      gainNode.gain.value = volumeGain;

      // Dynamics compressor limiter prevents clipping/distortion even at 3.0x boost
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -8;
      compressor.ratio.value = 12;

      source.connect(gainNode);
      gainNode.connect(compressor);
      compressor.connect(ctx.destination);

      this.activeBufferSource = source;
      source.onended = () => {
        if (this.activeBufferSource === source) {
          this.activeBufferSource = null;
        }
        onFinish();
      };
      source.start(0);
    } catch (_) {
      onFinish();
    }
  }

  private speakWithSystemVoice(
    text: string,
    hasArabic: boolean,
    preferredURI: string | null,
    rate: number,
    volumeGain: number,
    onFinish: () => void
  ): void {
    if (!("speechSynthesis" in window)) {
      onFinish();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const voices = this.getOsVoices();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = rate;
      utter.volume = Math.min(1.0, Math.max(0.1, volumeGain / 2));

      let chosen: SpeechSynthesisVoice | undefined;
      if (preferredURI) {
        chosen = voices.find((v) => v.voiceURI === preferredURI);
      }
      if (!chosen) {
        chosen = hasArabic
          ? voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("ar"))
          : voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
      }

      if (chosen) {
        utter.voice = chosen;
        utter.lang = chosen.lang;
      } else {
        utter.lang = hasArabic ? "ar-SA" : "en-US";
      }

      utter.onend = onFinish;
      utter.onerror = onFinish;
      window.speechSynthesis.speak(utter);
    } catch (_) {
      onFinish();
    }
  }
}
