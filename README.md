# Origami AI

Transform PDF presentations into cinematic narrated videos using AI-powered text-to-speech and browser-based video rendering.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
	- [PDF Processing](#pdf-processing)
	- [AI-Powered Narration](#ai-powered-narration)
	- [Text-to-Speech](#text-to-speech)
	- [Video Editor](#video-editor)
	- [Video Rendering](#video-rendering)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Browser Requirements](#browser-requirements)
- [How It Works](#how-it-works)
- [Project Backup and Restore](#project-backup-and-restore)
- [Configuration](#configuration)
- [System Requirements](#system-requirements)
- [Notes](#notes)
 - [Troubleshooting](#troubleshooting)
 - [Credits](#credits)

## Overview

Origami AI is a web application that converts static PDF presentations into engaging video content with AI-generated narration, background music, and professional transitions. All processing happens locally in your browser using WebGPU-accelerated AI models and FFmpeg.wasm for video rendering.

## Features

### PDF Processing
- Drag-and-drop PDF upload interface
- Automatic text extraction from each slide using PDF.js
- High-resolution image conversion (2x scale)

### AI-Powered Narration
- **Local AI Processing**: Runs language models directly in your browser using MLC-WebLLM
- **Remote API Support**: Compatible with OpenAI-style APIs
- **Customizable Prompts**: Modify AI behavior through system prompts

### Text-to-Speech
- Multiple voice options (af_heart, af_bella, am_adam, and more)
- Browser TTS processing with Kokoro.js
- Remote TTS service support
- Automatic audio duration calculation for perfect timing

### Video Editor
- Drag-and-drop slide reordering
- Edit individual slide scripts with text highlighting
- Choose from 5 transition effects: fade, slide, wipe, blur, zoom
- Add background music with volume control and auto-ducking
- Generate audio for individual slides or entire presentations

### Video Rendering
- Browser-based rendering with FFmpeg.wasm
- Export in 720p or 1080p resolution
- Real-time progress tracking
- Cancel long-running renders anytime

## Tech Stack

**Frontend**
- React 19.2.0 with TypeScript
- Vite 7.2.4 for build tooling
- Tailwind CSS 4.1.18 for styling
- React Router DOM 7.13.0

**Core Libraries**
- `@mlc-ai/web-llm` - Local LLM inference
- `@ffmpeg/ffmpeg` & `@ffmpeg/util` - Video processing
- `pdfjs-dist` - PDF rendering and text extraction
- `kokoro-js` - Text-to-speech
- `@dnd-kit` - Drag-and-drop functionality

**Backend**
- Express.js 5.2.1 development server
- TypeScript throughout

## Prerequisites

- **Node.js** >= 20.19.0
- **WebGPU-compatible browser** (Chrome 113+, Edge 113+, or Firefox Nightly with WebGPU enabled)
- **At least 8GB RAM** recommended for local AI model processing
- **Stable internet connection** for initial model downloads

- **Docker** (Docker Desktop or Docker Engine) — recommended for containerized deployment (see Option C)

## Getting Started

### Option A — Hosted (No Setup)

Visit **[https://origami.techmitten.com](https://origami.techmitten.com)** — no installation required, everything runs directly in your browser.

---

### Option B — Run Locally

#### 1. Clone the Repository

```bash
git clone https://github.com/IslandApps/Origami-AI.git
cd Origami-AI
```

#### 2. Install Dependencies

Requires **Node.js >= 20.19.0** ([download](https://nodejs.org/)).

```bash
npm install
```

#### 3. Start the Development Server

```bash
npm run dev
```

This starts an Express + Vite dev server with hot module replacement. Open **[http://localhost:3000](http://localhost:3000)** in your browser.

> **Note:** The development server sets the required `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers needed for FFmpeg.wasm and SharedArrayBuffer to work correctly. Opening `index.html` directly in the browser **will not work**.

#### 4. Build for Production

```bash
npm run build
```

Output is written to the `dist/` directory.

#### 5. Preview the Production Build

```bash
npm run preview
```

Serves the production build locally via Vite's preview server for a final sanity check before deploying.

---

### Option C — Docker (Recommended)

A `Dockerfile` and `docker-compose.yml` are included for containerized deployment.

```bash
docker compose up --build
```

The app will be available at **[http://localhost:3000](http://localhost:3000)**.

---

### Browser Requirements

Origami AI requires a **WebGPU-enabled browser** for local AI inference:

| Browser | Minimum Version |
|---|---|
| Chrome / Chromium | 113+ |
| Microsoft Edge | 113+ |
| Firefox | Nightly (enable `dom.webgpu.enabled` in `about:config`) |
| Safari | 18+ (macOS Sonoma) |

> **Tip:** If WebGPU is unavailable, you can still use Origami AI by configuring a remote OpenAI-compatible API in the Settings panel — no local GPU required.

## How It Works

1. **Upload PDF** - Drag and drop your PDF presentation
2. **Process Slides** - The app extracts text and converts pages to images
3. **Generate Scripts** - AI creates narration scripts for each slide
4. **Create Audio** - Text-to-speech generates speech audio from scripts
5. **Customize** - Edit scripts, select voices, add music, choose transitions
6. **Render Video** - FFmpeg.wasm combines everything into an MP4
7. **Download** - Export your final video

## Project Backup and Restore

You can back up and move work between devices using `.origami` project files from the **Actions** menu.

- **Export Project**: Saves your current slides, slide audio/media blobs, music settings, and project metadata into a single `.origami` archive.
- **Import Project**: Validates the archive and replaces the current project with the imported one.

Notes:
- Import is strict by format version. Unsupported or malformed archives are rejected.
- Global app defaults (for example voice/model defaults in Settings) are not changed by import/export.

## Configuration

Settings are available in the app under **Settings** → tabs (General, API, TTS Model, WebLLM, AI Prompt).

### General (Settings → General)
- **Enable Global Defaults** — Apply these defaults to newly uploaded projects.
- **Intro Fade In** / **Intro Fade Length** — Toggle and set the first-slide fade duration (seconds).
- **Post-Audio Delay** — Default pause (seconds) after each slide narration.
- **Audio Normalization** — Toggle automatic normalization of generated audio.
- **Recording Countdown** — Enable/disable the pre-recording countdown.
- **Default Transition** — Choose default slide transition: Fade, Slide, Zoom, or None.
- **Default Music** — Upload a default background music file and set volume.

### TTS Model (Settings → TTS Model)
- **TTS Model / Quantization** — Choose `q4` or `q8` quantization for the browser TTS model (tradeoff: size vs quality).

### WebLLM (Settings → WebLLM)
- **Use WebLLM** — Enable local WebLLM for AI generation instead of remote APIs.
- **Model** — Select which WebLLM model to download/load.
- **Model Precision Filter** — Filter available models by precision (f16/f32/all).

### API (Settings → API)
- **Base URL / API Key** — Configure remote OpenAI-compatible providers (Gemini, OpenRouter, Ollama, etc.).
- **Fetch Models** — Query the provider for available models to populate the Model dropdown.

### AI Prompt (Settings → AI Prompt)
- **Script Fix System Prompt** — Customize the system prompt used when refining scripts with AI.

### **Configure Slides (in-app)**
The slide editor groups features into five sidebar tabs: Overview, Voice Settings, Audio Mixing, Batch Tools, and Slide Media. Key features by section:

Overview
- Inline Script editing (Script / Focus Mode)
- `AI Fix Script` — AI-assisted rewrite of slide text
- Copy / Revert script, Preview modal, Select/Deselect, Delete, Drag & Drop reorder, List/Grid view

Voice Settings
- Global preview and `Apply Voice` to all slides
- Per-slide `Voice` dropdown
- `Generate TTS Audio` / `Regenerate` and `Record Voice` (with optional countdown)
- Per-slide `Delay (s)` and global `Apply Delay`

Audio Mixing
- Default Music upload and default volume
- Per-slide music toggle, playback, seek, loop, and visualizer
- Video music toggle for video slides

Batch Tools
- `Generate All Audio`, `Fix All Scripts`, `Revert All Scripts`, `Find & Replace`
- Batch progress UI, cancellation, and queued processing behavior

Slide Media
- Replace slide image/media (PDF/JPG/PNG)
- Upload MP4 or GIF slides (media duration auto-detected)
- Media preview and duration influence on slide export

Notes: Configure Slides exposes both per-slide and bulk actions. AI features require configured LLM settings (Settings → API) or a loaded WebLLM model.

### WebGPU Setup
If WebGPU is not available in your browser:
1. Enable hardware acceleration in browser settings
2. Update to the latest browser version
3. For Firefox, enable `dom.webgpu.enabled` in `about:config`

## System Requirements

**Minimum**
- 4-core CPU
- 8GB RAM
- Integrated GPU with WebGPU support

**Recommended**
- 8-core CPU
- 16GB RAM
- Dedicated GPU with WebGPU support
- SSD for faster model loading

## Notes

- All AI processing happens locally in your browser - your data never leaves your device
- Initial AI model download may take several minutes depending on your internet connection
- Models are cached locally after first download
- Video rendering performance depends on your hardware capabilities

- Report issues: https://github.com/IslandApps/Origami-AI/issues

---

## Troubleshooting

- **WebGPU not detected**: Verify hardware acceleration is enabled in your browser, update GPU drivers, and use a supported browser (Chrome/Edge 113+). On Firefox enable `dom.webgpu.enabled` in `about:config` and use Nightly builds.

- **Dev server pages fail / FFmpeg.wasm errors**: Do not open `index.html` directly — run the development server so COOP/COEP headers are set:

```bash
npm run dev
```

- **SharedArrayBuffer / COOP/COEP warnings**: Ensure the dev server provides `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`. If using a custom server, add these headers to responses.

- **Large model downloads or TTS failures**: Ensure a stable internet connection for first-time model/TTS downloads, clear site data if downloads stall, and allow storage in browser settings.

- **Out of memory (OOM) during local inference**: Try a smaller or quantized model, close other applications, increase system RAM, or switch to the remote API fallback in Settings.

- **FFmpeg.wasm slow or high memory usage**: Reduce output resolution (e.g., 720p), split rendering into smaller jobs, or use the Docker container to offload work to a more consistent environment.

- **Audio/video sync or export failures**: Rebuild the project assets (`npm run build`) and retry previewing with `npm run preview`. Check browser console for errors and include logs when reporting issues.

- **Docker issues**: If `docker compose up` fails, ensure Docker Desktop/Engine is installed and running, and verify you have sufficient disk space and permissions.

- **When reporting issues**: Include browser name/version, OS, Node version (`node -v`), steps to reproduce, and relevant console logs. Report at: https://github.com/IslandApps/Origami-AI/issues

## Credits

- WebLLM — Local LLM inference: https://github.com/mlc-ai/web-llm
- Kokoro.js — Text-to-speech: https://github.com/Kokoro-js
- ffmpeg.wasm — FFmpeg in WebAssembly: https://github.com/ffmpegwasm/ffmpeg.wasm
