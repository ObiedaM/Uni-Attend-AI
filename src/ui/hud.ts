import { normalizeText } from "../nlp/normalize";
import { HOST_ID } from "../shared/constants";
import { sendRuntimeMessage } from "../shared/storage";
import type {
  LanguageMode,
  LogoResponse,
  StudentRow,
  TtsEngineStatus,
  UserSettings
} from "../shared/types";
import { HUD_TEMPLATE } from "./hud-template";

export type KeywordCategory = "present" | "absent";

export interface HudActionHandlers {
  onClose: () => void;
  onRetryMic: () => void;
  onToggleRun: () => void;
  onRepeat: () => void;
  onPresent: () => void;
  onAbsent: () => void;
  onPrev: () => void;
  onScan: () => void;
  onPickFirstBox: () => void;
  onToggleJumpMode: () => void;
  onCopyAbsent: () => void;
  onDownloadCsv: () => void;
  onAddKeyword: (category: KeywordCategory, word: string) => void;
  onRemoveKeyword: (category: KeywordCategory, word: string) => void;
  onResetKeywords: () => void;
  onRestoreSession: () => void;
  onDismissSession: () => void;
  onSettingChange: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  onVoicePreview: () => void;
  onColorRowsToggle: () => void;
  onInvertModeChange: () => void;
  onLangModeChange: () => void;
}

export class HudView {
  public readonly host: HTMLDivElement;
  public readonly shadow: ShadowRoot;

  private readonly hud: HTMLElement;
  private readonly statusDot: HTMLElement;
  private readonly muteAlert: HTMLElement;
  private readonly muteAlertText: HTMLElement;
  private readonly recoveryBanner: HTMLElement;
  private readonly recoveryText: HTMLElement;
  private readonly progressText: HTMLElement;
  private readonly timerText: HTMLElement;
  private readonly currentName: HTMLElement;
  private readonly timerBar: HTMLElement;
  private readonly statPresent: HTMLElement;
  private readonly statAbsent: HTMLElement;
  private readonly statRemain: HTMLElement;
  private readonly toggleRunBtn: HTMLButtonElement;
  private readonly jumpBtn: HTMLButtonElement;
  private readonly exportToggleBtn: HTMLButtonElement;
  private readonly exportPopover: HTMLElement;
  private readonly exportSummary: HTMLElement;
  private readonly keywordsToggleBtn: HTMLButtonElement;
  private readonly keywordsDrawer: HTMLElement;
  private readonly kwTabPresent: HTMLButtonElement;
  private readonly kwTabAbsent: HTMLButtonElement;
  private readonly kwInput: HTMLInputElement;
  private readonly kwChips: HTMLElement;
  private readonly transcriptText: HTMLElement;
  private readonly ttsStatusBadge: HTMLElement;
  private readonly vuFill: HTMLElement;
  private readonly voiceSelect: HTMLSelectElement;

  private readonly ttsToggle: HTMLInputElement;
  private readonly ttsRateSlider: HTMLInputElement;
  private readonly ttsRateVal: HTMLElement;
  private readonly ttsVolSlider: HTMLInputElement;
  private readonly ttsVolVal: HTMLElement;
  private readonly twoNamesToggle: HTMLInputElement;
  private readonly colorToggle: HTMLInputElement;
  private readonly timerToggle: HTMLInputElement;
  private readonly timerSlider: HTMLInputElement;
  private readonly timerVal: HTMLElement;
  private readonly gainSlider: HTMLInputElement;
  private readonly gainVal: HTMLElement;
  private readonly modeSelect: HTMLSelectElement;
  private readonly langSelect: HTMLSelectElement;

  private activeKwTab: KeywordCategory = "present";
  private cachedPresentKeywords: string[] = [];
  private cachedAbsentKeywords: string[] = [];

