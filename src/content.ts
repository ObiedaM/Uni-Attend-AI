import { AudioFeedbackEngine } from "./audio/feedback";
import { MicMonitor } from "./audio/mic-monitor";
import { TtsEngine } from "./audio/tts";
import { clearHighlights, ensureStylesInDoc, getAccessibleDocuments } from "./dom/documents";
import { setCheckboxChecked } from "./dom/mutator";
import {
  findRowIndexForEventTarget,
  highlightRows,
  resolvePickCheckboxTarget,
  scanCheckboxes
} from "./dom/scanner";
import { compileDictionary, matchAttendanceKeyword } from "./nlp/keywords";
import { normalizeText } from "./nlp/normalize";
import {
  createDefaultSettings,
  DEFAULT_ABSENT_KEYWORDS,
  DEFAULT_PRESENT_KEYWORDS,
  HOST_ID,
  SPEECH_COOLDOWN_MS
} from "./shared/constants";
import {
  buildAbsentCsvFilename,
  collectAbsentEntries,
  copyTextToClipboard,
  formatAbsentCsv,
  formatAbsentPlainText,
  triggerCsvDownload
} from "./shared/export";
import {
  buildRowFingerprints,
  clearSessionMarks,
  countRestorableMarks,
  loadSessionMarks,
  saveSessionMarks
} from "./shared/session";
import { loadSettings, saveSettings } from "./shared/storage";
import type {
  CompiledDictionary,
  ExtensionMessage,
  StudentRow,
  UserSettings
} from "./shared/types";
import { SpeechController } from "./speech/recognizer";
import { HudView, type KeywordCategory } from "./ui/hud";
import { bindKeyboardShortcuts } from "./ui/shortcuts";

