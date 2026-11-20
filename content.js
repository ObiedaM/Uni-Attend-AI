(() => {
  if (window.__uniAttendInjected) return;
  window.__uniAttendInjected = true;

  /* ==========================================================================
   * 1. PRE-NORMALIZED KEYWORD DICTIONARIES (ZERO RUNTIME REGEX OVERHEAD)
   * ========================================================================== */
  const RAW_PRESENT = [
    // Arabic
    "نعم", "موجود", "موجودة", "موجوده", "حاضر", "حاضره", "حاضرة", "هلا", "اه", "أه", "آه","حا","حاض","حاظر","حاظر","ر",
    "ايوه", "أيوه", "ايه", "أجل", "معك", "تمام", "صح", "هون", "هيني", "انا", "أنا",
    "شغال", "ماشي", "طيب", "حاضر دكتور", "موجود دكتور", "نعم دكتور", "اه دكتور", "عاش",
    // English
    "yes", "yeah", "yep", "here", "present", "okay", "ok", "attend", "attending",
    "in", "available", "ready", "sir", "doctor", "prof", "yo", "aye",
    // Phonetic (when Arabic recognizer hears English)
    "يس", "ياس", "ياه", "هير", "هيير", "اوكي", "أوكي", "اوك", "برنت", "برزنت", "بريزنت"
  ];

  const RAW_ABSENT = [
    // Arabic
    "غائب", "غايب", "غائبة", "غايبة", "غائبه", "غايبه", "غياب",
    "مش موجود", "مو موجود", "مش هون", "مو هون",
    "لا", "تجاوز", "التالي", "سكب", "طلع", "سحب", "اعتذر", "مفقود",
    // English
    "absent", "no", "not here", "skip", "next", "missing", "away",
    // Phonetic
    "ابسنت", "أبسنت", "سكيب", "نكست"
  ];

  function normalizeText(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/[.,!?؟،؛]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compileDictionary(list) {
    const single = new Set();
    const phrases = [];
    for (const raw of list) {
      const n = normalizeText(raw);
      if (!n) continue;
      if (n.includes(" ")) phrases.push(n);
      else single.add(n);
    }
    return { single, phrases };
  }

  const PRESENT_DICT = compileDictionary(RAW_PRESENT);
  const ABSENT_DICT = compileDictionary(RAW_ABSENT);

  /* ==========================================================================
   * 2. PERSISTENT SETTINGS & APPLICATION STATE
   * ========================================================================== */
  const DEFAULT_SETTINGS = {
    ttsEnabled: true,
    firstTwoNamesOnly: true,
    ttsVoice: "cloud-auto", // cloud-auto | cloud-ar | cloud-en-us | cloud-en-gb | cloud-en-au | os:<voiceURI>
    ttsRate: 1.05,
    ttsVolume: 2.0,
    timerEnabled: true,
    timerDuration: 5,
    micGain: 2.5,
    colorPageRows: true,
    langMode: "ar-JO",
    invertMode: true,       // true = Check means Absent (JU standard); false = Check means Present
    soundEffects: true,
    hudWidth: 380
  };

  const state = {
    ...DEFAULT_SETTINGS,
    rows: [],
    currentIndex: 0,
    isRunning: false,
    isClosed: false,        // Opens immediately because injection only occurs on user click / Alt+A
    pickingFirstBox: false,
    isSpeakingName: false,
    isHardwareMuted: false,
    ttsSafetyTimer: null,
    activeBufferSource: null,
    timeLeft: DEFAULT_SETTINGS.timerDuration,
    timerInterval: null,
    lastTriggerTime: 0,
    processedCharCounts: new Map()
  };

  let saveSettingsTimer = null;
  function saveSettings() {
    clearTimeout(saveSettingsTimer);
    saveSettingsTimer = setTimeout(() => {
      const payload = {};
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        payload[key] = state[key];
      }
      try {
        chrome.storage.local.set(payload);
      } catch (_) {}
    }, 150);
  }

  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
          if (!chrome.runtime.lastError && stored) {
            for (const key of Object.keys(DEFAULT_SETTINGS)) {
              if (stored[key] !== undefined) state[key] = stored[key];
            }
          }
          state.timeLeft = state.timerDuration;
          resolve();
        });
      } catch (_) {
        resolve();
      }
    });
  }

  /* ==========================================================================
   * 3. MULTI-DOCUMENT SAFE HIGHLIGHT CSS (MAIN PAGE + SAME-ORIGIN IFRAMES)
   * ========================================================================== */
  const HIGHLIGHT_CSS = `
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
  `;

  function ensureStylesInDoc(doc) {
    try {
      if (!doc || doc.getElementById("ua-injected-styles")) return;
      const style = doc.createElement("style");
      style.id = "ua-injected-styles";
      style.textContent = HIGHLIGHT_CSS;
      (doc.head || doc.documentElement).appendChild(style);
    } catch (_) {}
  }

  function getAccessibleDocuments() {
    const docs = [document];
    const iframes = document.querySelectorAll("iframe");
    for (const frame of iframes) {
      try {
        if (frame.contentDocument && frame.contentDocument.body) {
          docs.push(frame.contentDocument);
        }
      } catch (_) {
        // Cross-origin iframe — safely skipped
      }
    }
    return docs;
  }

  ensureStylesInDoc(document);

  /* ==========================================================================
   * 4. WEB AUDIO ENGINE & FEEDBACK CHIMES
   * ========================================================================== */
  let feedbackCtx = null;
  function getAudioContext() {
    if (!feedbackCtx || feedbackCtx.state === "closed") {
      feedbackCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (feedbackCtx.state === "suspended") {
      feedbackCtx.resume().catch(() => {});
    }
    return feedbackCtx;
  }

  function playBeep(type) {
    if (!state.soundEffects) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === "present") {
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.06);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === "absent") {
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(220, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === "warn") {
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.setValueAtTime(310, now + 0.12);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      }
    } catch (_) {}
  }

  /* ==========================================================================
   * 5. UNIFIED BILINGUAL TTS ENGINE (NEURAL CLOUD + OFFLINE OS VOICES)
   * ========================================================================== */
  let osVoicesCache = [];

  function getSpokenName(rowItem) {
    if (!rowItem) return "";
    return state.firstTwoNamesOnly ? rowItem.shortSpeechName : rowItem.fullSpeechName;
  }

  function stopSpeakingName() {
    clearTimeout(state.ttsSafetyTimer);
    if (state.activeBufferSource) {
      try {
        state.activeBufferSource.onended = null;
        state.activeBufferSource.stop();
      } catch (_) {}
      state.activeBufferSource = null;
    }
    if ("speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
    state.isSpeakingName = false;
  }

  function playBase64ViaWebAudio(base64Str, rate, volumeGain, onFinish) {
    try {
      const binary = atob(base64Str);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);

      const ctx = getAudioContext();
      ctx.decodeAudioData(
        bytes.buffer,
        (audioBuffer) => {
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.playbackRate.value = rate;

          const gainNode = ctx.createGain();
          gainNode.gain.value = volumeGain;

          // Limiter prevents distortion even at 3.0x boost
          const compressor = ctx.createDynamicsCompressor();
          compressor.threshold.value = -8;
          compressor.ratio.value = 12;

          source.connect(gainNode);
          gainNode.connect(compressor);
          compressor.connect(ctx.destination);

          state.activeBufferSource = source;
          source.onended = onFinish;
          source.start(0);
        },
        () => onFinish()
      );
    } catch (_) {
      onFinish();
    }
  }

  function speakWithSystemVoice(text, hasArabic, preferredURI, onFinish) {
    if (!("speechSynthesis" in window)) {
      onFinish();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const voices = window.speechSynthesis.getVoices() || osVoicesCache;
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = state.ttsRate;
      utter.volume = Math.min(1.0, Math.max(0.1, state.ttsVolume / 2));

      let chosen = null;
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

  function resolveCloudLang(voiceChoice, hasArabic) {
    if (voiceChoice === "cloud-ar") return "ar";
    if (voiceChoice === "cloud-en-us") return "en-US";
    if (voiceChoice === "cloud-en-gb") return "en-GB";
    if (voiceChoice === "cloud-en-au") return "en-AU";
    return hasArabic ? "ar" : "en-US"; // cloud-auto
  }

  function speakCurrentStudentName(onComplete) {
    const current = state.rows[state.currentIndex];
    if (!state.ttsEnabled || !current) {
      state.isSpeakingName = false;
      if (onComplete) onComplete();
      return;
    }

    stopSpeakingName();
    const textToSpeak = getSpokenName(current);
    if (!textToSpeak || textToSpeak.startsWith("Student #")) {
      state.isSpeakingName = false;
      if (onComplete) onComplete();
      return;
    }

    state.isSpeakingName = true;
    transcriptText.textContent = `🔊 "${textToSpeak}"`;

    const hasArabic = /[\u0600-\u06FF]/.test(textToSpeak);
    let finished = false;
    const finishSpeaking = () => {
      if (finished) return;
      finished = true;
      clearTimeout(state.ttsSafetyTimer);
      setTimeout(() => {
        state.isSpeakingName = false;
        state.lastTriggerTime = Date.now() - 450;
        if (state.isRunning && !state.isHardwareMuted) {
          transcriptText.textContent = "🎙️ Listening (نعم / حاضر / Yes)...";
        }
        if (onComplete) onComplete();
      }, 120);
    };

    state.ttsSafetyTimer = setTimeout(finishSpeaking, 4800);

    // If user explicitly chose an offline OS voice
    if (state.ttsVoice.startsWith("os:")) {
      const uri = state.ttsVoice.slice(3);
      speakWithSystemVoice(textToSpeak, hasArabic, uri, finishSpeaking);
      return;
    }

    // Otherwise use Neural Cloud TTS (with offline OS fallback)
    const targetLang = resolveCloudLang(state.ttsVoice, hasArabic);
    try {
      chrome.runtime.sendMessage(
        { action: "FETCH_NATIVE_TTS", text: textToSpeak, lang: targetLang },
        (response) => {
          if (chrome.runtime.lastError || !response?.ok || !response?.base64) {
            speakWithSystemVoice(textToSpeak, hasArabic, null, finishSpeaking);
            return;
          }
          playBase64ViaWebAudio(response.base64, state.ttsRate, state.ttsVolume, finishSpeaking);
        }
      );
    } catch (_) {
      speakWithSystemVoice(textToSpeak, hasArabic, null, finishSpeaking);
    }
  }

  /* ==========================================================================
   * 6. SHADOW DOM HUD (RESPONSIVE, ISOLATED, ZERO FINGERPRINTING)
   * ========================================================================== */
  const host = document.createElement("div");
  host.id = "uni-attend-ai-host";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        direction: ltr !important;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      * { box-sizing: border-box; }
      .hud {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 380px;
        min-width: 320px;
        max-width: 94vw;
        max-height: 92vh;
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid #334155;
        border-radius: 14px;
        box-shadow: 0 22px 50px rgba(0,0,0,0.55);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        user-select: none;
        direction: ltr !important;
        text-align: left;
      }
      .hud.closed { display: none !important; }
      .hud.minimized { height: auto !important; }
      .hud.minimized .hud-body,
      .hud.minimized .resize-handle { display: none !important; }

      .hud-header {
        background: #1e293b;
        padding: 10px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #334155;
        cursor: move;
        flex-shrink: 0;
      }
      .brand { display: flex; align-items: center; gap: 9px; }
      .brand-logo {
        width: 26px;
        height: 26px;
        border-radius: 6px;
        object-fit: cover;
        border: 1px solid #334155;
        background: #0f172a;
      }
      .brand-text { display: flex; flex-direction: column; }
      .brand-title {
        font-weight: 800;
        font-size: 13.5px;
        color: #f8fafc;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .brand-sub { font-size: 10px; font-weight: 600; color: #38bdf8; }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #64748b;
        display: inline-block;
      }
      .dot.live {
        background: #10b981;
        box-shadow: 0 0 10px #10b981;
        animation: pulse 1.2s infinite;
      }
      .dot.warn {
        background: #f59e0b;
        box-shadow: 0 0 10px #f59e0b;
        animation: pulse 0.8s infinite;
      }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

      .header-btns { display: flex; align-items: center; gap: 5px; }
      .header-btns button {
        background: #0f172a;
        border: 1px solid #334155;
        color: #94a3b8;
        cursor: pointer;
        font-size: 12px;
        font-weight: 800;
        width: 26px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.15s ease;
      }
      .header-btns button:hover { background: #334155; color: #fff; }
      .header-btns button.close-btn:hover { background: #ef4444; border-color: #ef4444; color: #fff; }

      .hud-body {
        padding: 13px 14px;
        display: flex;
        flex-direction: column;
        gap: 9px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #334155 transparent;
      }

      /* Hardware Mute Alert Banner */
      .mute-alert {
        display: none;
        background: rgba(239, 68, 68, 0.18);
        border: 1px solid #ef4444;
        border-radius: 9px;
        padding: 8px 10px;
        font-size: 11.5px;
        font-weight: 700;
        color: #fecaca;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .mute-alert.visible { display: flex; }
      .mute-retry-btn {
        background: #ef4444;
        border: none;
        color: #fff;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 10.5px;
        font-weight: 800;
        cursor: pointer;
        flex-shrink: 0;
      }
      .mute-retry-btn:hover { filter: brightness(1.15); }

      .student-card {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 10px;
        padding: 10px 12px;
      }
      .student-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11.5px;
        font-weight: 600;
        color: #94a3b8;
        margin-bottom: 4px;
      }
      .student-name-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .student-name {
        font-size: 14.5px;
        font-weight: 700;
        color: #f1f5f9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        direction: auto;
        text-align: start;
        flex: 1;
      }
      .speak-btn {
        background: #0284c7;
        border: none;
        color: #fff;
        border-radius: 6px;
        padding: 4px 9px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        flex-shrink: 0;
      }
      .speak-btn:hover { filter: brightness(1.15); }

      .timer-bar-wrap {
        width: 100%;
        height: 5px;
        background: #0f172a;
        border-radius: 4px;
        margin-top: 8px;
        overflow: hidden;
      }
      .timer-bar {
        height: 100%;
        width: 100%;
        background: linear-gradient(90deg, #3b82f6, #ef4444);
        transition: width 0.1s linear;
      }

      .stats-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        text-align: center;
      }
      .stat-box {
        background: #1e293b;
        padding: 6px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
      }
      .stat-box strong {
        display: block;
        font-size: 15px;
        font-weight: 800;
        color: #f8fafc;
        margin-top: 2px;
      }
      .stat-present strong { color: #10b981; }
      .stat-absent strong { color: #ef4444; }

      .btn-grid {
        display: grid;
        grid-template-columns: 0.9fr 1.1fr 1.25fr 1.25fr;
        gap: 5px;
      }
      button.ctrl {
        border: none;
        border-radius: 8px;
        padding: 8px 6px;
        font-size: 11.5px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        transition: filter 0.15s;
      }
      button.ctrl:hover { filter: brightness(1.12); }
      .btn-main {
        width: 100%;
        padding: 10px !important;
        font-size: 13px !important;
        background: #2563eb;
        color: #fff;
      }
      .btn-main.running { background: #dc2626; }
      .btn-prev { background: #334155; color: #e2e8f0; }
      .btn-repeat { background: #0284c7; color: #fff; }
      .btn-present { background: #059669; color: #fff; }
      .btn-absent { background: #e11d48; color: #fff; }
      .btn-secondary {
        background: #1e293b;
        color: #cbd5e1;
        border: 1px solid #334155 !important;
        font-size: 11px !important;
        padding: 6px 8px !important;
      }

      .transcript-box {
        background: #090d16;
        border: 1px solid #1e293b;
        border-radius: 8px;
        padding: 7px 10px;
        font-size: 12px;
        color: #38bdf8;
        min-height: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .transcript-text {
        direction: auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        text-align: right;
        font-weight: 600;
      }

      .settings-panel {
        background: #1e293b;
        border-radius: 10px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 7px;
        font-size: 11.5px;
      }
      .setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .setting-row label {
        color: #cbd5e1;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 5px;
        cursor: pointer;
        white-space: nowrap;
      }
      .slider-ctrl {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .slider-val {
        font-weight: 700;
        color: #38bdf8;
        min-width: 34px;
        text-align: right;
      }
      input[type="range"] { width: 92px; accent-color: #3b82f6; cursor: pointer; }
      select {
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid #334155;
        border-radius: 6px;
        padding: 3px 6px;
        font-size: 11px;
        font-weight: 600;
        max-width: 185px;
      }
      .vu-meter {
        width: 100%;
        height: 6px;
        background: #0f172a;
        border-radius: 4px;
        overflow: hidden;
      }
      .vu-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #10b981, #f59e0b, #ef4444);
        transition: width 0.05s ease;
      }
      .kbd-hint {
        font-size: 11px;
        font-weight: 700;
        color: #cbd5e1;
        text-align: center;
        padding-top: 2px;
      }
      .kbd-hint b { color: #38bdf8; }
      .resize-handle {
        position: absolute;
        right: 2px;
        bottom: 2px;
        width: 14px;
        height: 14px;
        cursor: nwse-resize;
        color: #475569;
        font-size: 10px;
        line-height: 1;
        text-align: right;
      }
      .resize-handle:hover { color: #38bdf8; }
    </style>

    <div class="hud" id="hud">
      <div class="hud-header" id="hudHeader">
        <div class="brand">
          <img class="brand-logo" id="brandLogo" alt="Logo" style="display:none;">
          <div class="brand-text">
            <span class="brand-title">
              <span class="dot" id="statusDot"></span>
              <span>UniAttend AI</span>
            </span>
            <span class="brand-sub">by Obieda.M</span>
          </div>
        </div>
        <div class="header-btns">
          <button id="minBtn" title="Minimize">_</button>
          <button id="closeBtn" class="close-btn" title="Shut Off & Close (Alt+A)">✕</button>
        </div>
      </div>

      <div class="hud-body">
        <div class="mute-alert" id="muteAlert">
          <span id="muteAlertText">🔇 Mic is muted! Unmute your laptop mic key. Timer paused.</span>
          <button class="mute-retry-btn" id="retryMicBtn">Retry</button>
        </div>

        <div class="student-card">
          <div class="student-meta">
            <span id="progressText">Student 0 / 0</span>
            <span id="timerText">Timer: 5.0s</span>
          </div>
          <div class="student-name-row">
            <div class="student-name" id="currentName">Scanning page...</div>
            <button class="speak-btn" id="speakNowBtn" title="Repeat name aloud (↑)">🔁 Repeat</button>
          </div>
          <div class="timer-bar-wrap">
            <div class="timer-bar" id="timerBar"></div>
          </div>
        </div>

        <div class="stats-row">
          <div class="stat-box stat-present">Present<strong id="statPresent">0</strong></div>
          <div class="stat-box stat-absent">Absent<strong id="statAbsent">0</strong></div>
          <div class="stat-box">Remaining<strong id="statRemain">0</strong></div>
        </div>

        <button class="ctrl btn-main" id="toggleRunBtn">▶ Start Voice Attendance (Space)</button>

        <div class="btn-grid">
          <button class="ctrl btn-prev" id="prevBtn" title="Previous (←)">⏮ Prev</button>
          <button class="ctrl btn-repeat" id="repeatBtn" title="Repeat Name (↑)">🔁 Repeat (↑)</button>
          <button class="ctrl btn-present" id="presentBtn" title="Present (→)">✅ Present (→)</button>
          <button class="ctrl btn-absent" id="absentBtn" title="Absent (↓)">❌ Absent (↓)</button>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
          <button class="ctrl btn-secondary" id="scanBtn">🔄 Auto-Scan Rows</button>
          <button class="ctrl btn-secondary" id="pickBtn">🎯 Pick 1st Checkbox</button>
        </div>

        <div class="transcript-box">
          <span style="color:#64748b; font-size:10px; font-weight:800;">STATUS:</span>
          <span class="transcript-text" id="transcriptText">Mic Off (Ready)</span>
        </div>

        <div class="settings-panel">
          <div class="setting-row">
            <label title="Read student names aloud">
              <input type="checkbox" id="ttsToggle"> 🔊 Read Names
            </label>
            <div class="slider-ctrl">
              <input type="range" id="ttsRateSlider" min="0.80" max="1.50" step="0.05">
              <span class="slider-val" id="ttsRateVal">1.05x</span>
            </div>
          </div>

          <div class="setting-row">
            <label>🗣️ TTS Voice</label>
            <select id="voiceSelect"></select>
          </div>

          <div class="setting-row">
            <label>🔈 Speaker Boost</label>
            <div class="slider-ctrl">
              <input type="range" id="ttsVolSlider" min="0.5" max="3.0" step="0.25">
              <span class="slider-val" id="ttsVolVal">2.0x</span>
            </div>
          </div>

          <div class="setting-row">
            <label title="Reads only First + Father's name">
              <input type="checkbox" id="twoNamesToggle"> ✂️ First 2 Parts
            </label>
            <label title="Toggle coloring rows on the page">
              <input type="checkbox" id="colorToggle"> 🎨 Color Rows
            </label>
          </div>

          <div class="setting-row">
            <label><input type="checkbox" id="timerToggle"> ⏱️ Auto-Absent</label>
            <div class="slider-ctrl">
              <input type="range" id="timerSlider" min="2" max="15" step="1">
              <span class="slider-val" id="timerVal">5s</span>
            </div>
          </div>

          <div class="setting-row">
            <label>🎙️ Mic Meter Gain</label>
            <div class="slider-ctrl">
              <input type="range" id="gainSlider" min="1" max="5" step="0.5">
              <span class="slider-val" id="gainVal">2.5x</span>
            </div>
          </div>

          <div class="vu-meter" title="Live Microphone Input Level">
            <div class="vu-fill" id="vuFill"></div>
          </div>

          <div class="setting-row">
            <select id="modeSelect" title="Portal checkbox rule">
              <option value="absent">Box Checked = Absent</option>
              <option value="present">Box Checked = Present</option>
            </select>
            <select id="langSelect" title="Speech recognition language">
              <option value="ar-JO">AR + EN (الأردن)</option>
              <option value="en-US">English (US)</option>
            </select>
          </div>
        </div>

        <div class="kbd-hint">
          <b>[→]</b> Present • <b>[↓]</b> Absent • <b>[↑]</b> Repeat • <b>[←]</b> Back • <b>[Space]</b> Pause
        </div>
      </div>
      <div class="resize-handle" id="resizeHandle" title="Drag to resize">◢</div>
    </div>
  `;

  /* ==========================================================================
   * 7. UI REFERENCES, LOGO LOADER, VOICE LIST & DRAG/RESIZE
   * ========================================================================== */
  const $ = (id) => shadow.getElementById(id);
  const hud = $("hud");
  const statusDot = $("statusDot");
  const muteAlert = $("muteAlert");
  const muteAlertText = $("muteAlertText");
  const progressText = $("progressText");
  const timerText = $("timerText");
  const currentName = $("currentName");
  const timerBar = $("timerBar");
  const statPresent = $("statPresent");
  const statAbsent = $("statAbsent");
  const statRemain = $("statRemain");
  const toggleRunBtn = $("toggleRunBtn");
  const transcriptText = $("transcriptText");
  const vuFill = $("vuFill");
  const voiceSelect = $("voiceSelect");

  // Load logo safely from service worker (zero web_accessible_resources exposure)
  try {
    chrome.runtime.sendMessage({ action: "GET_LOGO" }, (res) => {
      if (!chrome.runtime.lastError && res?.ok && res.dataUrl) {
        const img = $("brandLogo");
        img.src = res.dataUrl;
        img.style.display = "block";
      }
    });
  } catch (_) {}

  function populateVoiceDropdown() {
    const voices = "speechSynthesis" in window ? window.speechSynthesis.getVoices() || [] : [];
    osVoicesCache = voices;
    const prevValue = state.ttsVoice;

    voiceSelect.textContent = "";

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
    voiceSelect.appendChild(cloudGroup);

    const arEnVoices = voices.filter((v) => /^(ar|en)/i.test(v.lang || ""));
    if (arEnVoices.length) {
      const osGroup = document.createElement("optgroup");
      osGroup.label = "System Voices (Offline)";
      for (const v of arEnVoices) {
        const opt = document.createElement("option");
        opt.value = `os:${v.voiceURI}`;
        const tag = /^ar/i.test(v.lang) ? "[AR]" : "[EN]";
        opt.textContent = `${tag} ${v.name}`.slice(0, 38);
        osGroup.appendChild(opt);
      }
      voiceSelect.appendChild(osGroup);
    }

    // Restore saved selection if valid
    const exists = Array.from(voiceSelect.options).some((o) => o.value === prevValue);
    voiceSelect.value = exists ? prevValue : "cloud-auto";
    state.ttsVoice = voiceSelect.value;
  }

  if ("speechSynthesis" in window) {
    populateVoiceDropdown();
    window.speechSynthesis.onvoiceschanged = populateVoiceDropdown;
  } else {
    populateVoiceDropdown();
  }

  function syncUIFromSettings() {
    hud.style.width = `${Math.max(320, Math.min(window.innerWidth - 20, state.hudWidth))}px`;
    $("ttsToggle").checked = state.ttsEnabled;
    $("ttsRateSlider").value = state.ttsRate;
    $("ttsRateVal").textContent = `${Number(state.ttsRate).toFixed(2)}x`;
    $("ttsVolSlider").value = state.ttsVolume;
    $("ttsVolVal").textContent = `${Number(state.ttsVolume).toFixed(1)}x`;
    $("twoNamesToggle").checked = state.firstTwoNamesOnly;
    $("colorToggle").checked = state.colorPageRows;
    $("timerToggle").checked = state.timerEnabled;
    $("timerSlider").value = state.timerDuration;
    $("timerVal").textContent = `${state.timerDuration}s`;
    $("gainSlider").value = state.micGain;
    $("gainVal").textContent = `${Number(state.micGain).toFixed(1)}x`;
    $("modeSelect").value = state.invertMode ? "absent" : "present";
    $("langSelect").value = state.langMode;
    populateVoiceDropdown();
  }

  // Dragging & Resizing
  let isDragging = false, dragOffX = 0, dragOffY = 0;
  $("hudHeader").addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    isDragging = true;
    const rect = hud.getBoundingClientRect();
    dragOffX = e.clientX - rect.left;
    dragOffY = e.clientY - rect.top;
  });

  let isResizing = false, startW = 0, startX = 0;
  $("resizeHandle").addEventListener("mousedown", (e) => {
    e.stopPropagation();
    isResizing = true;
    const rect = hud.getBoundingClientRect();
    hud.style.right = "auto";
    hud.style.left = `${rect.left}px`;
    startW = rect.width;
    startX = e.clientX;
  });

  window.addEventListener("mousemove", (e) => {
    if (isDragging) {
      hud.style.right = "auto";
      hud.style.bottom = "auto";
      hud.style.left = `${Math.max(6, Math.min(window.innerWidth - hud.offsetWidth - 6, e.clientX - dragOffX))}px`;
      hud.style.top = `${Math.max(6, Math.min(window.innerHeight - 60, e.clientY - dragOffY))}px`;
    } else if (isResizing) {
      const nextW = Math.max(320, Math.min(window.innerWidth - 20, startW + (e.clientX - startX)));
      hud.style.width = `${nextW}px`;
      state.hudWidth = Math.round(nextW);
      saveSettings();
    }
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
    isResizing = false;
  });

  $("minBtn").addEventListener("click", () => hud.classList.toggle("minimized"));

  /* ==========================================================================
   * 8. UNIVERSAL DOM SCANNER (TABLES, IFRAMES, SHADOW ROOTS, OFF-CENTER/CUSTOM)
   * ========================================================================== */
  function isElementHiddenByCSS(el) {
    let node = el;
    while (node && node.nodeType === 1) {
      const win = node.ownerDocument?.defaultView || window;
      const style = win.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return true;
      node = node.parentElement;
    }
    return false;
  }

  function getVisualTarget(cb) {
    const doc = cb.ownerDocument || document;
    const pfBox = cb.closest(".ui-chkbox")?.querySelector(".ui-chkbox-box");
    if (pfBox) return pfBox;

    const rect = cb.getBoundingClientRect();
    if (rect.width >= 8 && rect.height >= 8) return cb;

    // Custom styled/sr-only checkboxes often hide the <input> and style its <label>
    if (cb.id) {
      const linkedLabel = doc.querySelector(`label[for="${CSS.escape(cb.id)}"]`);
      if (linkedLabel) return linkedLabel;
    }
    const parentLabel = cb.closest("label");
    if (parentLabel) return parentLabel;

    return cb.parentElement || cb;
  }

  function collectCheckboxesFromRoot(root, results) {
    if (!root) return;
    const selector = 'input[type="checkbox"], [role="checkbox"]';
    const found = root.querySelectorAll(selector);
    for (const el of found) {
      if (el.closest("#uni-attend-ai-host")) continue;
      if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
      if (el.closest("th, thead")) continue;

      const visual = getVisualTarget(el);
      if (isElementHiddenByCSS(visual)) continue;
      const rect = visual.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      results.push({ el, visual });
    }

    // Traverse open Shadow Roots (modern web components)
    const allEls = root.querySelectorAll("*");
    for (const node of allEls) {
      if (node.id === "uni-attend-ai-host") continue;
      if (node.shadowRoot) {
        collectCheckboxesFromRoot(node.shadowRoot, results);
      }
    }
  }

  function findSafeRowElement(cb) {
    const tableOrList = cb.closest("tr, li, .student-row, .row, [role='row']");
    if (tableOrList) {
      const h = tableOrList.getBoundingClientRect().height;
      if (h > 0 && h < 140) return tableOrList;
    }
    let parent = cb.parentElement;
    for (let depth = 0; depth < 3 && parent; depth++) {
      const rect = parent.getBoundingClientRect();
      if (rect.height > 0 && rect.height < 95 && parent.innerText.trim().length > 1) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  function splitIntoLogicalNameParts(cleanName) {
    const rawWords = cleanName.split(/\s+/).filter(Boolean);
    const prefixes = new Set(["عبد", "ابو", "أبو", "ابي", "أبي", "ابن", "بن", "ام", "أم", "آل"]);
    const suffixes = new Set([
      "الله", "الدين", "الاسلام", "الإسلام", "الحق", "الهدى", "النور",
      "الرحمن", "الرحيم", "الكريم", "العزيز", "المجيد", "الحميد", "الوهاب", "الفتاح", "الرزاق"
    ]);

    const parts = [];
    for (let i = 0; i < rawWords.length; i++) {
      let current = rawWords[i];
      if (prefixes.has(current) && i + 1 < rawWords.length) {
        current += " " + rawWords[i + 1];
        i++;
      }
      if (i + 1 < rawWords.length && suffixes.has(rawWords[i + 1]) && !current.includes(" ")) {
        current += " " + rawWords[i + 1];
        i++;
      }
      parts.push(current);
    }
    return parts;
  }

  function extractStudentNames(cb, rowEl, idx) {
    const doc = cb.ownerDocument || document;
    let candidateText = "";

    // 1. Table row: combine name-like cells (handles both single-cell full name & First/Last columns)
    if (rowEl && (rowEl.tagName === "TR" || rowEl.getAttribute("role") === "row")) {
      const cells = Array.from(rowEl.querySelectorAll("td, [role='cell'], [role='gridcell']"));
      const nameCells = [];
      for (const td of cells) {
        if (td.contains(cb) && td.innerText.trim().length < 3) continue;
        const txt = td.innerText.replace(/\s+/g, " ").trim();
        const letters = (txt.match(/[\u0600-\u06FFa-zA-Z]/g) || []).length;
        const digits = (txt.match(/\d/g) || []).length;
        if (letters >= 2 && letters > digits) {
          nameCells.push({ txt, letters });
        }
      }
      if (nameCells.length) {
        // Pick primary longest name cell, or join up to 2 short name cells (e.g., First + Last columns)
        nameCells.sort((a, b) => b.letters - a.letters);
        candidateText = nameCells[0].txt;
      }
    }

    // 2. Explicit <label for="id"> or aria-label
    if (!candidateText && cb.id) {
      const lbl = doc.querySelector(`label[for="${CSS.escape(cb.id)}"]`);
      if (lbl) candidateText = lbl.innerText.replace(/\s+/g, " ").trim();
    }
    if (!candidateText) {
      const aria = cb.getAttribute("aria-label");
      if (aria) candidateText = aria.trim();
    }

    // 3. Fallback: clean text from safe parent row
    if (!candidateText && rowEl) {
      const clone = rowEl.cloneNode(true);
      clone.querySelectorAll("input, button, select, script, style").forEach((el) => el.remove());
      candidateText = clone.innerText.replace(/\s+/g, " ").trim();
    }

    const displayName = candidateText.length > 1 ? candidateText.slice(0, 68) : `Student #${idx}`;
    const cleaned = candidateText
      .replace(/\([^)]*\)/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/[0-9٠-٩]+/g, " ")
      .replace(/[.,/_:;•\-|#]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const fullSpeechName = cleaned.length > 1 ? cleaned : displayName;
    const parts = splitIntoLogicalNameParts(fullSpeechName);
    const shortSpeechName = parts.slice(0, 2).join(" ") || fullSpeechName;

    return { displayName, fullSpeechName, shortSpeechName };
  }

  function isChecked(el) {
    if (el.tagName === "INPUT") return Boolean(el.checked);
    return el.getAttribute("aria-checked") === "true";
  }

  function clearHighlights() {
    for (const doc of getAccessibleDocuments()) {
      try {
        doc.querySelectorAll(".ua-cb-active, .ua-row-active, .ua-row-present, .ua-row-absent").forEach((el) => {
          el.classList.remove("ua-cb-active", "ua-row-active", "ua-row-present", "ua-row-absent");
        });
      } catch (_) {}
    }
  }

  function scanCheckboxes(anchorEl = null) {
    clearHighlights();
    const docs = getAccessibleDocuments();
    const collected = [];

    for (const doc of docs) {
      ensureStylesInDoc(doc);
      collectCheckboxesFromRoot(doc, collected);
    }

    let filtered = collected;
    if (anchorEl) {
      const anchorTable = anchorEl.closest("table");
      const anchorTd = anchorEl.closest("td");
      const anchorRect = getVisualTarget(anchorEl).getBoundingClientRect();

      if (anchorTable && anchorTd) {
        // Table-column lock: rock-solid even when checkboxes are slightly misaligned
        const targetColIndex = anchorTd.cellIndex;
        let reachedAnchor = false;
        filtered = collected.filter(({ el }) => {
          if (el === anchorEl) reachedAnchor = true;
          if (!reachedAnchor) return false;
          return el.closest("table") === anchorTable && el.closest("td")?.cellIndex === targetColIndex;
        });
      } else {
        // Spatial column lock with generous 80px tolerance for off-center layouts
        filtered = collected.filter(({ visual }) => {
          const r = visual.getBoundingClientRect();
          return r.top >= anchorRect.top - 10 && Math.abs(r.left - anchorRect.left) < 80;
        });
      }
    }

    state.rows = filtered.map(({ el, visual }, idx) => {
      const rowEl = findSafeRowElement(el);
      const { displayName, fullSpeechName, shortSpeechName } = extractStudentNames(el, rowEl, idx + 1);
      const checked = isChecked(el);
      const initialStatus = checked ? (state.invertMode ? "absent" : "present") : "pending";
      return {
        checkbox: el,
        visualBox: visual,
        rowEl,
        nameText: displayName,
        fullSpeechName,
        shortSpeechName,
        status: initialStatus
      };
    });

    state.currentIndex = 0;
    state.timeLeft = state.timerDuration;
    updateUI();
    if (!state.isClosed && state.rows.length > 0) {
      highlightCurrentRow();
    }
  }

  function highlightCurrentRow() {
    if (state.isClosed) return;
    state.rows.forEach((item, idx) => {
      const isCurrent = idx === state.currentIndex;
      if (item.visualBox) {
        item.visualBox.classList.toggle("ua-cb-active", isCurrent);
      }
      if (item.rowEl) {
        item.rowEl.classList.toggle("ua-row-active", state.colorPageRows && isCurrent);
        item.rowEl.classList.toggle("ua-row-present", state.colorPageRows && item.status === "present");
        item.rowEl.classList.toggle("ua-row-absent", state.colorPageRows && item.status === "absent");
      }
    });

    const current = state.rows[state.currentIndex];
    const scrollTarget = current?.rowEl || current?.visualBox || current?.checkbox;
    if (scrollTarget) {
      // inline: "center" fixes horizontally off-center or clipped tables
      scrollTarget.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }

  // Universal checkbox mutator (HTML, PrimeFaces, React/Vue controlled inputs, ARIA)
  function setCheckboxChecked(item, shouldCheck) {
    const cb = item?.checkbox;
    if (!cb || isChecked(cb) === shouldCheck) return;

    // 1. ARIA role="checkbox"
    if (cb.tagName !== "INPUT") {
      cb.click();
      return;
    }

    // 2. PrimeFaces wrapper (.ui-chkbox-box)
    const pfBox = cb.closest(".ui-chkbox")?.querySelector(".ui-chkbox-box");
    if (pfBox) {
      pfBox.click();
      if (cb.checked === shouldCheck) return;
    }

    // 3. React / Vue / Angular / Native HTML input
    try {
      const win = cb.ownerDocument?.defaultView || window;
      const nativeSetter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "checked")?.set;
      if (nativeSetter) {
        nativeSetter.call(cb, shouldCheck);
      } else {
        cb.checked = shouldCheck;
      }
      cb.dispatchEvent(new Event("click", { bubbles: true }));
      cb.dispatchEvent(new Event("input", { bubbles: true }));
      cb.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (_) {
      cb.checked = shouldCheck;
    }
  }

  /* ==========================================================================
   * 9. ATTENDANCE ACTIONS & COUNTDOWN LOOP
   * ========================================================================== */
  function markPresent() {
    if (!state.rows.length || state.currentIndex >= state.rows.length) return;
    stopSpeakingName();
    const item = state.rows[state.currentIndex];
    setCheckboxChecked(item, !state.invertMode); // invertMode=true -> Present leaves box UNCHECKED
    item.status = "present";
    playBeep("present");
    advanceRow();
  }

  function markAbsent(reason = "Absent") {
    if (!state.rows.length || state.currentIndex >= state.rows.length) return;
    stopSpeakingName();
    const item = state.rows[state.currentIndex];
    setCheckboxChecked(item, state.invertMode); // invertMode=true -> Absent CHECKS the box
    item.status = "absent";
    transcriptText.textContent = `❌ Marked Absent (${reason})`;
    playBeep("absent");
    advanceRow();
  }

  function advanceRow() {
    state.lastTriggerTime = Date.now();
    if (state.currentIndex < state.rows.length - 1) {
      state.currentIndex++;
      state.timeLeft = state.timerDuration;
      highlightCurrentRow();
      updateUI();
      if (state.isRunning && state.ttsEnabled && !state.isHardwareMuted) {
        speakCurrentStudentName();
      }
    } else {
      highlightCurrentRow();
      updateUI();
      stopAutomation("🎉 All students completed! (Mic Off)");
    }
  }

  function prevRow() {
    if (!state.rows.length || state.currentIndex <= 0) return;
    stopSpeakingName();
    state.currentIndex--;
    state.timeLeft = state.timerDuration;
    highlightCurrentRow();
    updateUI();
    if (state.isRunning && state.ttsEnabled && !state.isHardwareMuted) {
      speakCurrentStudentName();
    }
  }

  function repeatCurrentName() {
    if (!state.rows.length) return;
    state.timeLeft = state.timerDuration;
    updateUI();
    const wasEnabled = state.ttsEnabled;
    state.ttsEnabled = true;
    speakCurrentStudentName();
    state.ttsEnabled = wasEnabled;
  }

  function updateUI() {
    const total = state.rows.length;
    const current = state.rows[state.currentIndex];
    progressText.textContent = total ? `Student ${state.currentIndex + 1} / ${total}` : "No checkboxes found";
    currentName.textContent = current ? current.nameText : "Click Auto-Scan or Pick 1st Box";

    const presentCount = state.rows.filter((r) => r.status === "present").length;
    const absentCount = state.rows.filter((r) => r.status === "absent").length;
    statPresent.textContent = presentCount;
    statAbsent.textContent = absentCount;
    statRemain.textContent = Math.max(0, total - presentCount - absentCount);

    if (state.isHardwareMuted) {
      timerText.textContent = "Timer: PAUSED (Mic Muted)";
    } else {
      timerText.textContent = state.timerEnabled ? `Timer: ${state.timeLeft.toFixed(1)}s` : "Timer: OFF";
    }
    const pct = state.timerEnabled ? Math.max(0, (state.timeLeft / state.timerDuration) * 100) : 100;
    timerBar.style.width = `${pct}%`;
  }

  function startTimerLoop() {
    clearInterval(state.timerInterval);
    state.timeLeft = state.timerDuration;
    state.timerInterval = setInterval(() => {
      if (!state.isRunning || !state.timerEnabled || !state.rows.length) return;
      if (state.isSpeakingName || state.isHardwareMuted) return; // Never tick while TTS speaks or mic is muted!
      state.timeLeft = Math.max(0, state.timeLeft - 0.1);
      updateUI();
      if (state.timeLeft <= 0) {
        markAbsent("Time Expired");
      }
    }, 100);
  }

  /* ==========================================================================
   * 10. HARDWARE MIC-MUTE GUARD & WEB AUDIO METER
   * ========================================================================== */
  let audioCtx = null, micStream = null, gainNode = null, analyser = null, vuAnimId = null;
  let flatlineFrames = 0;

  function setHardwareMuted(isMuted, customMsg = null) {
    if (state.isHardwareMuted === isMuted && !customMsg) return;
    state.isHardwareMuted = isMuted;

    if (isMuted) {
      muteAlertText.textContent = customMsg || "🔇 Mic is hardware-muted! Press your laptop's mic key. Timer paused.";
      muteAlert.classList.add("visible");
      statusDot.classList.remove("live");
      statusDot.classList.add("warn");
      transcriptText.textContent = "🔇 Waiting for mic unmute...";
      playBeep("warn");
      updateUI();
    } else {
      muteAlert.classList.remove("visible");
      statusDot.classList.remove("warn");
      if (state.isRunning) {
        statusDot.classList.add("live");
        transcriptText.textContent = "🎙️ Mic restored! Listening...";
        // Ensure SpeechRecognition is alive after unmuting
        if (recognition) {
          try { recognition.start(); } catch (_) {}
        }
      }
      updateUI();
    }
  }

  async function startMicMonitor() {
    stopMicMonitor();
    flatlineFrames = 0;

    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true
        }
      });

      const audioTrack = micStream.getAudioTracks()[0];
      if (!audioTrack || audioTrack.readyState === "ended") {
        setHardwareMuted(true, "🔇 Microphone disconnected! Check audio device.");
        return;
      }

      if (audioTrack.muted) {
        setHardwareMuted(true);
      }

      audioTrack.onmute = () => {
        if (state.isRunning) setHardwareMuted(true);
      };
      audioTrack.onunmute = () => {
        flatlineFrames = 0;
        if (state.isRunning) setHardwareMuted(false);
      };
      audioTrack.onended = () => {
        if (state.isRunning) setHardwareMuted(true, "🔇 Mic disconnected! Click Retry after reconnecting.");
      };

      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(micStream);

      const filter = audioCtx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1200;
      filter.Q.value = 0.7;

      gainNode = audioCtx.createGain();
      gainNode.gain.value = state.micGain;

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;

      // Also tap raw un-filtered input for accurate digital-zero flatline detection
      const rawAnalyser = audioCtx.createAnalyser();
      rawAnalyser.fftSize = 256;

      source.connect(rawAnalyser);
      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(analyser);

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(rawAnalyser.fftSize);

      const updateMeter = () => {
        if (!state.isRunning) {
          vuFill.style.width = "0%";
          return;
        }

        // 1. Detect hardware-muted digital flatline (all samples identically 128)
        rawAnalyser.getByteTimeDomainData(timeData);
        let maxDev = 0;
        for (let i = 0; i < timeData.length; i++) {
          const d = Math.abs(timeData[i] - 128);
          if (d > maxDev) maxDev = d;
        }

        if (maxDev === 0) {
          if (!state.isSpeakingName) {
            flatlineFrames++;
            if (flatlineFrames >= 105 && !state.isHardwareMuted) {
              // ~1.75 seconds of pure digital silence => hardware mic mute key is ON
              setHardwareMuted(true);
            }
          }
        } else {
          flatlineFrames = 0;
          if (state.isHardwareMuted && !audioTrack.muted) {
            setHardwareMuted(false);
          }
        }

        // 2. Render boosted VU bar
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
        const avg = sum / freqData.length;
        const level = maxDev === 0 ? 0 : Math.min(100, Math.round((avg / 128) * 100));
        vuFill.style.width = `${level}%`;

        vuAnimId = requestAnimationFrame(updateMeter);
      };
      updateMeter();
    } catch (err) {
      const msg =
        err?.name === "NotFoundError"
          ? "🔇 No microphone detected on this PC."
          : "⚠️ Mic permission blocked or unavailable.";
      setHardwareMuted(true, msg);
    }
  }

  function stopMicMonitor() {
    if (vuAnimId) {
      cancelAnimationFrame(vuAnimId);
      vuAnimId = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((track) => {
        track.onmute = null;
        track.onunmute = null;
        track.onended = null;
        track.stop();
      });
      micStream = null;
    }
    if (audioCtx && audioCtx.state !== "closed") {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    gainNode = null;
    analyser = null;
    flatlineFrames = 0;
    vuFill.style.width = "0%";
  }

  /* ==========================================================================
   * 11. FAST REAL-TIME SPEECH RECOGNITION ENGINE
   * ========================================================================== */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  function matchesCompiledDict(normChunk, wordsArray, dict) {
    for (const phrase of dict.phrases) {
      if (normChunk.includes(phrase)) return true;
    }
    for (const w of wordsArray) {
      if (dict.single.has(w)) return true;
    }
    return false;
  }

  function checkKeywords(newTextChunk) {
    if (state.isSpeakingName || state.isHardwareMuted) return;
    if (Date.now() - state.lastTriggerTime < 650) return;

    const norm = normalizeText(newTextChunk);
    if (!norm) return;
    const words = norm.split(" ");

    if (matchesCompiledDict(norm, words, ABSENT_DICT)) {
      transcriptText.textContent = `❌ "${newTextChunk.trim()}"`;
      markAbsent("Voice");
      return;
    }

    if (matchesCompiledDict(norm, words, PRESENT_DICT)) {
      transcriptText.textContent = `✅ "${newTextChunk.trim()}"`;
      markPresent();
    }
  }

  function initSpeech() {
    if (!SpeechRecognition) {
      transcriptText.textContent = "⚠️ Use Chrome or Edge for Speech API";
      return;
    }
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = state.langMode;

    recognition.onresult = (event) => {
      if (!state.isRunning) return;
      if (state.isHardwareMuted) setHardwareMuted(false);

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (state.isSpeakingName) {
          state.processedCharCounts.set(i, transcript.length);
          continue;
        }

        const prevLen = state.processedCharCounts.get(i) || 0;
        const freshSlice = transcript.slice(prevLen);

        if (freshSlice.trim().length > 0) {
          transcriptText.textContent = `🎙️ "${freshSlice.trim()}"`;
          const prevIndex = state.currentIndex;
          checkKeywords(freshSlice);

          if (state.currentIndex !== prevIndex) {
            state.processedCharCounts.set(i, transcript.length);
            break;
          }
        }
      }
    };

    recognition.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stopAutomation("⚠️ Microphone permission blocked");
      } else if (e.error === "audio-capture") {
        setHardwareMuted(true, "🔇 Mic capture failed — check laptop mic-mute key!");
      } else if (e.error === "network") {
        transcriptText.textContent = "⚠️ Speech network glitch — retrying...";
      }
    };

    recognition.onend = () => {
      state.processedCharCounts.clear();
      if (state.isRunning) {
        setTimeout(() => {
          if (!state.isRunning) return;
          try {
            recognition.lang = state.langMode;
            recognition.start();
          } catch (_) {}
        }, 120);
      }
    };
  }

  /* ==========================================================================
   * 12. AUTOMATION CONTROLLER & CLEAN TEARDOWN
   * ========================================================================== */
  function startAutomation() {
    if (!state.rows.length) scanCheckboxes();
    if (!state.rows.length) {
      transcriptText.textContent = "⚠️ No checkboxes found! Click Pick 1st Box.";
      return;
    }

    state.isRunning = true;
    state.isHardwareMuted = false;
    muteAlert.classList.remove("visible");
    state.processedCharCounts.clear();
    statusDot.classList.remove("warn");
    statusDot.classList.add("live");
    toggleRunBtn.textContent = "⏸ Pause Attendance (Space)";
    toggleRunBtn.classList.add("running");
    transcriptText.textContent = "Listening (نعم / حاضر / Yes / Here)...";

    if (!recognition) initSpeech();
    try {
      recognition.lang = state.langMode;
      recognition.start();
    } catch (_) {}

    startMicMonitor();
    startTimerLoop();
    highlightCurrentRow();

    if (state.ttsEnabled) {
      speakCurrentStudentName();
    }
  }

  function stopAutomation(msg = "Paused (Mic Off)") {
    state.isRunning = false;
    state.isHardwareMuted = false;
    muteAlert.classList.remove("visible");
    stopSpeakingName();
    clearInterval(state.timerInterval);
    statusDot.classList.remove("live", "warn");
    toggleRunBtn.textContent = "▶ Start Voice Attendance (Space)";
    toggleRunBtn.classList.remove("running");
    transcriptText.textContent = msg;

    if (recognition) {
      try {
        recognition.onend = null;
        recognition.abort();
        recognition = null;
      } catch (_) {}
    }
    stopMicMonitor();
    updateUI();
  }

  function exitPickMode() {
    state.pickingFirstBox = false;
    for (const doc of getAccessibleDocuments()) {
      try { doc.body?.classList.remove("ua-pick-cursor"); } catch (_) {}
    }
  }

  function closeAndShutOff() {
    stopAutomation("Mic Off");
    clearHighlights();
    exitPickMode();
    state.isClosed = true;
    hud.classList.add("closed");
  }

  function reopenHud() {
    state.isClosed = false;
    hud.classList.remove("closed", "minimized");
    scanCheckboxes();
  }

  // Listen for Toolbar Click or Alt+A Command from background.js
  try {
    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (sender.id !== chrome.runtime.id) return;
      if (msg?.action === "TOGGLE_HUD") {
        state.isClosed ? reopenHud() : closeAndShutOff();
      }
    });
  } catch (_) {}

  // Guarantee zero mic leaks if tab closes or navigates away
  window.addEventListener("pagehide", () => stopAutomation("Mic Off"));

  /* ==========================================================================
   * 13. UI & KEYBOARD EVENT LISTENERS
   * ========================================================================== */
  $("closeBtn").addEventListener("click", closeAndShutOff);

  $("retryMicBtn").addEventListener("click", () => {
    if (!state.isRunning) return;
    setHardwareMuted(false);
    startMicMonitor();
    if (recognition) {
      try { recognition.abort(); } catch (_) {}
      initSpeech();
      try { recognition.start(); } catch (_) {}
    }
  });

  toggleRunBtn.addEventListener("click", () => {
    state.isRunning ? stopAutomation() : startAutomation();
  });

  $("speakNowBtn").addEventListener("click", repeatCurrentName);
  $("repeatBtn").addEventListener("click", repeatCurrentName);

  $("presentBtn").addEventListener("click", () => {
    state.timeLeft = state.timerDuration;
    markPresent();
  });

  $("absentBtn").addEventListener("click", () => {
    state.timeLeft = state.timerDuration;
    markAbsent("Manual");
  });

  $("prevBtn").addEventListener("click", prevRow);
  $("scanBtn").addEventListener("click", () => scanCheckboxes());

  function handlePickClick(e) {
    if (!state.pickingFirstBox) return;
    const target =
      e.target.closest('input[type="checkbox"], [role="checkbox"]') ||
      e.target.closest(".ui-chkbox")?.querySelector('input[type="checkbox"]') ||
      e.target.closest("label")?.querySelector('input[type="checkbox"]');
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();
    exitPickMode();
    scanCheckboxes(target);
    transcriptText.textContent = `✅ Locked onto ${state.rows.length} rows!`;
  }

  $("pickBtn").addEventListener("click", () => {
    state.pickingFirstBox = true;
    for (const doc of getAccessibleDocuments()) {
      try {
        doc.body?.classList.add("ua-pick-cursor");
        doc.removeEventListener("click", handlePickClick, true);
        doc.addEventListener("click", handlePickClick, true);
      } catch (_) {}
    }
    transcriptText.textContent = "🎯 Click the 1st student's checkbox";
  });

  // Persistent Settings Listeners
  $("ttsToggle").addEventListener("change", (e) => {
    state.ttsEnabled = e.target.checked;
    if (!state.ttsEnabled) stopSpeakingName();
    saveSettings();
  });

  voiceSelect.addEventListener("change", (e) => {
    state.ttsVoice = e.target.value;
    saveSettings();
    if (state.rows.length && state.ttsEnabled && !state.isRunning) {
      speakCurrentStudentName(); // Instant preview of newly selected voice
    }
  });

  $("ttsRateSlider").addEventListener("input", (e) => {
    state.ttsRate = parseFloat(e.target.value);
    $("ttsRateVal").textContent = `${state.ttsRate.toFixed(2)}x`;
    saveSettings();
  });

  $("ttsVolSlider").addEventListener("input", (e) => {
    state.ttsVolume = parseFloat(e.target.value);
    $("ttsVolVal").textContent = `${state.ttsVolume.toFixed(1)}x`;
    saveSettings();
  });

  $("twoNamesToggle").addEventListener("change", (e) => {
    state.firstTwoNamesOnly = e.target.checked;
    saveSettings();
  });

  $("colorToggle").addEventListener("change", (e) => {
    state.colorPageRows = e.target.checked;
    highlightCurrentRow();
    saveSettings();
  });

  $("timerToggle").addEventListener("change", (e) => {
    state.timerEnabled = e.target.checked;
    state.timeLeft = state.timerDuration;
    updateUI();
    saveSettings();
  });

  $("timerSlider").addEventListener("input", (e) => {
    state.timerDuration = parseFloat(e.target.value);
    state.timeLeft = state.timerDuration;
    $("timerVal").textContent = `${state.timerDuration}s`;
    updateUI();
    saveSettings();
  });

  $("gainSlider").addEventListener("input", (e) => {
    state.micGain = parseFloat(e.target.value);
    $("gainVal").textContent = `${state.micGain.toFixed(1)}x`;
    if (gainNode) gainNode.gain.value = state.micGain;
    saveSettings();
  });

  $("modeSelect").addEventListener("change", (e) => {
    state.invertMode = e.target.value === "absent";
    saveSettings();
    scanCheckboxes();
  });

  $("langSelect").addEventListener("change", (e) => {
    state.langMode = e.target.value;
    saveSettings();
    if (state.isRunning && recognition) {
      try { recognition.stop(); } catch (_) {}
    }
  });

  // Keyboard Shortcuts (Active only while HUD is open)
  window.addEventListener("keydown", (e) => {
    if (state.isClosed) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;

    if (e.code === "Escape" && state.pickingFirstBox) {
      e.preventDefault();
      exitPickMode();
      transcriptText.textContent = "Pick cancelled";
      return;
    }

    if (e.code === "Space" && e.altKey) {
      e.preventDefault();
      state.isRunning ? stopAutomation() : startAutomation();
    } else if (!state.rows.length) {
      return;
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      markPresent();
    } else if (e.code === "ArrowDown") {
      e.preventDefault();
      markAbsent("Key ↓");
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      prevRow();
    } else if (e.code === "ArrowUp") {
      e.preventDefault();
      repeatCurrentName();
    } else if (e.code === "Space" && state.isRunning) {
      e.preventDefault();
      stopAutomation("Paused (Mic Off)");
    }
  });

  /* ==========================================================================
   * 14. INITIALIZE ON USER LAUNCH
   * ========================================================================== */
  loadSettings().then(() => {
    syncUIFromSettings();
    scanCheckboxes();
  });
})();