  constructor(private readonly handlers: HudActionHandlers) {
    this.host = document.createElement("div");
    this.host.id = HOST_ID;
    document.body.appendChild(this.host);
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.shadow.innerHTML = HUD_TEMPLATE;

    this.hud = this.el("hud");
    this.statusDot = this.el("statusDot");
    this.muteAlert = this.el("muteAlert");
    this.muteAlertText = this.el("muteAlertText");
    this.recoveryBanner = this.el("recoveryBanner");
    this.recoveryText = this.el("recoveryText");
    this.progressText = this.el("progressText");
    this.timerText = this.el("timerText");
    this.currentName = this.el("currentName");
    this.timerBar = this.el("timerBar");
    this.statPresent = this.el("statPresent");
    this.statAbsent = this.el("statAbsent");
    this.statRemain = this.el("statRemain");
    this.toggleRunBtn = this.el<HTMLButtonElement>("toggleRunBtn");
    this.jumpBtn = this.el<HTMLButtonElement>("jumpBtn");
    this.exportToggleBtn = this.el<HTMLButtonElement>("exportToggleBtn");
    this.exportPopover = this.el("exportPopover");
    this.exportSummary = this.el("exportSummary");
    this.keywordsToggleBtn = this.el<HTMLButtonElement>("keywordsToggleBtn");
    this.keywordsDrawer = this.el("keywordsDrawer");
    this.kwTabPresent = this.el<HTMLButtonElement>("kwTabPresent");
    this.kwTabAbsent = this.el<HTMLButtonElement>("kwTabAbsent");
    this.kwInput = this.el<HTMLInputElement>("kwInput");
    this.kwChips = this.el("kwChips");
    this.transcriptText = this.el("transcriptText");
    this.ttsStatusBadge = this.el("ttsStatusBadge");
    this.vuFill = this.el("vuFill");
    this.voiceSelect = this.el<HTMLSelectElement>("voiceSelect");

    this.ttsToggle = this.el<HTMLInputElement>("ttsToggle");
    this.ttsRateSlider = this.el<HTMLInputElement>("ttsRateSlider");
    this.ttsRateVal = this.el("ttsRateVal");
    this.ttsVolSlider = this.el<HTMLInputElement>("ttsVolSlider");
    this.ttsVolVal = this.el("ttsVolVal");
    this.twoNamesToggle = this.el<HTMLInputElement>("twoNamesToggle");
    this.colorToggle = this.el<HTMLInputElement>("colorToggle");
    this.timerToggle = this.el<HTMLInputElement>("timerToggle");
    this.timerSlider = this.el<HTMLInputElement>("timerSlider");
    this.timerVal = this.el("timerVal");
    this.gainSlider = this.el<HTMLInputElement>("gainSlider");
    this.gainVal = this.el("gainVal");
    this.modeSelect = this.el<HTMLSelectElement>("modeSelect");
    this.langSelect = this.el<HTMLSelectElement>("langSelect");

    this.loadBrandLogo();
    this.bindDragAndResize();
    this.bindViewportClamp();
    this.bindControlEvents();
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T {
    const found = this.shadow.getElementById(id);
    if (!found) {
      throw new Error(`UniAttend HUD missing element #${id}`);
    }
    return found as T;
  }

  private loadBrandLogo(): void {
    void sendRuntimeMessage<LogoResponse>({ action: "GET_LOGO" }).then((res) => {
      if (res?.ok && res.dataUrl) {
        const img = this.el<HTMLImageElement>("brandLogo");
        img.src = res.dataUrl;
        img.style.display = "block";
      }
    });
  }

  public populateVoiceDropdown(
    osVoices: readonly SpeechSynthesisVoice[],
    selectedVoice: string
  ): string {
    this.voiceSelect.textContent = "";

    const cloudGroup = document.createElement("optgroup");
    cloudGroup.label = "Neural Cloud (Recommended)";
    const cloudOpts = [
      { value: "cloud-auto", label: "Auto (Arabic + English)" },
      { value: "cloud-ar", label: "Arabic Neural" },
      { value: "cloud-en-us", label: "English (US) Neural" },
      { value: "cloud-en-gb", label: "English (UK) Neural" },
      { value: "cloud-en-au", label: "English (AU) Neural" }
    ];
    for (const o of cloudOpts) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      cloudGroup.appendChild(opt);
    }
    this.voiceSelect.appendChild(cloudGroup);

    const arEnVoices = osVoices.filter((v) => /^(ar|en)/i.test(v.lang || ""));
    if (arEnVoices.length > 0) {
      const osGroup = document.createElement("optgroup");
      osGroup.label = "System Voices (Offline)";
      for (const v of arEnVoices) {
        const opt = document.createElement("option");
        opt.value = `os:${v.voiceURI}`;
        const tag = /^ar/i.test(v.lang) ? "[AR]" : "[EN]";
        opt.textContent = `${tag} ${v.name}`.slice(0, 38);
        osGroup.appendChild(opt);
      }
      this.voiceSelect.appendChild(osGroup);
    }

    const exists = Array.from(this.voiceSelect.options).some((o) => o.value === selectedVoice);
    const resolved = exists ? selectedVoice : "cloud-auto";
    this.voiceSelect.value = resolved;
    return resolved;
  }

