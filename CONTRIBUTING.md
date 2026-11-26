# Contributing to UniAttend AI

Thank you for helping improve **UniAttend AI**!

## Development Setup

Requirements: **Node.js 20+** and Chromium/Chrome/Edge.

```bash
git clone https://github.com/ObiedaM/Uni-Attend-AI.git
cd Uni-Attend-AI
npm install
npm run build
```

Load the compiled **`dist/`** folder (not the repository root) via `chrome://extensions/` → **Developer mode** → **Load unpacked**.

For live development:
```bash
npm run dev
```

## Quality & Security Standards

All pull requests must preserve these non-negotiable guarantees:

1. **Zero idle footprint:** Never add persistent `<all_urls>` `content_scripts` to `public/manifest.json`.
2. **Zero `web_accessible_resources`:** Keep internal assets private to avoid extension fingerprinting.
3. **Zero untrusted `innerHTML`:** Always use `textContent` and DOM APIs for page/user strings.
4. **Hard hardware mic teardown:** Ensure `MediaStreamTrack.stop()`, `AudioContext.close()`, and `SpeechRecognition.abort()` run on pause, finish, close, and `pagehide`.
5. **Tiny zero-dependency runtime bundle:** Keep `src/` pure TypeScript with no heavy runtime UI frameworks.

## Verification Checklist Before Opening a PR

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```
