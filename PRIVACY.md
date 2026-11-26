# Privacy Policy — UniAttend AI

**Effective Date:** November 26, 2026  
**Extension:** UniAttend AI — Smart Voice Attendance (Manifest V3)  
**Repository:** [github.com/ObiedaM/Uni-Attend-AI](https://github.com/ObiedaM/Uni-Attend-AI)

---

## 1. Core Privacy Commitment

UniAttend AI is an open-source, client-side browser extension designed with strict privacy boundaries:

- **No developer-operated backend or servers.**
- **No analytics, no telemetry, no crash trackers, and no advertising SDKs.**
- **No sale, rental, or sharing of user data with third parties.**
- **Zero background tracking:** The extension injects **no** persistent `<all_urls>` content scripts. Zero extension code runs on any webpage until you explicitly click the toolbar icon or press `Alt + A`.

---

## 2. Data Handled Locally (Never Leaves Your Browser)

The following data is processed strictly inside your browser tab or local browser storage:

- **Attendance Portal Content & Credentials:** Student roster tables, student IDs, portal cookies, authentication sessions, and final attendance submissions remain exclusively inside your browser tab. UniAttend AI never reads passwords and never submits forms automatically—saving attendance always relies on the university portal's own Save button.
- **User Preferences (`chrome.storage.local`):** Your HUD width, voice selection, playback speed, speaker boost, auto-absent timer duration, checkbox mode (`Checked = Absent` vs. `Checked = Present`), recognition language, and custom voice keywords are stored locally in `chrome.storage.local`.
- **Tab-Scoped Session Recovery (`sessionStorage`):** While you mark attendance on a page, UniAttend AI temporarily caches marked Present/Absent statuses in the tab's `sessionStorage` (keyed by page URL) so you can recover unsaved marks after an accidental page refresh. This data is automatically cleared by the browser when the tab is closed or when you click **Dismiss**.
- **Microphone Monitoring:** The live VU level meter and hardware mic-mute flatline detector process microphone audio solely in local browser Web Audio memory. Pausing attendance, completing the roster, closing the HUD (`✕`), or navigating away (`pagehide`) immediately stops all `MediaStreamTrack` instances, closes every `AudioContext`, and aborts speech recognition.
- **Absent List Export (Clipboard / CSV):** Generating and downloading an absent list CSV or copying it to your clipboard happens 100% locally inside your browser.

---

## 3. External Browser & Optional Cloud Services (Full Disclosure)

Because browser speech synthesis and speech recognition rely on built-in or optional endpoints, two external interactions may occur **only while you actively use voice features**:

1. **Browser Speech-to-Text (`webkitSpeechRecognition`):**
   - When you actively start Voice Attendance, Chrome or Edge's built-in Web Speech API streams microphone audio to the browser vendor's cloud speech recognition service (e.g., Google Speech servers in Chrome) to return live transcripts.
   - UniAttend AI does not record, store, or transmit raw audio to any custom server.
   - You can use manual keyboard shortcuts (`→`, `↓`, `←`, `↑`) and `Alt + Click` without starting the microphone at all.

2. **Optional Neural Cloud Text-to-Speech (`https://translate.googleapis.com/*`):**
   - When **Read Names** is enabled and a **Neural Cloud** voice is selected, the background service worker sends **only** the cleaned spoken student name string (stripped of student IDs, numbers, and brackets; truncated to 120 characters) to `translate.googleapis.com` with `credentials: "omit"` and `referrerPolicy: "no-referrer"` to retrieve pronunciation audio.
   - Audio responses are cached strictly in temporary in-memory LRU caches (max 60 entries) and discarded when the session/service worker closes.
   - **100% Offline TTS Option:** To prevent any student name text from contacting `translate.googleapis.com`, select any **System Voice (Offline)** in the HUD's **TTS** dropdown (or uncheck **Read Names**).

---

## 4. Chrome Extension Permissions Explained

| Permission | Scope & Purpose |
| :--- | :--- |
| `activeTab` | Grants temporary access strictly to the currently active tab *only* after you explicitly click the toolbar icon or press `Alt + A`. |
| `scripting` | Injects the isolated Shadow DOM HUD (`content.js`) on demand into the active tab. |
| `storage` | Saves your local HUD settings and custom voice keyword lists in `chrome.storage.local`. |
| `host_permissions` (`https://translate.googleapis.com/*`) | Allows the background service worker to fetch optional Cloud TTS audio cleanly without triggering webpage Content Security Policy (CSP) blocks. |

UniAttend AI declares **zero** `web_accessible_resources`, preventing websites from fingerprinting whether the extension is installed, and validates `sender.id === chrome.runtime.id` on all internal extension messages.

---

## 5. Security & Contact

UniAttend AI is MIT-licensed and open source so instructors and IT administrators can inspect every line of code before installation. For privacy or security questions, please open an issue at [github.com/ObiedaM/Uni-Attend-AI/issues](https://github.com/ObiedaM/Uni-Attend-AI/issues).