  public syncFromSettings(settings: UserSettings, osVoices: readonly SpeechSynthesisVoice[]): string {
    this.hud.style.width = `${Math.max(320, Math.min(window.innerWidth - 20, settings.hudWidth))}px`;
    this.ttsToggle.checked = settings.ttsEnabled;
    this.ttsRateSlider.value = String(settings.ttsRate);
    this.ttsRateVal.textContent = `${Number(settings.ttsRate).toFixed(2)}x`;
    this.ttsVolSlider.value = String(settings.ttsVolume);
    this.ttsVolVal.textContent = `${Number(settings.ttsVolume).toFixed(1)}x`;
    this.twoNamesToggle.checked = settings.firstTwoNamesOnly;
    this.colorToggle.checked = settings.colorPageRows;
    this.timerToggle.checked = settings.timerEnabled;
    this.timerSlider.value = String(settings.timerDuration);
    this.timerVal.textContent = `${settings.timerDuration}s`;
    this.gainSlider.value = String(settings.micGain);
    this.gainVal.textContent = `${Number(settings.micGain).toFixed(1)}x`;
    this.modeSelect.value = settings.invertMode ? "absent" : "present";
    this.langSelect.value = settings.langMode;
    const resolvedVoice = this.populateVoiceDropdown(osVoices, settings.ttsVoice);
    this.setTtsStatus("idle", resolvedVoice);
    this.renderKeywords(settings.presentKeywords, settings.absentKeywords);
    return resolvedVoice;
  }

  public renderProgress(params: {
    rows: readonly StudentRow[];
    currentIndex: number;
    timerEnabled: boolean;
    timerDuration: number;
    timeLeft: number;
    isHardwareMuted: boolean;
  }): void {
    const { rows, currentIndex, timerEnabled, timerDuration, timeLeft, isHardwareMuted } = params;
    const total = rows.length;
    const current = rows[currentIndex];

    this.progressText.textContent = total
      ? `Student ${currentIndex + 1} / ${total}`
      : "No checkboxes found";
    this.currentName.textContent = current
      ? current.nameText
      : "Click Auto-Scan or Pick 1st Box";

    let presentCount = 0;
    let absentCount = 0;
    for (const r of rows) {
      if (r.status === "present") presentCount++;
      else if (r.status === "absent") absentCount++;
    }

    this.statPresent.textContent = String(presentCount);
    this.statAbsent.textContent = String(absentCount);
    this.statRemain.textContent = String(Math.max(0, total - presentCount - absentCount));
    this.exportSummary.textContent = `Absent Students: ${absentCount}`;

    if (isHardwareMuted) {
      this.timerText.textContent = "Timer: PAUSED (Mic Muted)";
    } else {
      this.timerText.textContent = timerEnabled ? `Timer: ${timeLeft.toFixed(1)}s` : "Timer: OFF";
    }
    const pct = timerEnabled && timerDuration > 0 ? Math.max(0, (timeLeft / timerDuration) * 100) : 100;
    this.timerBar.style.width = `${pct}%`;
  }

  public renderKeywords(presentKeywords: readonly string[], absentKeywords: readonly string[]): void {
    this.cachedPresentKeywords = [...presentKeywords];
    this.cachedAbsentKeywords = [...absentKeywords];

    this.kwTabPresent.textContent = `✅ Present (${presentKeywords.length})`;
    this.kwTabAbsent.textContent = `❌ Absent (${absentKeywords.length})`;
    this.kwTabPresent.classList.toggle("active-present", this.activeKwTab === "present");
    this.kwTabAbsent.classList.toggle("active-absent", this.activeKwTab === "absent");

    const activeList = this.activeKwTab === "present" ? presentKeywords : absentKeywords;
    this.kwChips.textContent = "";

    for (const word of activeList) {
      const chip = document.createElement("span");
      chip.className = "kw-chip";

      const label = document.createElement("span");
      label.textContent = word;

      const delBtn = document.createElement("button");
      delBtn.className = "kw-chip-del";
      delBtn.type = "button";
      delBtn.textContent = "×";
      delBtn.title = `Remove "${word}"`;
      delBtn.addEventListener("click", () => {
        this.handlers.onRemoveKeyword(this.activeKwTab, word);
      });

      chip.appendChild(label);
      chip.appendChild(delBtn);
      this.kwChips.appendChild(chip);
    }
  }

