<a id="top"></a>
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
    <a href="#quick-start"><strong>Quick Start</strong></a> ·
    <a href="#features">Features</a> ·
    <a href="#use-cases">Use Cases</a> ·
    <a href="#how-it-works">How It Works</a> ·
    <a href="#configuration">Configuration</a> ·
    <a href="#requirements">Requirements</a> ·
    <a href="CONTRIBUTING.md">Contributing</a>
  </p>
</div>

---

<a id="what-is-origami-ai"></a>
## What is Origami AI?

Origami AI is a **browser-based AI Studio** that runs AI-powered applications entirely on your device using [WebGPU](https://gpuweb.github.io/) and [WebLLM](https://github.com/mlc-ai/web-llm). No cloud dependency, no data upload, no API calls required (though optional cloud integrations are supported).

Originally a PDF-to-video tool, Origami AI has evolved into a versatile platform for:
- **📹 PDF-to-video creation** — AI narration scripts, text-to-speech, and in-browser rendering
- **🎬 Shorts generation** — topic-to-vertical-video with AI imagery and voiceovers
- **🎙️ Screen recording** — cinematic auto-zoom with DOM telemetry
- **💬 AI assistant chat** — local models with image/video analysis
- **🎯 Video scene analysis** — MP4 breakdown with timestamped scenes

---

<a id="features"></a>
## ✨ Features

- 🧠 **WebGPU-powered AI** — local LLM inference for narration, chat, and analysis
- 🎬 **AI narration scripts** — generated locally with WebLLM, or via Gemini/OpenAI-compatible APIs
- 🎙️ **In-browser TTS** — Kokoro.js with multiple voices, no server round-trip
- 📹 **In-browser rendering** — FFmpeg.wasm composes slides, audio, music, and pan/zoom into MP4 (720p/1080p)
- 🎯 **Smart screen recording** — auto-zoom on idle, with optional Chrome extension for richer DOM telemetry
- 🔍 **Scene-aware video analysis** — turn an MP4 into a timestamped scene breakdown
- 💬 **AI assistant chat** — local WebLLM models or cloud fallback, with image/video attachments
- 🎬 **Shorts generator** — turn a topic into a vertical short: AI script, image/video generation, TTS voiceover, burned-in captions
- 🔒 **Local & privacy-first** — API keys and project data are stored locally in your browser
- 🎵 **Background music & mixing** — auto-ducking under narration with per-slide control
- 📦 **Portable projects** — export/import a full project (slides, media, audio, settings) as a `.origami` archive
- ⚡ **Zero-config startup** — works completely offline after first model download

---

<a id="quick-start"></a>
## 🚀 Quick Start

**Prerequisites:** Node.js ≥ 20.19.0 and a [WebGPU-capable browser](https://webgpureport.org/).

```bash
git clone https://github.com/TechMitten/Origami-AI.git
cd Origami-AI
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

### Available Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Express + Vite dev server with HMR (`http://localhost:3000`) |
| `npm run build` | Build production client bundle → `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint checks |
| `npm run stop` | Terminate any active process running on port 3000 |

<details>
<summary><strong>Run with Docker instead</strong></summary>

```bash
docker compose up --build
```

Available at **http://localhost:3000**.
</details>

<details>
<summary><strong>Optional: install the Chrome extension</strong></summary>

The extension adds DOM-level cursor, click, and scroll telemetry for more precise auto-zoom during screen recording. Origami AI also works without it via an in-page fallback.

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `chrome-extension/` folder

You can also download a packaged ZIP from inside the app (header menu → **Download Chrome Extension**, or Slide Editor → *Slide Media* tab). See [chrome-extension/README.md](chrome-extension/README.md).
</details>

---

<a id="use-cases"></a>
## 📋 Use Cases

### 📹 PDF Slides → Professional Video
Upload a presentation deck, generate AI narration scripts per slide, select natural TTS voices, add background music, and export a polished MP4 video — all in your browser.

### 🎬 Topic → Short-Form Video
Describe a topic or concept, and Origami AI will generate a scene-by-scene script, create visuals (AI images or video clips via Pollinations), synthesize voiceovers, and burn in captions for a complete vertical short in minutes.

### 🎙️ Screen Recording with Smart Zoom
Record a browser tab or desktop window, and Origami AI automatically tracks mouse interactions and applies smooth, cinematic camera zooms and pans during idle periods.

### 💬 Interactive AI Assistant Chat
Chat with local WebLLM models directly in your browser, attach images or video clips for local vision analysis, and get instant answers with zero internet connection required.

### 🎯 Video Scene Breakdown & Analysis
Upload an MP4 video to automatically analyze and segment scenes into timestamped summaries and key takeaways.

---

<a id="how-it-works"></a>
## 🧭 How It Works

### Primary Flow: PDF to Narrated Video
1. **Extraction**: Upload a PDF deck; slide images and text are extracted automatically via `pdfjs-dist`.
2. **Script Generation**: An LLM (local WebLLM or your configured API) drafts natural narration per slide.
3. **Voice Synthesis**: Kokoro.js generates high-quality speech audio for each slide's script.
4. **Visual Editing**: Fine-tune scripts, audio timing, slide transitions, and background music in the visual editor.
5. **Video Rendering**: FFmpeg.wasm composes all assets into a 720p or 1080p MP4 directly in your browser.

### Shorts Generator Flow (`/shorts`)
1. **Prompt & Setup**: Enter a topic, duration (15–90s), tone, aspect ratio (9:16 / 16:9 / 1:1), and visual style.
2. **Script & Prompt Review**: The LLM creates scene-by-scene voiceovers and matching visual prompts for review before generation.
3. **Asset Generation**: Generates images or video clips via [Pollinations](https://pollinations.ai) alongside Kokoro TTS voiceover in parallel.
4. **Captions & Music**: Choose a dynamic caption style (Bold Pop, Karaoke Fill, or Clean Lower Third) and optional soundtrack.
5. **Client-Side Export**: Renders the complete vertical video directly on your device.

---

<a id="configuration"></a>
## ⚙️ Configuration

Click **⚙️ Settings** in the app header to customize your experience:

| Tab | Available Options |
|---|---|
| **General** | Intro fade timing, post-audio delay, default slide transition, screen recording options |
| **TTS Model** | Kokoro.js quantization quality (`q8` high quality vs. `q4` speed) |
| **WebLLM** | Enable/disable local AI, select models, precision filtering (f16/f32) |
| **API** | Connect custom OpenAI-compatible providers (Gemini, OpenRouter, Groq, Ollama, etc.) |
| **AI Prompt** | Customize narration tone, length, and generation behavior |

### API Configuration

Origami AI works with **zero API keys** out of the box using local in-browser WebLLM and Kokoro TTS.

If you choose to use cloud AI providers, all settings and keys are configured directly in the frontend:
- **OpenAI-compatible APIs**: Open **⚙️ Settings → API** to set your endpoint base URL, model name, and API key. Credentials are saved locally in your browser's IndexedDB and never stored on the server.
- **Shorts Image & Video Generation**: Powered by [Pollinations](https://pollinations.ai). Connect your account or enter your API key directly in the app from the Shorts composer or Settings.

No backend `.env` file or server environment variables are needed for API keys.

<details>
<summary><strong>Server environment variables (optional)</strong></summary>

| Variable | Context | Purpose |
|---|---|---|
| `CLIENT_URL` | Server | Comma-separated allowed CORS origins (default `http://localhost:5173`) |
| `PORT` | Server | Port to listen on (default `3000`) |
| `NODE_ENV` | Server | Set to `production` for production builds |

</details>

---

<a id="requirements"></a>
## 🖥️ Requirements & Compatibility

- **Node.js**: ≥ 20.19.0 (or ≥ 22.0.0)
- **WebGPU-compatible browser**: Required for local WebLLM inference and GPU-accelerated effects.
- **Network**: Stable connection required for initial model downloads (cached locally in browser storage).

<details>
<summary><strong>Supported Browsers</strong></summary>

| Browser | Min. Version | Status & Notes |
|---|---|---|
| **Chrome / Chromium** | 113+ | Fully supported; Chrome extension available for enhanced telemetry |
| **Edge** | 113+ | Fully supported; Chrome extension compatible |
| **Firefox** | Nightly | Supported with `dom.webgpu.enabled` enabled in `about:config` |
| **Safari** | 18+ (macOS Sonoma+) | Supported for desktop workflows |

</details>

<details>
<summary><strong>Hardware Specifications & Model Sizes</strong></summary>

- **Minimum**: 4-core CPU, 8GB RAM, integrated GPU
- **Recommended**: 8-core CPU, 16GB RAM, dedicated GPU with F16 support, NVMe SSD

**Local WebLLM Models:**

| Model | Download Size | Approx. VRAM | Focus / Capabilities |
|---|---|---|---|
| **Gemma 2 2B** | ~1.4 GB | ~2 GB | Fast, lightweight general text & narration |
| **Llama 3.2 1B** | ~800 MB | ~1.5 GB | Ultra-fast execution, low memory footprint |
| **Llama 3.2 3B** | ~1.7 GB | ~2.5 GB | Balanced performance & reasoning quality |
| **Phi 3.5 Vision** | ~3.9 GB | ~4 GB | Multimodal (adds image & video analysis) |

</details>

---

<a id="tech-stack"></a>
## 🏗️ Tech Stack

<details>
<summary><strong>Core Libraries & Architecture</strong></summary>

- **Frontend Framework**: React 19, TypeScript, Vite 7, Tailwind CSS 4, React Router 8
- **AI Inference**: [`@mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm) (local WebGPU LLMs)
- **Speech Synthesis**: [`kokoro-js`](https://github.com/Kokoro-js) (in-browser neural TTS)
- **Video Composition**: [`@ffmpeg/ffmpeg`](https://github.com/ffmpegwasm/ffmpeg.wasm) (client-side FFmpeg)
- **Document Processing**: [`pdfjs-dist`](https://mozilla.github.io/pdf.js/) (PDF rasterization & text extraction)
- **UI & Interactions**: [`@dnd-kit`](https://docs.dndkit.com) (drag-and-drop), [`lucide-react`](https://lucide.dev)
- **Backend & Proxy**: Express 5 + TypeScript (`server.ts`) / Cloudflare Pages Functions (`functions/api/`)

</details>

### Project Directory Structure

```
Origami-AI/
├── src/
│   ├── components/      # React UI components & modal dialogs
│   │   └── shorts/      # Shorts composer, storyboard, and scene cards
│   ├── pages/           # Application views (Assistant, Shorts, etc.)
│   ├── services/        # WebLLM, TTS, FFmpeg renderer, storage, archives
│   ├── hooks/           # Custom React hooks (screen recording, audio, etc.)
│   ├── context/         # React Context providers (downloads, notifications)
│   └── utils/           # Helper functions & formatters
├── functions/           # Cloudflare Pages Functions API endpoints
├── chrome-extension/    # Optional DOM telemetry extension
├── server.ts            # Local Express server with Vite middleware
└── public/              # Static assets, fonts, audio files
```

---

<a id="troubleshooting"></a>
## 🐛 Troubleshooting

For comprehensive debugging and platform-specific tips, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

| Issue | Recommended Solution |
|---|---|
| **WebGPU not detected** | Enable hardware acceleration in your browser settings, update GPU drivers, or switch to a supported Chromium browser. |
| **Dev server errors** | Start the app with `npm run dev` to ensure required security headers (`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`) are applied. |
| **Model download failures** | Verify connection stability, clear browser cache / site data, and ensure sufficient disk space. |
| **Out of memory during rendering** | Select a lighter LLM model, close resource-heavy background applications, or reduce export video resolution. |

---

<a id="contributing"></a>
## 🤝 Contributing

Contributions, issues, and feature requests are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for local development setup, coding conventions, and pull request guidelines.

To report bugs or suggest enhancements, please open an issue at [GitHub Issues](https://github.com/TechMitten/Origami-AI/issues).

---

<a id="license"></a>
## 📄 License & Credits

- **License**: Released under the [MIT License](LICENSE).
- **Core Technologies**: Built with gratitude to [WebLLM](https://github.com/mlc-ai/web-llm), [Kokoro.js](https://github.com/Kokoro-js), [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm), [PDF.js](https://mozilla.github.io/pdf.js/), and [Pollinations](https://pollinations.ai).

---

<div align="center">

<a href="#top">⬆ Back to top</a>

<p>Made with ❤️ by TechMitten LLC</p>

</div>