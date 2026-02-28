# Origami AI

Transform PDF presentations into cinematic narrated videos using AI-powered text-to-speech and browser-based video rendering.

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
- **Vision Capabilities**: Analyzes slide images alongside text for better script generation
- **Customizable Prompts**: Modify AI behavior through system prompts

### Text-to-Speech
- Multiple voice options (af_heart, af_bella, am_adam, and more)
- Local TTS processing with Kokoro.js
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

## Getting Started

### Option A — Hosted (No Setup)

Visit **[https://origami.islandapps.dev](https://origami.islandapps.dev)** — no installation required, everything runs directly in your browser.

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

### Option C — Docker

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

## Configuration

### Settings Panel (⚙️)
- **Default Voices**: Set preferred TTS voices for new projects
- **Transition Effects**: Choose default transition style
- **AI Model Settings**: Configure local vs remote AI processing
- **WebGPU Check**: Verify browser compatibility

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