  public setTtsStatus(status: TtsEngineStatus, voiceChoice: string): void {
    this.ttsStatusBadge.className = "tts-badge";
    if (status === "cloud-cached") {
      this.ttsStatusBadge.classList.add("cached");
      this.ttsStatusBadge.textContent = "⚡ Cached";
      this.ttsStatusBadge.title = "Playing from instant in-memory cache (~0ms)";
    } else if (status === "cloud") {
      this.ttsStatusBadge.classList.add("cloud");
      this.ttsStatusBadge.textContent = "☁️ Cloud";
      this.ttsStatusBadge.title = "Using Neural Cloud TTS";
    } else if (status === "os") {
      this.ttsStatusBadge.classList.add("os");
      this.ttsStatusBadge.textContent = "💻 Offline OS";
      this.ttsStatusBadge.title = "Using local system speechSynthesis voice";
    } else if (status === "rate-limited") {
      this.ttsStatusBadge.classList.add("warn");
      this.ttsStatusBadge.textContent = "⚠️ Rate Limit → OS";
      this.ttsStatusBadge.title = "Cloud TTS rate-limited; using local OS voice automatically";
    } else if (status === "fallback-os") {
      this.ttsStatusBadge.classList.add("warn");
      this.ttsStatusBadge.textContent = "⚠️ Offline Fallback";
      this.ttsStatusBadge.title = "Cloud TTS unavailable; using local OS voice automatically";
    } else if (voiceChoice.startsWith("os:")) {
      this.ttsStatusBadge.classList.add("os");
      this.ttsStatusBadge.textContent = "💻 Offline OS";
      this.ttsStatusBadge.title = "Local system speechSynthesis voice selected";
    } else {
      this.ttsStatusBadge.classList.add("cloud");
      this.ttsStatusBadge.textContent = "☁️ Cloud";
      this.ttsStatusBadge.title = "Neural Cloud TTS with automatic OS fallback";
    }
  }

  public setRecoveryBanner(restorableCount: number): void {
    if (restorableCount > 0) {
      const noun = restorableCount === 1 ? "mark" : "marks";
      this.recoveryText.textContent = `🔄 Found ${restorableCount} saved ${noun} from earlier.`;
      this.recoveryBanner.classList.add("visible");
    } else {
      this.recoveryBanner.classList.remove("visible");
    }
  }

  public setJumpMode(active: boolean): void {
    this.jumpBtn.classList.toggle("active", active);
    this.jumpBtn.setAttribute("aria-pressed", String(active));
    this.jumpBtn.textContent = active ? "📍 Click a Row..." : "📍 Jump Row";
  }

  public closePopovers(): void {
    this.exportPopover.classList.remove("open");
    this.exportToggleBtn.classList.remove("active");
    this.exportToggleBtn.setAttribute("aria-pressed", "false");
    this.keywordsDrawer.classList.remove("open");
    this.keywordsToggleBtn.classList.remove("active");
    this.keywordsToggleBtn.setAttribute("aria-pressed", "false");
  }

  public setTranscript(text: string): void {
    this.transcriptText.textContent = text;
  }

  public setVuLevel(percent: number): void {
    this.vuFill.style.width = `${percent}%`;
  }

  public setRunningState(running: boolean): void {
    if (running) {
      this.statusDot.classList.remove("warn");
      this.statusDot.classList.add("live");
      this.toggleRunBtn.textContent = "⏸ Pause Attendance (Space)";
      this.toggleRunBtn.classList.add("running");
    } else {
      this.statusDot.classList.remove("live", "warn");
      this.toggleRunBtn.textContent = "▶ Start Voice Attendance (Space)";
      this.toggleRunBtn.classList.remove("running");
    }
  }

