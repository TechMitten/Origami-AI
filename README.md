<div align="center" style="display:flex;flex-direction:column;align-items:center;gap:12px;margin-bottom:20px;">
  <img src="logo/logo.png" alt="Origami AI Logo" width="320" style="display:block;margin:0;height:auto;max-width:90%;" />
  <div style="display:inline-flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center;">
    <a href="https://github.com/IslandApps/Origami-AI/stargazers"><img src="https://img.shields.io/github/stars/islandapps/origami-ai?style=social" alt="GitHub stars" /></a>
    <a href="https://github.com/IslandApps/Origami-AI/issues"><img src="https://img.shields.io/github/issues/islandapps/origami-ai" alt="Issues" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/islandapps/origami-ai" alt="License" /></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen" alt="Node" /></a>
  </div>
</div>

<p style="text-align:center;margin-top:6px;"><strong>Transform PDF presentations into cinematic narrated videos with AI-generated scripts, browser-based TTS, and local rendering.</strong></p>

## Table of Contents

- [Overview](#overview)
- [Why Origami?](#why-origami)
- [Key Features](#key-features)
  - [PDF Processing](#pdf-processing)
  - [Screen Recording & Auto Zoom](#screen-recording--auto-zoom)
  - [Chrome Extension](#chrome-extension)
  - [AI-Powered Narration](#ai-powered-narration)
  - [Text-to-Speech](#text-to-speech)
  - [Video Editor](#video-editor)
  - [Analyze Video and Scene Alignment](#analyze-video-and-scene-alignment)
  - [Bug Reporter](#bug-reporter)
  - [AI Assistant Chat](#ai-assistant-chat)
  - [Video Rendering](#video-rendering)
- [Getting Started](#getting-started)
  - [Option B - Run Locally](#option-b---run-locally)
  - [Option C - Docker](#option-c---docker)
  - [Option D - Chrome Extension](#option-d---chrome-extension)
  - [Available Scripts](#available-scripts)
- [Requirements](#requirements)
  - [Prerequisites](#prerequisites)
  - [Browser Compatibility](#browser-compatibility)
  - [System Requirements](#system-requirements)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
  - [Settings](#settings)
    - [General](#general)
    - [TTS Model](#tts-model)
    - [WebLLM](#webllm)
    - [API](#api)
    - [AI Prompt](#ai-prompt)
  - [Configure Slides (In-App)](#configure-slides-in-app)
  - [Analyze Video Workflow (In-App)](#analyze-video-workflow-in-app)
  - [Browser Extension Setup](#browser-extension-setup)
  - [AI Assistant Chat](#ai-assistant-chat-1)
  - [Bug Reporter](#bug-reporter-1)
  - [WebGPU Setup](#webgpu-setup)
- [Project Backup and Restore](#project-backup-and-restore)
- [Troubleshooting](#troubleshooting)
- [Tech Stack](#tech-stack)
- [Notes](#notes)
- [Support](#support)
- [Credits](#credits)

## Overview

Origami AI is a web application that converts static PDF presentations into polished video content with AI-generated narration, background music, and transitions. Processing happens locally in your browser using WebGPU-accelerated models and FFmpeg.wasm.

## Why Origami?

### Why the name

Origami is the art of folding paper into new shapes. This app does something similar with PDFs: it turns flat slides into cinematic videos by adding voice-over, camera moves (zoom, pan, tilt), transitions, and sound. The result is a more engaging presentation of the original material.

Traditional video creation from presentations is often a choice between **tedious manual labor** or **expensive AI subscriptions**. Origami AI offers a third way: a fully automated, local-first studio that lives in your browser.

* **🎬 Static to Cinematic:** Don't just show slides; tell a story. Origami automatically extracts context from your PDFs and crafts a narrative script that flows naturally.
* **🔒 Privacy First (Local-Only):** Your data stays on your machine. By leveraging **WebGPU** and **WebLLM**, your scripts and audio are generated locally without ever sending sensitive presentation data to a third-party server.
* **🎙️ The "No-Mic" Solution:** Perfect for creators who prefer not to use their own voice. With integrated **Kokoro.js** TTS, you get high-quality, human-like narration without needing a recording studio.
* **⚙️ Zero Infrastructure:** No complex Python environments or CUDA drivers to wrestle with. If you have a modern browser, you have a professional-grade video editor.
* **💸 Cost Effective:** Avoid "per-minute" AI generation fees. Use your own hardware to run inference and rendering for free.

| Feature | Traditional Editors | Cloud AI Video Tools | Origami AI |
| :--- | :--- | :--- | :--- |
| **Effort** | High (Manual) | Low | **Minimal (Automated)** |
| **Privacy** | Local | Cloud-Based (Risk) | **Local-First** |
| **Cost** | One-time / Free | Monthly Subscription | **Free & Open Source** |
| **Voice** | Your own / Pro Talent | Credits-based TTS | **Unlimited Local TTS** |

---

## Key Features

### PDF Processing
- Drag-and-drop PDF upload
- Automatic text extraction from each slide with PDF.js
- High-resolution image conversion (2x scale)

### Screen Recording & Auto Zoom
- Record browser tabs (with Chrome extension for DOM telemetry) or desktop screen
- Automatic cursor position tracking and interaction capture (clicks, key presses, scroll events)
- **Auto Zoom during idle periods**: Automatically zoom out when user is idle (no cursor movement > 2 seconds), then zoom back in when activity resumes
- Smooth easing transitions (easeInOutCubic) for natural zoom animations
- Works seamlessly with fallback local interaction tracking if Chrome extension unavailable
- Recorded screen data feeds into video editor for scene timing and narration sync

### Chrome Extension
- Captures real browser tab interactions (cursor position, clicks, keypresses, scrolls) with precise DOM-level telemetry
- Enables accurate zoom/pan/follow effects based on user interactions on web pages
- Visual status indicator on extension icon: "ARM" (armed/ready) or "REC" (recording) with color changes
- Automatically provides fallback if extension unavailable; app uses local interaction tracking
- Browser tabs only (desktop/OS window recordings don't include DOM telemetry)
- Recommended for optimal interaction capture during screen recording workflows

### AI-Powered Narration
- Local AI processing with MLC-WebLLM
- Remote API support with OpenAI-compatible providers
- Customizable prompts for script behavior

### Text-to-Speech
- Multiple voices (af_heart, af_bella, am_adam, and more)
- Browser TTS via Kokoro.js
- Remote TTS support
- Automatic audio duration calculation for timing

### Video Editor
- Drag-and-drop slide ordering
- Per-slide script editing with highlighting
- Transitions: fade, slide, wipe, blur, zoom
- Background music with volume and auto-ducking
- Per-slide or full-project audio generation

### Analyze Video and Scene Alignment
- Analyze uploaded Slide Media MP4 clips into timestamped scenes using Gemini
- Produces structured scene plans: step number, start timestamp, on-screen action, narration text, and duration
- Adds a full-screen Scene Alignment Editor for timeline-locked scene review and editing
- Supports per-scene TTS generation and full scene-batch TTS generation
- Automatically stretches the effective timeline when narration audio exceeds scene duration
- Stores raw Gemini JSON output for debugging

### Bug Reporter
- Record screen capture of bugs and let AI analyze them
- Describe expected behavior vs. actual issue; AI generates structured debugging report
- Gemini-powered analysis produces: issue title, summary, reproduction steps, observed/expected behavior, technical clues
- Output includes a ready-to-paste debugging prompt for faster issue resolution
- Accessible via dedicated `/issue-reporter` route in main app navigation
- Requires Gemini API key configured in Settings

### AI Assistant Chat
- Local AI chatbot powered by WebLLM running entirely in your browser (no data sent to cloud)
- 9+ available models including Gemma 2 (default, 1.4GB), Llama 3.2 variants, Phi 3.5 Mini/Vision, DeepSeek R1, and more
- Vision-capable models (Phi 3.5 Vision) can analyze images and video clips
- Multi-session chat with persistent storage; auto-generated session titles and chronological listing
- Attach images (up to 8MB) and video clips (up to 20MB) for AI analysis
- Switch models mid-conversation; sessions auto-save to IndexedDB
- Accessible via dedicated `/assistant` route in main app navigation
- Requires WebGPU-capable browser; 1-5GB VRAM depending on model selection

### Video Rendering
- Browser rendering using FFmpeg.wasm
- 720p and 1080p export
- Real-time progress tracking
- Render cancellation support

## Getting Started

### Option B - Run Locally

1. Clone the repository:

```bash
git clone https://github.com/IslandApps/Origami-AI.git
cd Origami-AI
```

2. Install dependencies (Node.js >= 20.19.0):

```bash
npm install
```

3. Start development server:

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**.

> The development server is required because it sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`, which FFmpeg.wasm and SharedArrayBuffer need. Opening `index.html` directly will not work.

4. Build production assets:

```bash
npm run build
```

5. Preview production build:

```bash
npm run preview
```

### Option C - Docker

Containerized deployment is supported via the included Docker files:

```bash
docker compose up --build
```

App URL: **[http://localhost:3000](http://localhost:3000)**.

### Option D - Chrome Extension

For enhanced browser tab interaction tracking during screen recording:

1. Open `chrome://extensions` in your browser.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `chrome-extension/` folder from the repository.
4. Start Origami AI, enable screen recording, and click the extension icon on any browser tab to capture interactions.

See [chrome-extension/README.md](chrome-extension/README.md) for detailed installation and troubleshooting.

**Note:** The extension is optional but recommended for capturing precise cursor and interaction telemetry on web pages during recording.

### Available Scripts

- `npm run dev` - Start Express + Vite development server with HMR
- `npm run build` - Create production build
- `npm run preview` - Preview production build locally
- `npm run lint` - Run lint checks

## Requirements

### Prerequisites

- Node.js >= 20.19.0
- WebGPU-compatible browser for local AI inference
- Stable internet connection for first-time model downloads
- Docker Desktop or Docker Engine (optional, for container deployment)

### Browser Compatibility

| Browser | Minimum Version | Notes |
|---|---|---|
| Chrome / Chromium | 113+ | Chrome Extension available for enhanced screen recording |
| Microsoft Edge | 113+ | Chrome Extension available for enhanced screen recording |
| Firefox | Nightly (enable `dom.webgpu.enabled`) | Desktop recording supported; Chrome Extension unavailable |
| Safari | 18+ (macOS Sonoma) | Desktop recording supported; Chrome Extension unavailable |

**WebGPU Required For:**
- AI-Powered Narration (local WebLLM)
- AI Assistant Chat
- Any local LLM inference

If WebGPU is unavailable, you can still use remote OpenAI-compatible APIs from Settings for narration and analysis.

### System Requirements

**Minimum**
- 4-core CPU
- 8GB RAM
- Integrated GPU with WebGPU support
- Storage: 50GB+ available space (for model caching)

**Recommended**
- 8-core CPU
- 16GB RAM
- Dedicated GPU with WebGPU support
- SSD for faster model/model-cache operations
- Hardware-accelerated video encoding for screen recording workflows

**AI Assistant Chat Requirements**
- **Gemma 2 2B** (default): 1.4GB download, ~2GB VRAM
- **Llama 3.2 1B**: 800MB download, ~1.5GB VRAM
- **Llama 3.2 3B**: 1.7GB download, ~2.5GB VRAM
- **Phi 3.5 Mini**: 2.5GB download, ~3GB VRAM
- **Phi 3.5 Vision**: 3.9GB download, ~4GB VRAM (includes vision/image analysis)
- **DeepSeek R1 Distill 8B**: 4.5GB download, ~5GB VRAM
- **Note:** F16 models require GPU F16 support; F32 variants available as fallback with slightly higher VRAM

## How It Works

**Primary Workflow: PDF to Video**
1. Upload a PDF.
2. Extract text and convert pages to slide images.
3. Generate narration scripts with AI.
4. Generate speech audio from scripts.
5. Edit scripts, voice, timing, transitions, and music.
6. Render final MP4 with FFmpeg.wasm.
7. Download the video.

**Alternative Input: Screen Recording**
- Record browser tab or desktop screen to capture interactions and generate video content
- Auto zoom applied during idle periods for cinematic effect
- Use screen capture as slide media alongside or instead of PDFs

**Supplementary Tools**
- **AI Assistant Chat** (`/assistant`): Ask questions, attach images/videos for AI analysis, maintain persistent chat sessions
- **Bug Reporter** (`/issue-reporter`): Record bugs, get AI-powered analysis and debugging suggestions

## Configuration

### Settings

Settings are grouped under **General**, **API**, **TTS Model**, **WebLLM**, and **AI Prompt**.

#### General
- Enable Global Defaults for new uploads
- Intro Fade In and Intro Fade Length (seconds)
- Post-Audio Delay (seconds)
- Audio Normalization toggle
- Recording Countdown toggle
- Default Transition (Fade, Slide, Zoom, None)
- Default Music upload and volume

#### TTS Model
- TTS quantization selection: `q4` or `q8`

#### WebLLM
- Enable/disable local WebLLM
- Select model to load
- Precision filter (f16, f32, all)

#### API
- Configure Base URL and API Key for OpenAI-compatible providers (Gemini, OpenRouter, Ollama, etc.)
- Fetch models from provider

#### AI Prompt
- Customize Script Fix System Prompt


### Configure Slides (In-App)

The slide editor includes five tabs:

- Overview
  - Script edit/focus modes
  - AI Fix Script
  - Copy/Revert, preview, select/delete, reorder, list/grid
- Voice Settings
  - Global voice preview and apply-all
  - Per-slide voice, TTS generation/regeneration, voice recording
  - Per-slide delay and apply-all delay
- Audio Mixing
  - Default music and volume
  - Per-slide music playback, seek, loop, visualizer
  - Video music toggle for video slides
- Batch Tools
  - Generate All Audio, Fix All Scripts, Revert All Scripts, Find & Replace
  - Batch progress/cancel support
- Slide Media
  - Replace slide image/media (PDF/JPG/PNG)
  - Upload MP4/GIF slides (duration auto-detected)
  - Media preview and duration-aware export behavior
  - Analyze Video (silent MP4 only) to generate editable scene narration plans
  - Open Scene Alignment Editor to edit timestamps, durations, and narration per scene
  - Generate TTS per scene or all scenes with timeline stretch recalculation

AI actions require either a configured API provider or a loaded WebLLM model.

### Analyze Video Workflow (In-App)

Use this workflow after uploading a Slide Media video when you want scene-aware narration.

1. Upload a video slide as MP4 in Slide Media.
2. Click **Analyze Video** on that slide.
3. Wait for progress stages (upload, processing, JSON generation, parsing).
4. Open **Edit Scenes** to review in the full-screen Scene Alignment Editor.
5. Adjust scene timestamps (`MM:SS`), durations, and narration text.
6. Generate scene TTS (single scene or all scenes).
7. Render MP4 normally; slide timeline uses the effective stretched duration.

#### Analyze Video Requirements and Limits
- Requires a configured Gemini API key in Settings.
- Video file analysis requires Google Gemini base URL (`https://generativelanguage.googleapis.com/v1beta/openai/`).
- Analyze Video only supports Slide Media silent MP4 uploads.
- GIF/image media is not supported for analysis.
- MP4 files with embedded audio tracks are rejected for this workflow.
- If model output JSON is malformed, Origami automatically retries with a repair prompt.

### Browser Extension Setup

The Chrome Extension enhances screen recording by capturing precise DOM-level telemetry (cursor position, interactions) for browser tabs.

**Installation:**
1. Download or clone the repository.
2. Open `chrome://extensions` in Chrome or Edge.
3. Enable **Developer mode** (toggle on top right).
4. Click **Load unpacked**.
5. Navigate to the `chrome-extension/` folder and select it.

**Usage:**
- While recording a screen with Origami AI, click the extension icon on your target browser tab.
- The badge changes from "ARM" (armed) to "REC" (recording) when capturing.
- Captured data includes cursor position, clicks, keypresses, scrolls, and timestamps.
- Data is automatically merged with visual recording for synchronized playback and camera effects.

**Data & Privacy:**
- All data collected stays local in the browser
- No data is uploaded to external servers
- Extension data automatically cleaned up when recording stops

**Limitations:**
- Works on regular web pages only (not `chrome://` or other protected URLs)
- Browser tab recording only (use desktop/window capture for OS applications)
- Requires browser reload if extension is updated

### AI Assistant Chat

Configure local AI chatbot settings and model selection for the AI Assistant Chat feature (accessible at `/assistant`).

**Model Selection:**
- Choose from 9+ models based on your GPU capacity
- Default: **Gemma 2 2B** (fast, low memory, good quality)
- Vision models available: **Phi 3.5 Vision** for image and video analysis
- **Precision filtering**: Choose f16 (faster), f32 (more compatible), or all models
- Model downloads cached automatically after first use

**Session Management:**
- Sessions are automatically saved to IndexedDB
- Create unlimited multi-session conversations
- Sessions list auto-generated titles and sort chronologically
- Delete individual sessions or start fresh conversations

**Capabilities:**
- Text chat with streaming responses
- Image attachment analysis (JPEG, PNG, WEBP, up to 8MB per image)
- Video clip analysis (WebM, MP4, up to 20MB per video)
- Switch models mid-conversation
- Markdown rendering of AI responses

**Requirements:**
- WebGPU-capable browser
- 1-5GB available VRAM (model-dependent)
- Stable internet for initial model download
- Browser storage permissions enabled

**Troubleshooting:**
- If GPU runs out of memory: try a smaller model or close background apps
- If "device lost" error appears: refresh page and reinitialize the model
- If models won't download: check internet connection and clear browser cache

### Bug Reporter

Use the Bug Reporter tool (accessible at `/issue-reporter`) to capture and analyze bugs with AI assistance.

**Workflow:**
1. Navigate to the **Bug Reporter** page.
2. Describe **"What should happen?"** (expected behavior) - optional but recommended.
3. Describe **"What is happening instead?"** (observed issue) - optional but recommended.
4. Click **Record Issue** and reproduce the bug on your screen.
5. Wait for Gemini AI to analyze the recording.
6. Review the generated structured bug report.
7. Copy the **recommended debugging prompt** to your clipboard.

**Analysis Output:**
Gemini AI generates:
- **Issue Title** - Concise bug name
- **Summary** - Brief description
- **Observed Behavior** - What went wrong
- **Expected Behavior** - What should happen
- **Reproduction Steps** - How to reproduce consistently
- **Technical Clues** - Implementation hints for developers
- **Recommended Prompt** - Ready-to-paste prompt for further debugging

**Requirements:**
- Configured Gemini API key in Settings
- Google Gemini base URL configured (`https://generativelanguage.googleapis.com/v1beta/openai/`)
- Stable internet connection for video upload and analysis

**Tips:**
- Screen record the exact moment the bug occurs for best analysis
- Provide context in the description field for more accurate AI analysis
- Keep videos short (< 30 seconds) for faster processing
- Use **Start Over** to clear and record another issue

### WebGPU Setup

If WebGPU is unavailable:

1. Enable hardware acceleration in browser settings.
2. Update browser to latest version.
3. In Firefox Nightly, enable `dom.webgpu.enabled`.

## Project Backup and Restore

Use `.origami` archives from the **Actions** menu to move projects between devices.

- Export Project: Saves slides, media/audio blobs, music settings, and project metadata.
- Import Project: Validates archive and replaces the current project.

Notes:
- Import is strict by archive format version.
- Global defaults in Settings are not changed by project import/export.

## Troubleshooting

- **WebGPU not detected**: Enable hardware acceleration, update GPU drivers, and use a supported browser.
- **Dev server or FFmpeg.wasm errors**: Start via `npm run dev`; do not open `index.html` directly.
- **SharedArrayBuffer / COOP/COEP warnings**: Ensure responses include `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`.
- **Model download or TTS failures**: Verify internet stability, clear site data, and check browser storage permissions.
- **Out of memory during local inference**: Use smaller/quantized models, close background apps, or switch to remote API.
- **FFmpeg.wasm slow/high memory**: Lower resolution, reduce project size, or run via Docker.
- **Audio/video sync or export failures**: Rebuild with `npm run build`, then retry with `npm run preview`.
- **Analyze Video fails or stays unavailable**: Verify Gemini API key, Google Gemini base URL, and that the slide media is a silent MP4.
- **Analyze Video rejects your MP4 for audio**: Remove the clip audio track, then re-upload and analyze again.
- **Docker issues**: Confirm Docker is installed/running and has enough disk space/permissions.

### Screen Recording & Auto Zoom Issues

- **Screen recording not starting**: Ensure browser has permission to access screen. Check COOP/COEP headers are set. Try reloading the page.
- **Auto zoom not activating**: Verify cursor movement was captured during recording. Check that `minIdleDurationMs` (default 2000ms) idle time is met. Review cursor data in the recording.
- **Chrome Extension not capturing data**: Ensure extension is installed in `chrome://extensions`. Reload the extension if Origami AI was updated. Try desktop recording as fallback if extension unavailable.
- **Tab recording prompts but captures nothing**: Extension may be disabled or not loaded. Check extension is enabled in `chrome://extensions`. Reinstall if needed.

### AI Assistant Chat Issues

- **Chat page shows "WebGPU not supported"**: Enable hardware acceleration in browser settings, update GPU drivers, use a compatible browser (Chrome 113+, Edge 113+, Firefox Nightly).
- **Model download stuck or fails**: Check internet connection. Clear browser cache and site data. Try again or switch to a smaller model.
- **"Device lost" error during chat**: GPU crashed or was disconnected. Refresh the page and reinitialize. Try a smaller model or close background applications.
- **Chat runs very slow**: Your GPU may be memory-constrained. Close background apps, reduce browser tabs, or switch to a smaller model. Consider F32 variant if F16 causes instability.
- **AI responses are incomplete or cut off**: Increase max tokens setting or shorten your input prompt. Reduce context length by starting a new chat session.
- **Cannot attach images or videos**: Ensure files are under size limits (8MB images, 20MB videos). Verify file format (JPEG, PNG, WEBP for images; WebM, MP4 for videos). Check browser storage permissions.

### Bug Reporter Issues

- **Gemini analysis fails immediately**: Verify Gemini API key is configured in Settings. Check base URL is set to `https://generativelanguage.googleapis.com/v1beta/openai/`.
- **Video upload takes too long or fails**: Check internet connection. Verify file size is reasonable (< 100MB). Try a shorter screen recording. Clear browser cache and retry.
- **Analysis returns empty or malformed report**: Retry analysis; Origami AI auto-repairs malformed Gemini responses. If issue persists, verify video quality/clarity and that issue is reproducible on screen.
- **Cannot copy debugging prompt**: Ensure browser clipboard permissions are granted. Try again or manually select and copy the text from the page.

### Chrome Extension Issues

- **Extension icon doesn't appear**: Ensure extension is installed and enabled in `chrome://extensions`. Reload the page and check **Developer mode** is on.
- **Extension shows "ARM" but recording doesn't capture interactions**: Verify extension has access to the page (not a protected/privileged page like `chrome://` or `about:`). Reload extension and try again.
- **Extension stopped working after browser update**: Reload the extension in `chrome://extensions` (click the reload icon on the extension card).
- **Cannot load unpacked extension**: Verify you selected the `chrome-extension/` folder (not a parent folder). Ensure Developer mode is enabled in `chrome://extensions`.

## Tech Stack

**Frontend**
- React 19.2.0 with TypeScript
- Vite 7.2.4
- Tailwind CSS 4.1.18
- React Router DOM 7.13.0

**Core Libraries**
- `@mlc-ai/web-llm` for local LLM inference (AI narration scripts, AI Assistant Chat)
- `@ffmpeg/ffmpeg` and `@ffmpeg/util` for video rendering and screen recording composition
- `pdfjs-dist` for PDF rendering and extraction
- `kokoro-js` for text-to-speech
- `@dnd-kit` for drag-and-drop UI

**Browser Extensions**
- Chrome Extension (JavaScript) - MessagePort communication for DOM-level interaction telemetry
- Background service worker for recording state management
- Content script injection for cursor and event capture

**Backend (Dev Server)**
- Express.js 5.2.1
- TypeScript

**AI & Analysis**
- WebGPU for GPU acceleration of all local models
- Google Gemini API for video analysis and bug report generation (optional, requires API key)

## Notes

- AI workflows can run locally in-browser; model downloads are cached after first use.
- First-time setup can take several minutes based on network speed and model size.
- Rendering and analysis performance depend on available CPU/GPU/memory.
- Screen recording with auto zoom works on all major browsers; Chrome extension provides enhanced DOM telemetry for browser tabs.
- AI Assistant Chat requires WebGPU; fall back to Gemini API for AI narration generation if unavailable.
- Bug Reporter and Video Analysis workflows require configured Gemini API key for AI processing.
- All user data stays local in the browser unless explicitly using cloud APIs (Gemini, OpenAI-compatible providers).

## Support

Report issues at: https://github.com/IslandApps/Origami-AI/issues

When reporting, include:
- Browser and version
- OS
- Node version (`node -v`)
- Reproduction steps
- Relevant console logs

## Credits

- WebLLM: https://github.com/mlc-ai/web-llm
- Kokoro.js: https://github.com/Kokoro-js
- ffmpeg.wasm: https://github.com/ffmpegwasm/ffmpeg.wasm
