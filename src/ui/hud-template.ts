export const HUD_TEMPLATE = `
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
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #334155 transparent;
    }

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

    .recovery-banner {
      display: none;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid #38bdf8;
      border-radius: 9px;
      padding: 7px 10px;
      font-size: 11px;
      font-weight: 700;
      color: #e0f2fe;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .recovery-banner.visible { display: flex; }
    .recovery-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .recovery-restore-btn {
      background: #0284c7;
      border: none;
      color: #fff;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 10.5px;
      font-weight: 800;
      cursor: pointer;
    }
    .recovery-restore-btn:hover { filter: brightness(1.15); }
    .recovery-dismiss-btn {
      background: transparent;
      border: 1px solid #334155;
      color: #94a3b8;
      border-radius: 6px;
      padding: 3px 6px;
      font-size: 10.5px;
      font-weight: 800;
      cursor: pointer;
    }
    .recovery-dismiss-btn:hover { color: #fff; border-color: #64748b; }

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
    .utility-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .tools-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
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
      transition: filter 0.15s, border-color 0.15s, background-color 0.15s;
    }
    button.ctrl:hover { filter: brightness(1.12); }
    button:focus-visible, input:focus-visible, select:focus-visible {
      outline: 2px solid #38bdf8;
      outline-offset: 1px;
    }
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
      padding: 6px 7px !important;
    }
    .btn-secondary.active {
      background: #1d4ed8;
      border-color: #38bdf8 !important;
      color: #fff;
    }

    .popover-panel {
      display: none;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 9px 10px;
      flex-direction: column;
      gap: 7px;
      font-size: 11px;
    }
    .popover-panel.open { display: flex; }
    .popover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 700;
      color: #e2e8f0;
    }
    .export-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .btn-export-copy { background: #0284c7; color: #fff; padding: 6px 8px !important; font-size: 11px !important; }
    .btn-export-csv { background: #059669; color: #fff; padding: 6px 8px !important; font-size: 11px !important; }

    .kw-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
    }
    .kw-tab {
      background: #0f172a;
      border: 1px solid #334155;
      color: #94a3b8;
      border-radius: 6px;
      padding: 5px 6px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }
    .kw-tab.active-present {
      background: rgba(16, 185, 129, 0.2);
      border-color: #10b981;
      color: #a7f3d0;
    }
    .kw-tab.active-absent {
      background: rgba(239, 68, 68, 0.2);
      border-color: #ef4444;
      color: #fecaca;
    }
    .kw-add-row {
      display: flex;
      gap: 5px;
    }
    .kw-input {
      flex: 1;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      color: #f8fafc;
      padding: 5px 8px;
      font-size: 11.5px;
      outline: none;
      direction: auto;
    }
    .kw-input:focus { border-color: #38bdf8; }
    .kw-add-btn {
      background: #2563eb;
      border: none;
      color: #fff;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }
    .kw-reset-btn {
      background: transparent;
      border: 1px solid #475569;
      color: #94a3b8;
      border-radius: 5px;
      padding: 2px 7px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
    }
    .kw-reset-btn:hover { color: #fff; border-color: #94a3b8; }
    .kw-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      max-height: 92px;
      overflow-y: auto;
      padding: 2px 0;
      scrollbar-width: thin;
      scrollbar-color: #334155 transparent;
    }
    .kw-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #0f172a;
      border: 1px solid #334155;
      color: #e2e8f0;
      border-radius: 999px;
      padding: 2px 7px;
      font-size: 10.5px;
      font-weight: 600;
    }
    .kw-chip-del {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 11px;
      font-weight: 800;
      padding: 0 1px;
      line-height: 1;
    }
    .kw-chip-del:hover { color: #f87171; }

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
    .transcript-label {
      color: #64748b;
      font-size: 10px;
      font-weight: 800;
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
    .tts-badge {
      font-size: 9.5px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid #334155;
      background: #0f172a;
      color: #94a3b8;
      white-space: nowrap;
    }
    .tts-badge.cloud { background: rgba(56, 189, 248, 0.14); border-color: #0284c7; color: #38bdf8; }
    .tts-badge.cached { background: rgba(16, 185, 129, 0.16); border-color: #059669; color: #34d399; }
    .tts-badge.os { background: #0f172a; border-color: #475569; color: #cbd5e1; }
    .tts-badge.warn { background: rgba(245, 158, 11, 0.18); border-color: #f59e0b; color: #fcd34d; }

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
      max-width: 170px;
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
      font-size: 10.5px;
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
    @media (max-height: 760px) {
      .hud-body { padding: 9px 11px; gap: 6px; }
      .student-card { padding: 8px 10px; }
      .settings-panel { padding: 8px; gap: 5px; }
      button.ctrl { padding: 6px 5px; }
    }
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
        <button id="closeBtn" class="close-btn" title="Shut Off &amp; Close (Alt+A)">✕</button>
      </div>
    </div>

    <div class="hud-body">
      <div class="mute-alert" id="muteAlert">
        <span id="muteAlertText">🔇 Mic is muted! Unmute your laptop mic key. Timer paused.</span>
        <button class="mute-retry-btn" id="retryMicBtn">Retry</button>
      </div>

      <div class="recovery-banner" id="recoveryBanner">
        <span id="recoveryText">🔄 Previous marks found for this page.</span>
        <div class="recovery-actions">
          <button class="recovery-restore-btn" id="restoreSessionBtn">Restore</button>
          <button class="recovery-dismiss-btn" id="dismissSessionBtn" title="Dismiss saved marks">✕</button>
        </div>
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

      <div class="utility-grid">
        <button class="ctrl btn-secondary" id="scanBtn">🔄 Auto-Scan Rows</button>
        <button class="ctrl btn-secondary" id="pickBtn">🎯 Pick 1st Checkbox</button>
      </div>

      <div class="tools-grid">
        <button class="ctrl btn-secondary" id="jumpBtn" title="Click any student row to jump (or Alt+Click anytime)">📍 Jump Row</button>
        <button class="ctrl btn-secondary" id="exportToggleBtn" title="Copy or download CSV of Absent students">📤 Export</button>
        <button class="ctrl btn-secondary" id="keywordsToggleBtn" title="Edit custom Arabic/English trigger words">🔤 Keywords</button>
      </div>

      <div class="popover-panel" id="exportPopover">
        <div class="popover-header">
          <span id="exportSummary">Absent Students: 0</span>
        </div>
        <div class="export-actions">
          <button class="ctrl btn-export-copy" id="copyAbsentBtn">📋 Copy List</button>
          <button class="ctrl btn-export-csv" id="downloadCsvBtn">⬇️ CSV Backup</button>
        </div>
      </div>

      <div class="popover-panel" id="keywordsDrawer">
        <div class="popover-header">
          <span>Custom Voice Keywords</span>
          <button class="kw-reset-btn" id="resetKeywordsBtn" title="Restore default Arabic/English keywords">↺ Reset Defaults</button>
        </div>
        <div class="kw-tabs">
          <button class="kw-tab active-present" id="kwTabPresent">✅ Present</button>
          <button class="kw-tab" id="kwTabAbsent">❌ Absent</button>
        </div>
        <div class="kw-add-row">
          <input class="kw-input" id="kwInput" type="text" placeholder="Add AR/EN word or phrase...">
          <button class="kw-add-btn" id="kwAddBtn">Add</button>
        </div>
        <div class="kw-chips" id="kwChips"></div>
      </div>

      <div class="transcript-box">
        <span class="transcript-label">STATUS:</span>
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
          <label>
            🗣️ TTS
            <span class="tts-badge cloud" id="ttsStatusBadge">☁️ Cloud</span>
          </label>
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
        <b>[→]</b> Present • <b>[↓]</b> Absent • <b>[↑]</b> Repeat • <b>[←]</b> Back • <b>[Alt+Click]</b> Jump
      </div>
    </div>
    <div class="resize-handle" id="resizeHandle" title="Drag to resize">◢</div>
  </div>
`;