  public setHardwareMuteUI(muted: boolean, isRunning: boolean, customMessage?: string): void {
    if (muted) {
      this.muteAlertText.textContent =
        customMessage || "🔇 Mic is hardware-muted! Press your laptop's mic key. Timer paused.";
      this.muteAlert.classList.add("visible");
      this.statusDot.classList.remove("live");
      this.statusDot.classList.add("warn");
    } else {
      this.muteAlert.classList.remove("visible");
      this.statusDot.classList.remove("warn");
      if (isRunning) {
        this.statusDot.classList.add("live");
      }
    }
  }

  public setClosed(closed: boolean): void {
    if (closed) {
      this.closePopovers();
      this.hud.classList.add("closed");
    } else {
      this.hud.classList.remove("closed", "minimized");
    }
  }

  private submitNewKeyword(): void {
    const raw = this.kwInput.value.trim();
    if (!normalizeText(raw)) return;
    this.handlers.onAddKeyword(this.activeKwTab, raw);
    this.kwInput.value = "";
    this.kwInput.focus();
  }

  private bindViewportClamp(): void {
    window.addEventListener("resize", () => {
      if (this.hud.classList.contains("closed")) return;
      const rect = this.hud.getBoundingClientRect();
      const maxWidth = Math.max(320, window.innerWidth - 16);
      if (rect.width > maxWidth) {
        this.hud.style.width = `${maxWidth}px`;
      }
      if (this.hud.style.left && this.hud.style.left !== "auto") {
        const clampedLeft = Math.max(6, Math.min(window.innerWidth - this.hud.offsetWidth - 6, rect.left));
        const clampedTop = Math.max(6, Math.min(window.innerHeight - 60, rect.top));
        this.hud.style.left = `${clampedLeft}px`;
        this.hud.style.top = `${clampedTop}px`;
      }
    });
  }