function bootstrapUniAttend(): void {
  if (window.__uniAttendInjected) return;
  window.__uniAttendInjected = true;

  ensureStylesInDoc(document);

  let settings: UserSettings = createDefaultSettings();
  let presentDict: CompiledDictionary = compileDictionary(settings.presentKeywords);
  let absentDict: CompiledDictionary = compileDictionary(settings.absentKeywords);

  let rows: StudentRow[] = [];
  let currentIndex = 0;
  let isRunning = false;
  let isClosed = false;
  let pickingFirstBox = false;
  let jumpMode = false;
  let isHardwareMuted = false;
  let timeLeft = settings.timerDuration;
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let lastTriggerTime = 0;
  let shortcuts: ReturnType<typeof bindKeyboardShortcuts> | null = null;

  const feedback = new AudioFeedbackEngine();
  const micMonitor = new MicMonitor();
  const tts = new TtsEngine(feedback);

  const recompileKeywordDictionaries = (): void => {
    presentDict = compileDictionary(settings.presentKeywords);
    absentDict = compileDictionary(settings.absentKeywords);
    hud.renderKeywords(settings.presentKeywords, settings.absentKeywords);
  };

  const updateProgressUI = (): void => {
    hud.renderProgress({
      rows,
      currentIndex,
      timerEnabled: settings.timerEnabled,
      timerDuration: settings.timerDuration,
      timeLeft,
      isHardwareMuted
    });
  };

  const renderHighlights = (scroll = true): void => {
    if (isClosed) return;
    highlightRows(rows, currentIndex, settings.colorPageRows, scroll);
  };

  const checkSessionRecovery = (): void => {
    const snapshot = loadSessionMarks();
    const restorable = countRestorableMarks(rows, snapshot);
    hud.setRecoveryBanner(restorable);
  };

  const persistCurrentSession = (): void => {
    saveSessionMarks(rows, settings.invertMode);
  };

  const speakCurrentStudent = (force = false): void => {
    const current = rows[currentIndex];
    tts.speakStudent({
      row: current,
      enabled: settings.ttsEnabled,
      force,
      firstTwoNamesOnly: settings.firstTwoNamesOnly,
      voiceChoice: settings.ttsVoice,
      rate: settings.ttsRate,
      volumeGain: settings.ttsVolume,
      onStart: (spokenText) => {
        hud.setTranscript(`🔊 "${spokenText}"`);
      },
      onStatusChange: (status) => {
        hud.setTtsStatus(status, settings.ttsVoice);
      },
      onComplete: () => {
        lastTriggerTime = Date.now() - 450;
        if (isRunning && !isHardwareMuted) {
          hud.setTranscript("🎙️ Listening (نعم / حاضر / Yes)...");
        }
      }
    });
  };

  const setHardwareMuted = (muted: boolean, customMessage?: string): void => {
    if (isHardwareMuted === muted && !customMessage) return;
    isHardwareMuted = muted;
    hud.setHardwareMuteUI(muted, isRunning, customMessage);

    if (muted) {
      hud.setTranscript("🔇 Waiting for mic unmute...");
      feedback.playBeep("warn", settings.soundEffects);
    } else if (isRunning) {
      hud.setTranscript("🎙️ Mic restored! Listening...");
      speech.ensureStarted();
    }
    updateProgressUI();
  };

  const stopAutomation = (msg = "Paused (Mic Off)"): void => {
    isRunning = false;
    isHardwareMuted = false;
    hud.setHardwareMuteUI(false, false);
    tts.stop();
    if (timerInterval !== null) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    hud.setRunningState(false);
    hud.setTranscript(msg);
    speech.stop();
    micMonitor.stop((pct) => hud.setVuLevel(pct));
    feedback.close();
    updateProgressUI();
  };

  const jumpToRow = (targetIndex: number): void => {
    if (targetIndex < 0 || targetIndex >= rows.length) return;
    tts.stop();
    currentIndex = targetIndex;
    timeLeft = settings.timerDuration;
    renderHighlights(true);
    updateProgressUI();
    hud.setTranscript(`📍 Jumped to #${targetIndex + 1}: ${rows[targetIndex].nameText}`);
    if (isRunning && settings.ttsEnabled && !isHardwareMuted) {
      speakCurrentStudent();
    }
  };

  const advanceRow = (): void => {
    lastTriggerTime = Date.now();
    if (currentIndex < rows.length - 1) {
      currentIndex++;
      timeLeft = settings.timerDuration;
      renderHighlights(true);
      updateProgressUI();
      if (isRunning && settings.ttsEnabled && !isHardwareMuted) {
        speakCurrentStudent();
      }
    } else {
      renderHighlights(true);
      updateProgressUI();
      stopAutomation("🎉 All students completed! (Mic Off)");
    }
  };

  const markPresent = (): void => {
    if (!rows.length || currentIndex >= rows.length) return;
    tts.stop();
    const item = rows[currentIndex];
    setCheckboxChecked(item, !settings.invertMode);
    item.status = "present";
    persistCurrentSession();
    hud.setRecoveryBanner(0);
    feedback.playBeep("present", settings.soundEffects);
    advanceRow();
  };

  const markAbsent = (reason = "Absent"): void => {
    if (!rows.length || currentIndex >= rows.length) return;
    tts.stop();
    const item = rows[currentIndex];
    setCheckboxChecked(item, settings.invertMode);
    item.status = "absent";
    persistCurrentSession();
    hud.setRecoveryBanner(0);
    hud.setTranscript(`❌ Marked Absent (${reason})`);
    feedback.playBeep("absent", settings.soundEffects);
    advanceRow();
  };

  const prevRow = (): void => {
    if (!rows.length || currentIndex <= 0) return;
    tts.stop();
    currentIndex--;
    timeLeft = settings.timerDuration;
    renderHighlights(true);
    updateProgressUI();
    if (isRunning && settings.ttsEnabled && !isHardwareMuted) {
      speakCurrentStudent();
    }
  };

  const repeatCurrentName = (): void => {
    if (!rows.length) return;
    timeLeft = settings.timerDuration;
    updateProgressUI();
    speakCurrentStudent(true);
  };

  const startTimerLoop = (): void => {
    if (timerInterval !== null) clearInterval(timerInterval);
    timeLeft = settings.timerDuration;
    timerInterval = setInterval(() => {
      if (!isRunning || !settings.timerEnabled || !rows.length) return;
      if (tts.isSpeaking() || isHardwareMuted) return;
      timeLeft = Math.max(0, timeLeft - 0.1);
      updateProgressUI();
      if (timeLeft <= 0) {
        markAbsent("Time Expired");
      }
    }, 100);
  };

  const handleRowJumpClick = (e: MouseEvent): void => {
    if (isClosed || pickingFirstBox || !rows.length) return;
    if (!jumpMode && !e.altKey) return;
    if (
      e.target &&
      typeof e.target === "object" &&
      (e.target as Node).nodeType === 1 &&
      (e.target as Element).closest(`#${HOST_ID}`)
    ) {
      return;
    }

    const targetIndex = findRowIndexForEventTarget(rows, e.target);
    if (targetIndex === -1) return;

    e.preventDefault();
    e.stopPropagation();
    if (jumpMode) {
      setJumpMode(false);
    }
    jumpToRow(targetIndex);
  };

  const attachRowJumpListeners = (): void => {
    for (const doc of getAccessibleDocuments()) {
      try {
        doc.removeEventListener("click", handleRowJumpClick, true);
        doc.addEventListener("click", handleRowJumpClick, true);
      } catch (_) {}
    }
  };

  const detachRowJumpListeners = (): void => {
    for (const doc of getAccessibleDocuments()) {
      try {
        doc.body?.classList.remove("ua-jump-mode");
        doc.removeEventListener("click", handleRowJumpClick, true);
      } catch (_) {}
    }
  };

  const setJumpMode = (active: boolean): void => {
    jumpMode = active;
    hud.setJumpMode(active);
    for (const doc of getAccessibleDocuments()) {
      try {
        doc.body?.classList.toggle("ua-jump-mode", active);
      } catch (_) {}
    }
    if (active) {
      hud.setTranscript("📍 Click any scanned student row to jump cursor");
    }
  };

  const runScan = (anchorEl: HTMLElement | null = null): void => {
    rows = scanCheckboxes(settings.invertMode, anchorEl);
    currentIndex = 0;
    timeLeft = settings.timerDuration;
    updateProgressUI();
    if (!isClosed) {
      attachRowJumpListeners();
      shortcuts?.syncDocuments();
      if (rows.length > 0) {
        renderHighlights(true);
      }
      checkSessionRecovery();
    }
  };

  const restoreSessionMarks = (): void => {
    const snapshot = loadSessionMarks();
    if (!snapshot || !rows.length) {
      hud.setRecoveryBanner(0);
      return;
    }

    const fingerprints = buildRowFingerprints(rows);
    let restoredCount = 0;

    rows.forEach((row, idx) => {
      const saved = snapshot.marks[fingerprints[idx]];
      if (!saved) return;
      const shouldCheck = saved === "absent" ? settings.invertMode : !settings.invertMode;
      setCheckboxChecked(row, shouldCheck);
      row.status = saved;
      restoredCount++;
    });

    const firstPending = rows.findIndex((r) => r.status === "pending");
    currentIndex = firstPending !== -1 ? firstPending : Math.max(0, rows.length - 1);
    timeLeft = settings.timerDuration;
    persistCurrentSession();
    hud.setRecoveryBanner(0);
    renderHighlights(true);
    updateProgressUI();
    hud.setTranscript(`✅ Restored ${restoredCount} previous mark${restoredCount === 1 ? "" : "s"}!`);
  };

  const dismissSessionMarks = (): void => {
    clearSessionMarks();
    hud.setRecoveryBanner(0);
  };

  const startMic = (): void => {
    void micMonitor.start(settings.micGain, {
      isRunning: () => isRunning,
      isSpeakingName: () => tts.isSpeaking(),
      isHardwareMuted: () => isHardwareMuted,
      onHardwareMuteChange: (muted, customMsg) => setHardwareMuted(muted, customMsg),
      onVuLevel: (pct) => hud.setVuLevel(pct)
    });
  };

  const startAutomation = (): void => {
    if (!rows.length) runScan();
    if (!rows.length) {
      hud.setTranscript("⚠️ No checkboxes found! Click Pick 1st Box.");
      return;
    }

    isRunning = true;
    isHardwareMuted = false;
    hud.setHardwareMuteUI(false, true);
    hud.setRunningState(true);
    hud.setTranscript("Listening (نعم / حاضر / Yes / Here)...");

    speech.start(settings.langMode);
    startMic();
    startTimerLoop();
    renderHighlights(true);

    if (settings.ttsEnabled) {
      speakCurrentStudent();
    }
  };

  const handlePickClick = (e: MouseEvent): void => {
    if (!pickingFirstBox) return;
    const target = resolvePickCheckboxTarget(e.target);
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();
    exitPickMode();
    runScan(target);
    hud.setTranscript(`✅ Locked onto ${rows.length} rows!`);
  };

  const exitPickMode = (): void => {
    pickingFirstBox = false;
    for (const doc of getAccessibleDocuments()) {
      try {
        doc.body?.classList.remove("ua-pick-cursor");
        doc.removeEventListener("click", handlePickClick, true);
      } catch (_) {}
    }
  };

  const enterPickMode = (): void => {
    if (jumpMode) setJumpMode(false);
    pickingFirstBox = true;
    for (const doc of getAccessibleDocuments()) {
      try {
        doc.body?.classList.add("ua-pick-cursor");
        doc.removeEventListener("click", handlePickClick, true);
        doc.addEventListener("click", handlePickClick, true);
      } catch (_) {}
    }
    hud.setTranscript("🎯 Click the 1st student's checkbox");
  };

  const handleCopyAbsent = (): void => {
    const entries = collectAbsentEntries(rows);
    const text = formatAbsentPlainText(entries);
    void copyTextToClipboard(text).then((ok) => {
      if (ok) {
        hud.setTranscript(`📋 Copied ${entries.length} absent student${entries.length === 1 ? "" : "s"}`);
      } else {
        hud.setTranscript("⚠️ Clipboard blocked — try CSV Backup");
      }
    });
  };

  const handleDownloadCsv = (): void => {
    const entries = collectAbsentEntries(rows);
    const csv = formatAbsentCsv(entries);
    const filename = buildAbsentCsvFilename();
    triggerCsvDownload(csv, filename);
    hud.setTranscript(`⬇️ Downloaded CSV (${entries.length} absent)`);
  };

  const handleAddKeyword = (category: KeywordCategory, word: string): void => {
    const normalized = normalizeText(word);
    if (!normalized) return;

    const list = category === "present" ? settings.presentKeywords : settings.absentKeywords;
    const exists = list.some((item) => normalizeText(item) === normalized);
    if (exists) {
      hud.setTranscript(`ℹ️ "${word}" is already in ${category} keywords`);
      return;
    }

    if (category === "present") {
      settings.presentKeywords = [...list, word.trim()];
    } else {
      settings.absentKeywords = [...list, word.trim()];
    }
    recompileKeywordDictionaries();
    saveSettings(settings);
    hud.setTranscript(`✅ Added "${word.trim()}" to ${category} keywords`);
  };

  const handleRemoveKeyword = (category: KeywordCategory, word: string): void => {
    if (category === "present") {
      settings.presentKeywords = settings.presentKeywords.filter((w) => w !== word);
    } else {
      settings.absentKeywords = settings.absentKeywords.filter((w) => w !== word);
    }
    recompileKeywordDictionaries();
    saveSettings(settings);
  };

  const handleResetKeywords = (): void => {
    settings.presentKeywords = [...DEFAULT_PRESENT_KEYWORDS];
    settings.absentKeywords = [...DEFAULT_ABSENT_KEYWORDS];
    recompileKeywordDictionaries();
    saveSettings(settings);
    hud.setTranscript("↺ Keywords reset to defaults");
  };

  const closeAndShutOff = (): void => {
    stopAutomation("Mic Off");
    exitPickMode();
    setJumpMode(false);
    detachRowJumpListeners();
    clearHighlights();
    isClosed = true;
    hud.setClosed(true);
  };

  const reopenHud = (): void => {
    isClosed = false;
    hud.setClosed(false);
    runScan();
  };

  const speech = new SpeechController({
    isRunning: () => isRunning,
    isSpeakingName: () => tts.isSpeaking(),
    isHardwareMuted: () => isHardwareMuted,
    getLangMode: () => settings.langMode,
    onSpeechActivityUnmute: () => setHardwareMuted(false),
    onFreshSlice: (freshSlice) => {
      hud.setTranscript(`🎙️ "${freshSlice.trim()}"`);
      if (tts.isSpeaking() || isHardwareMuted) return false;
      if (Date.now() - lastTriggerTime < SPEECH_COOLDOWN_MS) return false;

      const decision = matchAttendanceKeyword(freshSlice, presentDict, absentDict);
      if (decision === "absent") {
        hud.setTranscript(`❌ "${freshSlice.trim()}"`);
        markAbsent("Voice");
        return true;
      }
      if (decision === "present") {
        hud.setTranscript(`✅ "${freshSlice.trim()}"`);
        markPresent();
        return true;
      }
      return false;
    },
    onStatusMessage: (msg) => hud.setTranscript(msg),
    onPermissionBlocked: (msg) => stopAutomation(msg),
    onAudioCaptureError: (msg) => setHardwareMuted(true, msg)
  });

  const hud = new HudView({
    onClose: closeAndShutOff,
    onRetryMic: () => {
      if (!isRunning) return;
      setHardwareMuted(false);
      startMic();
      speech.retry(settings.langMode);
    },
    onToggleRun: () => {
      if (isRunning) stopAutomation();
      else startAutomation();
    },
    onRepeat: repeatCurrentName,
    onPresent: () => {
      timeLeft = settings.timerDuration;
      markPresent();
    },
    onAbsent: () => {
      timeLeft = settings.timerDuration;
      markAbsent("Manual");
    },
    onPrev: prevRow,
    onScan: () => runScan(),
    onPickFirstBox: enterPickMode,
    onToggleJumpMode: () => {
      if (pickingFirstBox) exitPickMode();
      setJumpMode(!jumpMode);
    },
    onCopyAbsent: handleCopyAbsent,
    onDownloadCsv: handleDownloadCsv,
    onAddKeyword: handleAddKeyword,
    onRemoveKeyword: handleRemoveKeyword,
    onResetKeywords: handleResetKeywords,
    onRestoreSession: restoreSessionMarks,
    onDismissSession: dismissSessionMarks,
    onSettingChange: (key, value) => {
      settings[key] = value;
      if (key === "ttsEnabled" && !value) {
        tts.stop();
      }
      if (key === "ttsVoice") {
        tts.resetCloudCooldown();
      }
      if (key === "timerEnabled" || key === "timerDuration") {
        timeLeft = settings.timerDuration;
        updateProgressUI();
      }
      if (key === "micGain" && typeof value === "number") {
        micMonitor.setGain(value);
      }
      saveSettings(settings);
    },
    onVoicePreview: () => {
      if (rows.length && settings.ttsEnabled && !isRunning) {
        speakCurrentStudent();
      }
    },
    onColorRowsToggle: () => renderHighlights(false),
    onInvertModeChange: () => runScan(),
    onLangModeChange: () => {
      if (isRunning) {
        speech.restartForLanguage();
      }
    }
  });

  if ("speechSynthesis" in window) {
    const refreshVoices = (): void => {
      settings.ttsVoice = hud.populateVoiceDropdown(tts.getOsVoices(), settings.ttsVoice);
    };
    refreshVoices();
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  } else {
    hud.populateVoiceDropdown([], settings.ttsVoice);
  }

  shortcuts = bindKeyboardShortcuts(hud.shadow, {
    isClosed: () => isClosed,
    isPickingFirstBox: () => pickingFirstBox,
    isJumpMode: () => jumpMode,
    hasRows: () => rows.length > 0,
    isRunning: () => isRunning,
    onCancelPick: () => {
      exitPickMode();
      hud.setTranscript("Pick cancelled");
    },
    onCancelJump: () => {
      setJumpMode(false);
      hud.setTranscript("Jump mode cancelled");
    },
    onToggleRun: () => {
      if (isRunning) stopAutomation();
      else startAutomation();
    },
    onPresent: markPresent,
    onAbsent: () => markAbsent("Key ↓"),
    onPrev: prevRow,
    onRepeat: repeatCurrentName,
    onPause: () => stopAutomation("Paused (Mic Off)")
  });

  // Strict sender check for Toolbar Click / Alt+A toggle
  try {
    chrome.runtime.onMessage.addListener((msg: ExtensionMessage, sender) => {
      if (sender.id !== chrome.runtime.id) return;
      if (msg?.action === "TOGGLE_HUD") {
        if (isClosed) reopenHud();
        else closeAndShutOff();
      }
    });
  } catch (_) {}

  // Guarantee hard hardware mic & audio teardown on navigation/tab close
  window.addEventListener("pagehide", () => stopAutomation("Mic Off"));

  // Hydrate persisted settings and scan immediately on launch
  void loadSettings().then((loaded) => {
    settings = loaded;
    timeLeft = settings.timerDuration;
    recompileKeywordDictionaries();
    settings.ttsVoice = hud.syncFromSettings(settings, tts.getOsVoices());
    runScan();
  });
}

bootstrapUniAttend();
