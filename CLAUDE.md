# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Origami AI turns PDF slide decks into narrated videos, entirely in the browser: PDF extraction → LLM-written narration script → local TTS (Kokoro.js) → FFmpeg.wasm rendering to MP4, all client-side via WebGPU. It also does screen recording with auto-zoom, MP4 scene analysis, an AI assistant chat, and a "Shorts" video generator (Pollinations image/video + TTS captions). The Express server (`server.ts`) exists almost entirely to proxy calls to cloud LLM/image APIs so secret keys never reach the client bundle — it is not a typical CRUD backend.

## Commands

```bash
npm run dev       # Express + Vite dev server with HMR, http://localhost:3000
npm run build     # Production build -> dist/
npm run preview   # Serve the production build
npm run lint      # ESLint — only lints plain .js files (see eslint.config.js: **/*.ts and **/*.tsx are ignored)
npm run stop      # Kill whatever is on port 3000
npm run pages:dev # Run via Wrangler (Cloudflare Pages) instead of the Express server
```

There is no test suite in this repo. There is no `tsc` script; type-checking happens via editor/IDE or `tsc --build` against the four project references in `tsconfig.json` (app, node, server, functions).

Do not open `index.html` directly or bypass the dev server — FFmpeg.wasm/SharedArrayBuffer require the COOP/COEP headers that `npm run dev` (or the production server) sets. See `TROUBLESHOOTING.md` for header details.

## Architecture

### Dual server runtime — keep in sync manually

The proxy API exists in **two parallel implementations** that must be kept behaviorally identical:

- `server.ts` — Express app, used by `npm run dev`, Docker, and any Node host. Also mounts Vite in middleware mode for dev, and serves `dist/` in production.
- `functions/api/**` — Cloudflare Pages Functions, used when deployed to Cloudflare Pages (`wrangler.toml`, `npm run pages:dev`). Each file exports an `onRequestPost`/`onRequestGet` handler mirroring one Express route.

Routes that exist in both, and must stay matched when you change one:
- `POST /api/llm/chat` ↔ `functions/api/llm/chat.ts`
- `POST /api/llm/analyze-video` ↔ `functions/api/llm/analyze-video.ts`
- `POST /api/llm/analyze-issue` ↔ `functions/api/llm/analyze-issue.ts`
- `POST /api/pollinations/image` ↔ `functions/api/pollinations/image.ts`
- `POST /api/pollinations/video` ↔ `functions/api/pollinations/video.ts`
- `GET /api/music-preview/:filename` ↔ `functions/api/music-preview/[filename].ts`

If you add or change a server API route, update both sides. `functions/utils.ts` holds shared helpers for the Pages Functions side (e.g. `base64ToUint8Array`); the Express side inlines equivalents in `server.ts`.

### API key routing (client key vs. server proxy)

This is the core security model of the app — preserve it when touching LLM/Pollinations code:

- Only `VITE_`-prefixed env vars (`VITE_LLM_API_KEY`, `VITE_LLM_BASE_URL`, `VITE_LLM_MODEL`) are baked into the client bundle by Vite. Never add a new `VITE_`-prefixed secret without understanding it becomes public.
- In production there is normally no client-side key. `src/services/aiService.ts` detects the absence of a client key and routes calls through the server proxy endpoints above instead of calling the provider directly.
- The server reads `LLM_API_KEY` (falls back to `VITE_LLM_API_KEY` for convenience) via `process.env`, never exposing it to responses sent to the browser.
- Pollinations has the same split: `pk_...` publishable keys are safe client-side (stored per-user in `GlobalSettings.pollinationsApiKey` via IndexedDB, see `src/services/storage.ts`), `sk_...` secret keys and `POLLINATIONS_API_KEY` are server-only fallbacks used by `/api/pollinations/image`.
- `src/services/pollinationsAuth.ts` + `src/pages/PollinationsCallbackPage.tsx` implement an OAuth-style flow that exchanges for a `sk_...` token stored client-side; treat this token like any other secret when logging or serializing state.
- **Turnstile & Firebase**: The frontend uses Cloudflare Turnstile for bot protection. Its secret key (`TURNSTILE_SECRET_KEY`) is kept in `.env` (ignored from git) for backend verification. Firebase config keys (`src/config/firebase.ts`) are intentionally public. Be careful when updating CSP headers in `server.ts` to ensure `challenges.cloudflare.com` and `apis.google.com` remain allowed.

### Client-side compute — WebGPU workers