  private bindDragAndResize(): void {
    const header = this.el("hudHeader");
    const resizeHandle = this.el("resizeHandle");

    header.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement | null)?.closest("button")) return;
      const rect = this.hud.getBoundingClientRect();
      const dragOffX = e.clientX - rect.left;
      const dragOffY = e.clientY - rect.top;

      const onMove = (moveEvent: MouseEvent): void => {
        this.hud.style.right = "auto";
        this.hud.style.bottom = "auto";
        const nextLeft = Math.max(
          6,
          Math.min(window.innerWidth - this.hud.offsetWidth - 6, moveEvent.clientX - dragOffX)
        );
        const nextTop = Math.max(
          6,
          Math.min(window.innerHeight - 60, moveEvent.clientY - dragOffY)
        );
        this.hud.style.left = `${nextLeft}px`;
        this.hud.style.top = `${nextTop}px`;
      };

      const onUp = (): void => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    resizeHandle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      const rect = this.hud.getBoundingClientRect();
      this.hud.style.right = "auto";
      this.hud.style.left = `${rect.left}px`;
      const startW = rect.width;
      const startX = e.clientX;

      const onMove = (moveEvent: MouseEvent): void => {
        const nextW = Math.max(
          320,
          Math.min(window.innerWidth - 20, startW + (moveEvent.clientX - startX))
        );
        this.hud.style.width = `${nextW}px`;
        this.handlers.onSettingChange("hudWidth", Math.round(nextW));
      };

      const onUp = (): void => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }

  private bindControlEvents(): void {
    this.el("minBtn").addEventListener("click", () => this.hud.classList.toggle("minimized"));
    this.el("closeBtn").addEventListener("click", () => this.handlers.onClose());
    this.el("retryMicBtn").addEventListener("click", () => this.handlers.onRetryMic());
    this.el("restoreSessionBtn").addEventListener("click", () => this.handlers.onRestoreSession());
    this.el("dismissSessionBtn").addEventListener("click", () => this.handlers.onDismissSession());
    this.toggleRunBtn.addEventListener("click", () => this.handlers.onToggleRun());
    this.el("speakNowBtn").addEventListener("click", () => this.handlers.onRepeat());
    this.el("repeatBtn").addEventListener("click", () => this.handlers.onRepeat());
    this.el("presentBtn").addEventListener("click", () => this.handlers.onPresent());
    this.el("absentBtn").addEventListener("click", () => this.handlers.onAbsent());
    this.el("prevBtn").addEventListener("click", () => this.handlers.onPrev());
    this.el("scanBtn").addEventListener("click", () => this.handlers.onScan());
    this.el("pickBtn").addEventListener("click", () => this.handlers.onPickFirstBox());
    this.jumpBtn.addEventListener("click", () => this.handlers.onToggleJumpMode());

    this.exportToggleBtn.addEventListener("click", () => {
      const willOpen = !this.exportPopover.classList.contains("open");
      this.closePopovers();
      if (willOpen) {
        this.exportPopover.classList.add("open");
        this.exportToggleBtn.classList.add("active");
      }
    });

    this.el("copyAbsentBtn").addEventListener("click", () => {
      this.handlers.onCopyAbsent();
      this.closePopovers();
    });

    this.el("downloadCsvBtn").addEventListener("click", () => {
      this.handlers.onDownloadCsv();
      this.closePopovers();
    });

    this.keywordsToggleBtn.addEventListener("click", () => {
      const willOpen = !this.keywordsDrawer.classList.contains("open");
      this.closePopovers();
      if (willOpen) {
        this.keywordsDrawer.classList.add("open");
        this.keywordsToggleBtn.classList.add("active");
        this.renderKeywords(this.cachedPresentKeywords, this.cachedAbsentKeywords);
      }
    });

    this.kwTabPresent.addEventListener("click", () => {
      this.activeKwTab = "present";
      this.renderKeywords(this.cachedPresentKeywords, this.cachedAbsentKeywords);
    });

    this.kwTabAbsent.addEventListener("click", () => {
      this.activeKwTab = "absent";
      this.renderKeywords(this.cachedPresentKeywords, this.cachedAbsentKeywords);
    });

    this.el("kwAddBtn").addEventListener("click", () => this.submitNewKeyword());
    this.kwInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submitNewKeyword();
      }
    });
    this.el("resetKeywordsBtn").addEventListener("click", () => this.handlers.onResetKeywords());

    this.ttsToggle.addEventListener("change", () => {
      this.handlers.onSettingChange("ttsEnabled", this.ttsToggle.checked);
    });

    this.voiceSelect.addEventListener("change", () => {
      this.handlers.onSettingChange("ttsVoice", this.voiceSelect.value);
      this.setTtsStatus("idle", this.voiceSelect.value);
      this.handlers.onVoicePreview();
    });

    this.ttsRateSlider.addEventListener("input", () => {
      const val = parseFloat(this.ttsRateSlider.value);
      this.ttsRateVal.textContent = `${val.toFixed(2)}x`;
      this.handlers.onSettingChange("ttsRate", val);
    });

    this.ttsVolSlider.addEventListener("input", () => {
      const val = parseFloat(this.ttsVolSlider.value);
      this.ttsVolVal.textContent = `${val.toFixed(1)}x`;
      this.handlers.onSettingChange("ttsVolume", val);
    });

    this.twoNamesToggle.addEventListener("change", () => {
      this.handlers.onSettingChange("firstTwoNamesOnly", this.twoNamesToggle.checked);
    });

    this.colorToggle.addEventListener("change", () => {
      this.handlers.onSettingChange("colorPageRows", this.colorToggle.checked);
      this.handlers.onColorRowsToggle();
    });

    this.timerToggle.addEventListener("change", () => {
      this.handlers.onSettingChange("timerEnabled", this.timerToggle.checked);
    });

    this.timerSlider.addEventListener("input", () => {
      const val = parseFloat(this.timerSlider.value);
      this.timerVal.textContent = `${val}s`;
      this.handlers.onSettingChange("timerDuration", val);
    });

    this.gainSlider.addEventListener("input", () => {
      const val = parseFloat(this.gainSlider.value);
      this.gainVal.textContent = `${val.toFixed(1)}x`;
      this.handlers.onSettingChange("micGain", val);
    });

    this.modeSelect.addEventListener("change", () => {
      this.handlers.onSettingChange("invertMode", this.modeSelect.value === "absent");
      this.handlers.onInvertModeChange();
    });

    this.langSelect.addEventListener("change", () => {
      this.handlers.onSettingChange("langMode", this.langSelect.value as LanguageMode);
      this.handlers.onLangModeChange();
    });
  }
}
