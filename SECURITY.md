# Security Policy

## Supported Versions

| Version | Supported |
| :--- | :---: |
| `2.1.x` | Yes |
| `< 2.1.0` | No — please upgrade to the latest release |

---

## Security Architecture & Guarantees

UniAttend AI is engineered around least-privilege Manifest V3 principles:

- **Zero Idle Injection:** No persistent `<all_urls>` `content_scripts`. Code is injected into the active tab only on explicit user action (toolbar icon click or `Alt + A`).
- **Zero Fingerprinting Exposure:** Declares zero `web_accessible_resources`. Internal extension assets (`icons/icon48.png`) are served strictly over authenticated `chrome.runtime` IPC.
- **Strict Message Validation:** All `chrome.runtime.onMessage` listeners enforce `sender.id === chrome.runtime.id` and validate payload shapes before processing.
- **XSS & CSP Hardening:**
  - Extension pages enforce `script-src 'self'; object-src 'none';`.
  - Zero untrusted webpage or user input is ever assigned to `innerHTML`; all student names, keyword chips, banners, and status messages render strictly via `textContent`.
  - Cloud TTS audio is fetched in the service worker with `credentials: "omit"`, `referrerPolicy: "no-referrer"`, content-type validation, a 3.5s abort timeout, and a 512 KB payload cap, then decoded in Web Audio memory (`decodeAudioData`) to stay compatible with strict portal CSP headers.
  - Exported CSV backups escape RFC 4180 fields and neutralize spreadsheet formula injection (`=`, `+`, `-`, `@`).
- **Hard Microphone Teardown:** Pausing attendance, completing the roster, closing the HUD (`✕`), or leaving the page (`pagehide`) immediately stops all `MediaStreamTrack`s (including race-guarded `getUserMedia` requests), closes every `AudioContext`, and aborts `SpeechRecognition`.

---

## Reporting a Vulnerability

If you discover a security or privacy issue, please **do not** open a public issue with exploit details. Instead:

1. Use **GitHub Security Advisories** (**Security → Report a vulnerability**) on [ObiedaM/Uni-Attend-AI](https://github.com/ObiedaM/Uni-Attend-AI/security), or
2. Contact the maintainer via GitHub with reproduction steps and affected version.

Reports are reviewed promptly and patched in a tagged release.
