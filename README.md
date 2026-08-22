<div align="center">
  <img src="logo/modlogo.png" alt="Origami AI logo" width="280" />

  <h3>A full-featured AI Studio — run powerful AI apps entirely in your browser.</h3>
  <p>WebGPU-accelerated local LLM inference, text-to-speech, video generation, and in-browser rendering. No upload, no render farm, no subscription.</p>

  <p>
    <a href="https://github.com/TechMitten/Origami-AI/stargazers"><img src="https://img.shields.io/github/stars/techmitten/origami-ai?style=flat&color=blue" alt="GitHub stars"></a>
    <a href="https://github.com/TechMitten/Origami-AI/issues"><img src="https://img.shields.io/github/issues/techmitten/origami-ai" alt="Open issues"></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/techmitten/origami-ai" alt="License"></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen" alt="Node version"></a>
  </p>

  <p>
    <a href="#-quick-start"><strong>Quick Start</strong></a> ·
    <a href="#-features">Features</a> ·
    <a href="#-use-cases">Use Cases</a> ·
    <a href="#-how-it-works">How It Works</a> ·
    <a href="#-configuration">Configuration</a> ·
    <a href="CONTRIBUTING.md">Contributing</a>
  </p>
</div>

---

## What is Origami AI?

Origami AI is a **browser-based AI Studio** that runs AI-powered applications entirely on your device using [WebGPU](https://gpuweb.github.io/) and [WebLLM](https://github.com/mlc-ai/web-llm). No cloud dependency, no data upload, no API calls required (though optional cloud integrations are supported).

Originally a PDF-to-video tool, Origami AI has evolved into a versatile platform for:
- **📹 PDF-to-video creation** — AI narration scripts, text-to-speech, and in-browser rendering
- **🎬 Shorts generation** — topic-to-vertical-video with AI imagery and voiceovers
- **🎙️ Screen recording** — cinematic auto-zoom with DOM telemetry
- **💬 AI assistant chat** — local models with image/video analysis
- **🎯 Video scene analysis** — MP4 breakdown with timestamped scenes

|  | Traditional tools | Cloud AI services | **Origami AI** |
|---|---|---|---|
| Learning curve | Steep | Easy | **Minimal — fully automated** |
| Privacy | Local | Cloud-based | **Local-first, device-only** |
| Cost | One-time / free | Pay-per-minute or credits | **Free & open source** |
| Voice | Your own / hire talent | Pay per minute | **Unlimited local TTS** |
| Latency | Varies | Network-dependent | **Instant (local GPU)** |
| Time to result | Hours | Minutes | **~2–5 min** |

## ✨ Features

- 🧠 **WebGPU-powered AI** — local LLM inference for narration, chat, and analysis
- 🎬 **AI narration scripts** — generated locally with WebLLM, or via Gemini/OpenAI-compatible APIs
- 🎙️ **In-browser TTS** — Kokoro.js with multiple voices, no server round-trip
- 📹 **In-browser rendering** — FFmpeg.wasm composes slides, audio, music, and pan/zoom into MP4 (720p/1080p)
- 🎯 **Smart screen recording** — auto-zoom on idle, with optional Chrome extension for richer DOM telemetry
- 🔍 **Scene-aware video analysis** — turn an MP4 into a timestamped scene breakdown
- 💬 **AI assistant chat** — local WebLLM models or cloud fallback, with image/video attachments
- 🎬 **Shorts generator** — turn a topic into a vertical short: AI script, image/video generation, TTS voiceover, burned-in captions
- 🔒 **Server-side key proxying** — API keys never ship in the production client bundle
- 🎵 **Background music & mixing** — auto-ducking under narration with per-slide control
- 📦 **Portable projects** — export/import a full project (slides, media, audio, settings) as a `.origami` archive
- ⚡ **Zero-config startup** — works completely offline after first model download

## 🚀 Quick Start

**Requirements:** Node.js ≥ 20.19.0 and a [WebGPU-capable browser](https://webgpureport.org/).

```bash
git clone https://github.com/TechMitten/Origami-AI.git
cd Origami-AI
npm install
npm run dev
```

Open **http://localhost:3000**.

> [!IMPORTANT]
> Don't open `index.html` directly. The dev server sets the COOP/COEP headers that `SharedArrayBuffer`/FFmpeg.wasm need — without them, rendering and TTS init silently fail.

| Command | Purpose |
|---|---|
| `npm run dev` | Express + Vite dev server with HMR |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | Lint plain `.js` files (see note below) |
| `npm run stop` | Kill whatever is on port 3000 |

<details>
<summary><strong>Run with Docker instead</strong></summary>

```bash
docker compose up --build
```

Available at **http://localhost:3000**.
</details>

<details>
<summary><strong>Optional: install the Chrome extension</strong></summary>

The extension adds DOM-level cursor/click/scroll telemetry for more precise auto-zoom during screen recording. Origami AI works without it via an in-page fallback.

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `chrome-extension/` folder

You can also download a packaged ZIP from inside the app (header menu → **Download Chrome Extension**, or Slide Editor → *Slide Media* tab). See [chrome-extension/README.md](chrome-extension/README.md).
</details>

## 📋 Use Cases

### PDF Slides → Professional Video
Upload a deck, generate AI narration, add music, and export a polished MP4 — all in the browser.

### Topic → Short-Form Video
Describe an idea, and Origami AI writes a script, generates visuals (AI-drawn or AI video), synthesizes speech, and renders a vertical short in under 5 minutes.

### Screen Recording with Effects
Record a browser tab or desktop, and Origami AI automatically adds cinematic zoom, pan, and cursor-following based on real interactions.

### Interactive AI Chat
Ask questions, attach images or video clips, and get answers powered by local LLMs — no internet required.

## 🧭 How It Works

**Primary flow — PDF → video:**

1. Upload a PDF; slide images and text are extracted automatically
2. An LLM (local WebLLM or a remote API) drafts a narration script per slide
3. Kokoro.js synthesizes speech for each script
4. Edit scripts, timing, transitions, and music in the visual editor
5. FFmpeg.wasm renders a 720p/1080p MP4, fully in-browser
6. Download the finished video

Typical end-to-end time is 2–5 minutes, depending on slide count and GPU.

**Shorts — topic → vertical video** (`/shorts`):

1. Enter a topic and pick length (15–90s), tone, visual source (AI stills or clips), frame (9:16 / 16:9 / 1:1), visual style, an image or video model, and a Kokoro voice
2. An LLM (local WebLLM or your configured API) drafts a scene-by-scene script and image prompts — review and edit before generating any media
3. Approve to generate each scene's image or video clip via [Pollinations](https://pollinations.ai) and a Kokoro TTS voiceover in parallel; regenerate individual scenes as needed
4. Add optional background music and burned-in captions (Bold Pop, Karaoke Fill, or Clean Lower Third)
5. Export renders the final MP4 fully client-side (H.264/AAC, up to 1080×1920)

Reach it from the **Shorts** button on the upload screen, or by visiting `/shorts` directly.

**Other entry points:**
- **Screen recording** — capture a tab or desktop, auto-zoom on idle (>2s), combine with PDF slides or use standalone
- **Scene analysis** — upload an MP4, get a timestamped scene breakdown via the Gemini API
- **AI assistant chat** — ask questions, attach images/video, local or cloud models

## ⚙️ Configuration

Open the app and click **⚙️ Settings** for:

| Tab | Controls |
|---|---|
| General | Intro fade timing, post-audio delay, default transition, recording options |
| TTS Model | Kokoro.js quantization (`q8` high quality vs. `q4` speed) |
| WebLLM | Enable/disable local AI, model selection, precision filter (f16/f32) |
| API | Remote OpenAI-compatible provider (Gemini, OpenRouter, Ollama, etc.) |
| AI Prompt | Narration script generation behavior |

### API keys: dev vs. production

Origami AI works with **zero API keys** via local WebLLM. Cloud APIs (Gemini, OpenAI-compatible) are optional, for narration and video analysis.

```bash
cp .env.example .env
```

```env
# Dev only — Vite bakes VITE_-prefixed vars into the client bundle
VITE_LLM_API_KEY=your_api_key_here
VITE_LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
VITE_LLM_MODEL=gemini-flash-latest
```

In **production**, set `LLM_API_KEY` (no `VITE_` prefix) on the server/host instead. The client detects there's no client-side key and automatically routes calls through the server proxy (`POST /api/llm`).

> [!WARNING]
> Never set `VITE_LLM_API_KEY` in production — anything with the `VITE_` prefix is compiled into the public client bundle.

**Shorts** image/video generation uses [Pollinations](https://pollinations.ai). Sign in with Pollinations from the Shorts composer to use your own account (a `pk_...`/`sk_...` key pair obtained via https://pollinations.ai).

<details>
<summary><strong>Full environment variable reference</strong></summary>

| Variable | Context | Purpose |
|---|---|---|
| `VITE_LLM_API_KEY` | Client (dev only) | Exposes the API key to the browser for development. **Never set in production.** |
| `LLM_API_KEY` | Server (prod) | Server-side key used by the LLM proxy endpoints; never sent to the client. |
| `VITE_LLM_BASE_URL` | Client | OpenAI-compatible endpoint base URL |
| `VITE_LLM_MODEL` | Client | Model identifier (e.g. `gemini-flash-latest`) |
| `POLLINATIONS_API_KEY` | Server (prod) | Server-side fallback key for the Pollinations image/video proxy, used when a user hasn't connected their own account |
| `CLIENT_URL` | Server | Comma-separated allowed CORS origins |
| `PORT` | Server | Port to listen on (default `3000`) |
| `NODE_ENV` | Server | Set to `production` for production builds |

</details>

## 🖥️ Requirements

- **Node.js** ≥ 20.19.0
- A WebGPU-capable browser (below) — required for local narration generation, the AI assistant, and zoom effects during screen recording. Without it, fall back to a remote OpenAI-compatible API
- A stable connection for first-run model downloads (roughly 1–5GB depending on models chosen)

<details>
<summary><strong>Browser support</strong></summary>

| Browser | Min. version | Notes |
|---|---|---|
| Chrome / Chromium | 113+ | Chrome extension available for enhanced recording |
| Edge | 113+ | Chrome extension available for enhanced recording |
| Firefox | Nightly | Enable `dom.webgpu.enabled` in `about:config` |
| Safari | 18+ (macOS Sonoma) | Desktop recording supported |

</details>

<details>
<summary><strong>System specs & model sizes</strong></summary>

**Minimum** — 4-core CPU, 8GB RAM, integrated GPU (expect 1–2 hours for first-run downloads + rendering)
**Recommended** — 8-core CPU, 16GB RAM, dedicated GPU with F16 support, NVMe SSD

AI assistant chat model options:

| Model | Download | VRAM |
|---|---|---|
| Gemma 2 2B | 1.4GB | ~2GB |
| Llama 3.2 1B | 800MB | ~1.5GB |
| Llama 3.2 3B | 1.7GB | ~2.5GB |
| Phi 3.5 Vision | 3.9GB | ~4GB (adds image/video analysis) |

</details>

## 🏗️ Tech Stack

<details>
<summary><strong>Frontend, core libraries, and backend</strong></summary>

**Frontend** — React 19 + TypeScript, Vite 7, Tailwind CSS 4, React Router 7

**Core libraries**
- [`@mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm) — local LLM inference for narration and chat
- [`@ffmpeg/ffmpeg`](https://github.com/ffmpegwasm/ffmpeg.wasm) — in-browser video rendering
- [`pdfjs-dist`](https://mozilla.github.io/pdf.js/) — PDF text/image extraction
- [`kokoro-js`](https://github.com/Kokoro-js) — text-to-speech
- [`@dnd-kit`](https://docs.dndkit.com) — drag-and-drop slide reordering

**Backend** — Express 5 + TypeScript (`server.ts`), proxying optional cloud LLM calls and [Pollinations](https://pollinations.ai) image/video generation for Shorts.

**Chrome extension** — plain JS Manifest V3, MessagePort-based telemetry, optional

</details>

### Project structure

```
src/
├── components/      # React UI components
├── pages/           # Routed pages (AssistantPage, etc.)
├── services/        # Business logic — aiService, webLlmService, ttsService,
│                     #   BrowserVideoRenderer, storage, projectArchiveService
├── hooks/           # Custom React hooks
├── context/         # React context providers
└── utils/           # Helpers
```

`App.tsx` owns most cross-cutting state for the editor flow; `SlideEditor.tsx` is the main per-slide editing surface (Overview, Voice Settings, Audio Mixing, Batch Tools, Slide Media tabs).

## 🐛 Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for the full guide. Quick fixes:

| Symptom | Try |
|---|---|
| WebGPU not detected | Enable hardware acceleration, update GPU drivers, switch to a supported browser |
| FFmpeg / dev server errors | Run via `npm run dev` — never open `index.html` directly |
| Model download failures | Check connection stability, clear browser cache, verify storage permissions |
| Out of memory | Use a smaller model, close background apps, lower export resolution |
| COOP/COEP warnings | Confirm the dev server (not a static file) is serving the app |

## 🤝 Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup, coding standards, commit conventions, and the PR process.

When reporting a bug, please include your browser + version, OS, `node -v`, repro steps, and any console output. File issues at [GitHub Issues](https://github.com/TechMitten/Origami-AI/issues).

## 📄 License

Licensed under the [MIT](LICENSE).

## 🙏 Credits

[WebLLM](https://github.com/mlc-ai/web-llm) · [Kokoro.js](https://github.com/Kokoro-js) · [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) · [PDF.js](https://mozilla.github.io/pdf.js/) · [Pollinations](https://pollinations.ai)

---

<div align="center">

<a href="#-quick-start">⬆ Back to top</a>

Made with ❤️ by TechMitten LLC

</div>