Heavy AI work runs in Web Workers, not the main thread:
- `src/services/webLlmService.ts` + `src/services/webLlm.worker.ts` — local LLM inference via `@mlc-ai/web-llm`, gated by `checkWebGPUSupport()`. WebLLM is **never** eagerly initialized on app start (see comment in `src/App.tsx` around the `WebLLMInitModal`/`useEffect` — eager init caused tab instability on some systems); it's loaded on demand.
- `src/services/tts.worker.ts` + `src/services/ttsService.ts` — Kokoro.js TTS, quantization is user-selectable (`q8` quality vs `q4` speed).
- `src/services/ffmpegLoader.ts` + `src/services/BrowserVideoRenderer.ts` / `ShortsVideoRenderer.ts` — FFmpeg.wasm rendering. `@ffmpeg/ffmpeg` and `@ffmpeg/util` are excluded from Vite's dep pre-bundling (`vite.config.ts`) and get their own chunk.
- Heavy downloads (TTS model, FFmpeg core, WebLLM model) are serialized to run **one at a time**, coordinated through `BackgroundDownloadContext`/`BackgroundDownloadProvider` — see the comment in `App.tsx` ("Downloads run strictly one at a time: TTS -> FFmpeg -> WebLLM").

### State, Persistence, & Authentication

- `src/services/storage.ts` wraps IndexedDB (`getDB()`, `DB_NAME`/`DB_VERSION`) — this is where `GlobalSettings`, local project data, and Assistant chat sessions live. 
- **Cloud Persistence & Auth**: `src/config/firebase.ts` and `src/services/cloudStorage.ts` implement optional cloud saving. Users can sign up/in using Firebase Auth (Email/Password or Google Sign-In, protected by Cloudflare Turnstile). Authenticated users can save their PDF and Shorts projects to Firebase Storage (with metadata in Firestore), allowing them to sync work across devices.
- `src/services/projectArchiveService.ts` implements the `.origami` portable project format (export/import slides, media, audio, settings as a local archive file).
- App-wide UI state (modals, background downloads, auth state) is provided via React Context (`src/context/`), not a global store library.

### Two video pipelines

1. **PDF → narrated video** (main flow): `PDFUploader` → `pdfService.ts` (extraction, via `pdfjs-dist`) → `aiService.ts` (script generation) → `ttsService.ts` → `SlideEditor.tsx` / `ZoomTimelineEditor.tsx` → `BrowserVideoRenderer.ts` (FFmpeg.wasm render).
2. **Shorts** (`src/pages/ShortsPage.tsx`, `src/components/shorts/ShortsComposer.tsx`): script generation (`shortsScriptService.ts`) → Pollinations image/video generation (`pollinationsService.ts`, `pollinationsVideoService.ts`) → captions (`shortsCaptions.ts`) → `ShortsVideoRenderer.ts`. Project state shape lives in `shortsProject.ts`.

Both pipelines converge on the same TTS and FFmpeg-based rendering services rather than duplicating them.

### Routing

Client routing is `react-router`'s `BrowserRouter` defined at the bottom of `src/App.tsx`. `MainApp` (the root component, also in `App.tsx`) handles the primary PDF→video flow at `/`; other flows (`/assistant`, `/issue-reporter`, `/shorts`, `/pollinations-callback`, `/privacy`, `/terms`) are separate page components under `src/pages/`. `App.tsx` is large (~1700 lines) and owns most of the primary-flow state — prefer extracting new primary-flow features into `src/components/` rather than growing it further.

### Screen recording

`src/hooks/useScreenRecorder.ts` drives capture with cinematic auto-zoom on idle (>2s). `src/services/browserExtensionBridge.ts` talks to the optional Chrome extension (`chrome-extension/`, built separately, see `chrome-extension/README.md`) for richer cursor/DOM telemetry; there is an in-page fallback when the extension isn't installed, so don't assume its presence.

## Testing constraints

- Do not perform browser testing of any kind. This includes launching or automating a browser (e.g. Playwright, Puppeteer, Selenium), opening the app in a browser to click through flows, or taking screenshots of the running app to verify behavior.
- Verify changes through type-checking (`tsc --build`), reading the code, and reasoning about control flow instead.
- If a change genuinely needs manual/visual verification in a browser, say so explicitly and hand that step back to the user rather than performing it.

## Conventions

- TypeScript strict mode throughout (`strict: true` in all `tsconfig*.json`), including `noUnusedLocals`/`noUnusedParameters` — unused vars are compile errors, not lint warnings (ESLint's `no-unused-vars` is explicitly turned off since `tsc` covers it, and ESLint doesn't run on `.ts`/`.tsx` at all).
- Avoid `any`; prefer `unknown` with type guards.
- Functional React components with hooks only.
- 2-space indentation, semicolons required.
- Server code (`server.ts`, `functions/**`) always mirrors CSP/CORS/rate-limiting behavior between the Express and Pages Functions implementations — see the "Dual server runtime" section above before changing security headers or limits in only one place.