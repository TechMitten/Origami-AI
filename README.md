# Origami AI

![License](https://img.shields.io/github/license/techcow2/Origami-AI?style=flat-square)
![Issues](https://img.shields.io/github/issues/techcow2/Origami-AI?style=flat-square)
![Stars](https://img.shields.io/github/stars/techcow2/Origami-AI?style=flat-square)
![Forks](https://img.shields.io/github/forks/techcow2/Origami-AI?style=flat-square)

A powerful, automated video generation platform designed to create educational tech tutorials from PDF slides. This project leverages AI for script refinement, high-quality Text-to-Speech (TTS), and programmatic video rendering.

## Table of Contents

- [Features](#features)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Configuration](#configuration)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Roadmap & TODO](#roadmap--todo)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## Features

- **PDF to Presentation**: Upload PDF slides and automatically extract them into a sequence of video scenes.
- **AI-Powered Scripting**: Integrated with Google Gemini AI and [WebLLM](https://webllm.mlc-ai.org/) (Local Browser Inference) to transform fragmented slide notes into coherent, professional scripts.
- **High-Quality TTS**: Supports local and cloud-based Text-to-Speech using [Kokoro-js](https://github.com/m-bain/kokoro-js).
  - **Local Inference**: Run TTS entirely locally via Dockerized Kokoro FastAPI.
  - **Hybrid Voices**: Create custom voice blends by mixing two models with adjustable weights.
- **Rich Media Support**: Insert MP4 videos and GIFs seamlessly between slides.
- **Programmatic Video Rendering**: Built on [Remotion](https://www.remotion.dev/) for frame-perfect assembly.
- **Smart Audio Engineering**:
  - **Auto-Ducking**: Background music volume automatically lowers during voiceovers.
  - **Normalization**: Final render is automatically normalized to YouTube standards (-14 LUFS).
- **Interactive Slide Editor**: Drag-and-drop reordering, real-time preview, and batch script updates.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/techcow2/Origami-AI.git
   cd Origami-AI
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server (runs both Vite and the rendering server):
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:3000`.

### Deployment (Docker)

To deploy this application using Docker, you **must first clone the repository**, as the image is built locally from the source.

1. Clone the repository:
   ```bash
   git clone https://github.com/techcow2/Origami-AI.git
   cd Origami-AI
   ```

#### Using Docker Compose (Recommended)

A `docker-compose.yml` file is provided in the root directory. To start the application, run:

```bash
docker-compose up -d
```

Example `docker-compose.yml`:

```yaml
services:
  origami-ai:
    build: .
    container_name: origami-ai
    ports:
      - "3000:3000"
    restart: unless-stopped
    environment:
      - PORT=3000
      - NODE_ENV=production
```

#### Using Docker CLI

1. Build the image:

   ```bash
   docker build -t origami-ai .
   ```

2. Run the container:
   ```bash
   docker run -d -p 3000:3000 --name origami-ai origami-ai
   ```

The application will be available at `http://localhost:3000`.

## Usage

### 1. Upload & Analyze

Drag and drop your presentation PDF into the main upload area. The application will process text from each page to create initial slides.

### 2. Configure & Enhance

Scroll down to the **Configure Slides** panel to manage your project globally:

- **Global Settings**: Set a global voice (or create a custom **Hybrid Voice**), adjust post-slide delays, or run batch operations like "Find & Replace".
- **Media Assets**: Click **Insert Video** to add MP4 clips or GIFs between slides.
- **Audio Mixing**: Upload custom background music or select from the library (e.g., "Modern EDM"). Use the sliders to mix volume levels.

### 3. Creating the Narrative

In the **Slide Editor** grid:

- **AI Scripting**: Click the **AI Fix Script** button (Sparkles icon) to have Gemini rewrite raw slide text into a natural spoken script.
- **Manual Editing**: Edit scripts directly. **Highlight** specific text sections to generate/regenerate audio for just that part.
- **Generate Output**: Click the **Generate TTS** button (Speech icon) to create voiceovers.
- **Preview**: Click the **Play** button to hear the result or click the slide thumbnail to expand the visual preview.

### 4. Render

Click the **Download Video** button. The application will:

1. Bundle the Remotion composition in your browser.
2. Render frames in parallel using your browser's resources.
3. Process the final video and audio mix using client-side FFmpeg WASM.
4. Normalize the audio to -14 LUFS and download the resulting MP4.

## Configuration

Open the **Settings Modal** (Gear Icon) to customize the application:

### 1. API Keys (Script Generation)

Configure the AI model used for script refinement ("AI Fix Script").

- **Google Gemini**: Built-in and recommended. Requires a [Google AI Studio](https://aistudio.google.com/) API Key.
- **Custom/OpenAI-Compatible**: Point to any OpenAI-compatible endpoint (e.g., LocalAI, Ollama, vLLM).
  - **Base URL**: Enter your provider's URL (e.g., `http://localhost:11434/v1`).
  - **Model Name**: Specify the model ID (e.g., `llama-3`).
  - **API Key**: Enter if required by your provider.

### 2. Text-to-Speech (TTS)

- **Engine**: Choose between the internal Web Worker (client-side) or a local Dockerized Kokoro instance (faster/server-side).
- **Audio Defaults**: Set default voice models and quantization levels (q4/q8).

### 3. Background Music Library

You can build your own library of background music tracks that will be available in the dropdown menus:

1.  Navigate to the `src/assets/music/` directory.
2.  Paste your `.mp3` files here.
3.  The application will **automatically detect** these files and list them in the UI (e.g., `my_cool_track.mp3` becomes "My Cool Track").

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS (v4)
- **Video Engine**: FFmpeg WASM (Client-side)
- **AI**: [Google Gemini API](https://ai.google.dev/) & [WebLLM](https://webllm.mlc-ai.org/) (Local Browser Inference)
- **TTS**: Kokoro (FastAPI / Web Worker)
- **Backend**: Express.js (serving as a rendering orchestration layer)
- **Utilities**: Lucide React (icons), dnd-kit (drag & drop), pdfjs-dist (PDF processing)

## Project Structure

- `src/components/`: React UI components (Slide Editor, Modals, Uploaders).
- `src/services/`: Core logic for AI, TTS, PDF processing, and local storage.
- `server.ts`: Express server handling static file serving and SPA routing.

## Roadmap & TODO

- [ ] **YouTube Metadata Generator**: Automatically generate optimized titles and descriptions using Gemini.
- [ ] **Thumbnail Generator**: Create custom YouTube thumbnails based on slide content.
- [ ] **Voiceover Recording**: Support for recording custom voiceovers directly within the app using a microphone.
- [ ] **Header Layout Optimization**: Refactor and organize the application header for better aesthetics and usability.

## Acknowledgements

This project is made possible by the following incredible open-source libraries and projects:

- **[Remotion](https://www.remotion.dev/)**: The core engine for programmatic video rendering.
- **[FFmpeg.wasm](https://ffmpegwasm.netlify.app/)**: Enabling frame-perfect video assembly directly in the browser.
- **[WebLLM](https://webllm.mlc-ai.org/)**: Bringing high-performance local LLM inference to the web.
- **[Kokoro-js](https://github.com/m-bain/kokoro-js)**: Providing high-quality, local Text-to-Speech capabilities.
- **[Hugging Face Transformers](https://huggingface.co/docs/transformers.js)**: Powering state-of-the-art machine learning in the browser.
- **[PDF.js](https://mozilla.github.io/pdf.js/)**: The standard for parsing and rendering PDF documents.
- **[Lucide React](https://lucide.dev/)**: Beautifully crafted open-source icons.
- **[dnd-kit](https://dndkit.com/)**: A modern, lightweight toolkit for drag-and-drop interfaces.
- **[Google Antigravity](https://antigravity.google)**: The AI-powered IDE used to build and refine this project.

## License

[MIT](https://github.com/techcow2/Origami-AI/blob/main/LICENSE)
