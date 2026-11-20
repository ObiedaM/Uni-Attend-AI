<p align="center">
  <img src="logo.png" alt="UniAttend AI Logo" width="120" />
</p>

<h1 align="center">UniAttend AI</h1>

<p align="center">
  <strong>Bilingual (Arabic / English) Voice Attendance Automation for University Portals</strong><br />
  Zero-bloat Manifest V3 Chrome & Edge Extension • Built by Obieda.M
</p>

---

## Overview

**UniAttend AI** automates roll-call attendance directly on university faculty portals (including legacy JSF/PrimeFaces, HTML tables, React/Vue apps, and iframes). It reads each student's name aloud in native Arabic or English, listens for verbal confirmation, updates the portal's checkboxes automatically, and advances down the roster.

![UniAttend AI Demo](assets/screenshot.png)

## Key Features

* **On-Demand Injection (Zero Bloat):** Runs zero background scripts on normal browsing. Only activates when you click the toolbar icon or press `Alt + A`.
* **Bilingual Speech Recognition (AR + EN):** Instant real-time keyword matching for Jordanian/Levantine Arabic, MSA, and English (`نعم`, `موجود`, `حاضر`, `هلا`, `Yes`, `Here`, `Absent`, `غائب`, etc.).
* **Native Arabic & English TTS:** Reads student names aloud before listening, with an option to call only the **First 2 Name Parts** (handles compound Arabic names like `عبد الرحمن`) and customizable speed + speaker boost.
* **Hardware Mic-Mute Guard:** Detects laptop hardware mic-mute keys (via track mute events + digital-zero flatline analysis) and automatically freezes the countdown timer so nobody gets falsely marked absent.
* **Universal Portal Support:** Works with standard checkboxes, PrimeFaces `.ui-chkbox`, ARIA checkboxes, open Shadow DOMs, and same-origin iframes. Supports both **Checked = Absent** and **Checked = Present** modes.
* **Persistent Settings:** Automatically saves your timer, voice choice, sliders, and HUD width locally via `chrome.storage.local`.

## Security & Privacy Architecture

* **Local-First Execution:** Student rosters, names, and attendance states never leave the browser tab.
* **Least-Privilege Permissions:** Uses `activeTab` and `scripting` instead of broad `<all_urls>` content scripts.
* **Hard Hardware Mic Teardown:** Pausing, finishing, closing (`✕`), or leaving the tab immediately stops all `MediaStreamTrack` instances and closes the `AudioContext`.
* **No External Tracking or Telemetry:** Zero analytics, zero cookies accessed, zero form-credential access. *(Note: Optional Neural Cloud TTS sends only the single spoken name string to the TTS endpoint with credentials omitted; offline OS voices are also selectable.)*

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Alt + A` | Open / Close UniAttend AI on the current tab |
| `Space` | Pause active attendance (releases microphone) |
| `→` (Right Arrow) | Mark current student **Present** and advance |
| `↓` (Down Arrow) | Mark current student **Absent** and advance |
| `↑` (Up Arrow) | Repeat current student's name aloud & reset timer |
| `←` (Left Arrow) | Go back to previous student |

## Installation (Chrome / Edge)

1. Download the latest `.zip` from the [**Releases**](https://github.com/YOUR_USERNAME/uni-attend-ai/releases) page (or clone this repository).
2. Extract the folder to your computer.
3. Open `chrome://extensions/` (or `edge://extensions/`).
4. Enable **Developer mode** in the top-right corner.
5. Click **Load unpacked** and select the extracted folder.
6. Navigate to any attendance page and press **`Alt + A`** (or click the extension icon).

## Try It Locally (No Portal Login Needed)

1. On `chrome://extensions/`, click **Details** on UniAttend AI and enable **Allow access to file URLs**.
2. Open `demo/test-portal.html` in Chrome.
3. Press **`Alt + A`** and click **Start Voice Attendance**.

## License

MIT License — see [LICENSE](LICENSE) for details.