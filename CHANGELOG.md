# Changelog

All notable changes to **UniAttend AI** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] - 2026-11-26

### Added
- **Modular TypeScript Architecture & esbuild Pipeline:** Refactored monolithic `content.js` and `background.js` into strongly-typed modules under `src/` (`shared/`, `nlp/`, `dom/`, `audio/`, `speech/`, `ui/`) compiled cleanly into a tiny, zero-runtime-dependency `dist/` bundle.
- **1-Click Absent List Export (Copy & CSV):** Compact HUD export popover to copy marked Absent students (Name + extracted ID) to clipboard or download a dated UTF-8 BOM `.csv` backup (Excel-safe Arabic rendering + CSV formula injection protection).
- **Click-Row-to-Jump Cursor:** Jump the active attendance cursor directly to any scanned row using `Alt + Click` anytime or via the quick `Jump Row` toggle button (works across main tables and same-origin iframes).
- **Editable Custom Keywords Drawer:** Collapsible Shadow DOM drawer to add or remove custom Arabic/English Present and Absent trigger words, persisted in `chrome.storage.local` with 1-click **Reset Defaults**.
- **TTS Engine Status Badge & Resilience:** Live HUD status badge distinguishing Neural Cloud, Instant Cached (`~0ms`), Offline OS, and automatic Offline / Rate-Limit fallback, backed by a 60s cloud circuit-breaker cooldown and local decoded `AudioBuffer` LRU cache so attendance timers never stall.
- **Session Recovery Guard:** Automatically caches marked Present/Absent statuses in URL-scoped `sessionStorage` and offers a 1-click **Restore** banner if an accidental page refresh clears unsaved portal checkboxes.
- **Automated Test Suite:** Vitest unit tests (Arabic normalization, keyword collision guards, compound Arabic 2-part names, CSV export, session recovery) and Playwright E2E tests against `demo/test-portal.html` and a new PrimeFaces + same-origin iframe fixture (`demo/primefaces-mock.html`).
- **Automated Packaging & CI/CD:** Added `npm run package` (syncs version into `public/manifest.json` and builds a ~42 KB runtime-only `release/UniAttend-AI-v<version>.zip`), GitHub Actions CI (`ci.yml`), automated tag-triggered Releases (`release.yml`), Chrome Web Store–ready multi-resolution PNG icons (`16/32/48/128`), strict extension CSP, `PRIVACY.md`, `SECURITY.md`, `CONTRIBUTING.md`, and GitHub issue/PR templates.
- **Storage Validation & Responsive Viewport Clamping:** Added strict schema clamping on `chrome.storage.local` hydration, `window.resize` HUD viewport clamping for classroom projectors, `:focus-visible` keyboard focus rings, and 512 KB / MIME-type caps on Cloud TTS responses.

### Fixed
- **Cross-Realm Same-Origin Iframe Support:** Replaced `instanceof Element/Node/HTMLInputElement` checks with cross-realm-safe `nodeType`/`tagName` checks and forwarded keyboard shortcuts across accessible same-origin iframes.
- **Async `getUserMedia` Mic-Leak Race:** Added monotonic session tokens so pausing or closing before mic permission resolves immediately tears down late `MediaStreamTrack` instances.
- **Complete `AudioContext` Teardown:** Closed both the microphone monitor and feedback/TTS `AudioContext` instances on pause, completion, HUD close, and `pagehide`.
- **Stale TTS Callback Overlap:** Guarded async Cloud TTS fetches and `decodeAudioData` callbacks with a generation counter so rapid row navigation cannot overlap audio or clear speaking state prematurely.
- **True LRU Cache & Fetch Timeout in Service Worker:** Refreshed key recency on cache hits and added a 3.5s `AbortController` fetch timeout with structured rate-limit/offline error codes.
- **Shadow DOM Focus Filtering:** Keyboard shortcuts now inspect `composedPath()` and `shadowRoot.activeElement` so typing inside HUD inputs never triggers attendance arrows, while focused checkboxes no longer block arrows.
- **Arabic Normalization & Phrase Boundaries:** Added diacritic (Tashkeel) and Tatweel stripping, enforced whole-word boundaries on multi-word phrases, removed duplicate/stray dictionary entries, and detached Pick-mode listeners cleanly on exit.

---

## [2.0.0] - 2026-11-20

### Added
- Manifest V3 on-demand injection (`activeTab`, `scripting`, `storage`, `Alt + A` command) with zero idle footprint and zero `web_accessible_resources`.
- Isolated Shadow DOM floating HUD (draggable, resizable, forced LTR with `direction: auto` Arabic names).
- Real-time bilingual (Arabic / English / phonetic) speech recognition with whole-word vs. multi-word phrase matching.
- Native Arabic/English TTS via service-worker Base64 fetch + Web Audio `decodeAudioData` (bypasses strict webpage CSP), 0.5x–3.0x speaker boost with dynamics limiter, offline `speechSynthesis` fallback, and compound Arabic **First 2 Parts** name parser.
- Hardware mic-mute guard combining `MediaStreamTrack` mute events and raw Web Audio `128` digital-zero flatline detection.
- Universal checkbox scanner & mutator for HTML tables, JSF/PrimeFaces `.ui-chkbox`, React/Vue controlled inputs, ARIA `[role="checkbox"]`, open Shadow DOMs, and same-origin iframes.
- Support for both **Box Checked = Absent** and **Box Checked = Present** modes with `chrome.storage.local` persistence.
