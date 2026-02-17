# Origami


**Origami** is a high-fidelity automated video generation platform that transforms PDF slides into cinematic narrated content. By leveraging advanced AI for script synthesis, professional Text-to-Speech (TTS), and programmatic video rendering, Origami streamlines the creation of engaging presentations, tutorials, and educational media directly from your static documents.

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
- **AI-Powered Scripting**: Integrated with [WebLLM](https://webllm.mlc-ai.org/) (Local Browser Inference) to transform fragmented slide notes into coherent, professional scripts.
- **High-Quality TTS**: Supports local and cloud-based Text-to-Speech using Kokoro-js.
  - **Local Inference**: Run TTS entirely locally via Dockerized Kokoro FastAPI.
  - **Hybrid Voices**: Create custom voice blends by mixing two models with adjustable weights.
- **Rich Media Support**: Insert MP4 videos and GIFs seamlessly between slides.
- **Programmatic Video Rendering**: Frame-perfect assembly powered by high-performance canvas rendering.
- **Smart Audio Engineering**:
  - **Auto-Ducking**: Background music volume automatically lowers during voiceovers.
  - **Normalization**: Final render is automatically normalized to YouTube standards (-14 LUFS).
- **Interactive Slide Editor**: Drag-and-drop reordering, real-time preview, and batch script updates.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/) (Required for local server-side TTS and deployment)

### Installation

1. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server (runs both Vite and the rendering server):
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:3000`.

### Deployment (Docker)

To deploy this application using Docker, build the image locally from the source.

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

- **AI Scripting**: Click the **AI Fix Script** button (Sparkles icon) to rewrite raw slide text into a natural spoken script.
- **Manual Editing**: Edit scripts directly. **Highlight** specific text sections to generate/regenerate audio for just that part.
- **Generate Output**: Click the **Generate TTS** button (Speech icon) to create voiceovers.
- **Preview**: Click the **Play** button to hear the result or click the slide thumbnail to expand the visual preview.

### 4. Render

Click the **Download Video** button. The application will:

1. Pre-process the slide configuration in your browser.
2. Render frames in parallel using your browser's resources.
3. Process the final video and audio mix using client-side FFmpeg WASM.
4. Normalize the audio to -14 LUFS and download the resulting MP4.

## Configuration

Open the **Settings Modal** (Gear Icon) to customize the application:

### 1. API Keys (Script Generation)

Configure the AI model used for script refinement ("AI Fix Script").

- **WebLLM (Default)**: Runs entirely in your browser using WebGPU. No API key required, completely free, and keeps your data private. Models are downloaded once and cached locally for fast inference.

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
- **AI**: WebLLM (Local Browser Inference)
- **TTS**: Kokoro (FastAPI / Web Worker)
- **Backend**: Express.js (serving as a rendering orchestration layer)
- **Utilities**: Lucide React (icons), dnd-kit (drag & drop), pdfjs-dist (PDF processing)

## Project Structure

- `src/components/`: React UI components (Slide Editor, Modals, Uploaders).
- `src/services/`: Core logic for AI, TTS, PDF processing, and local storage.
- `server.ts`: Express server handling static file serving and SPA routing.

## Roadmap & TODO

- [ ] **YouTube Metadata Generator**: Automatically generate optimized titles and descriptions.
- [ ] **Voiceover Recording**: Support for recording custom voiceovers directly within the app using a microphone.
- [ ] **Header Layout Optimization**: Refactor and organize the application header for better aesthetics and usability.

## Acknowledgements

This project is made possible by the following incredible open-source libraries and projects:

- **[FFmpeg.wasm](https://ffmpegwasm.netlify.app/)**: Enabling frame-perfect video assembly directly in the browser.
- **[WebLLM](https://webllm.mlc-ai.org/)**: Bringing high-performance local LLM inference to the web.
- **Kokoro-js**: Providing high-quality, local Text-to-Speech capabilities.
- **[Hugging Face Transformers](https://huggingface.co/docs/transformers.js)**: Powering state-of-the-art machine learning in the browser.
- **[PDF.js](https://mozilla.github.io/pdf.js/)**: The standard for parsing and rendering PDF documents.
- **[Lucide React](https://lucide.dev/)**: Beautifully crafted open-source icons.
- **[dnd-kit](https://dndkit.com/)**: A modern, lightweight toolkit for drag-and-drop interfaces.
- **[Dokploy](https://dokploy.com/)**: The open-source platform used for seamless self-hosting and deployment.

## License

MIT
