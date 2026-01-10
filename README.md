# PDF2Tutorial

A powerful, automated video generation platform designed to create educational tech tutorials from PDF slides. This project leverages AI for script refinement, high-quality Text-to-Speech (TTS), and programmatic video rendering.

## Features

- **PDF to Presentation**: Upload PDF slides and automatically extract them into a sequence of video scenes.
- **AI-Powered Scripting**: Integrated with Google Gemini AI to transform fragmented slide notes into coherent, professional scripts.
- **High-Quality TTS**: Supports local and cloud-based Text-to-Speech using [Kokoro-js](https://github.com/m-bain/kokoro-js).
  - **Local Inference**: Run TTS entirely locally via Dockerized Kokoro FastAPI.
  - **Hybrid Voices**: Create custom voice blends by mixing two models with adjustable weights.
- **Rich Media Support**: Insert MP4 videos and GIFs seamlessly between slides.
- **Programmatic Video Rendering**: Built on [Remotion](https://www.remotion.dev/) for frame-perfect assembly.
- **Smart Audio Engineering**:
  - **Auto-Ducking**: Background music volume automatically lowers during voiceovers.
  - **Normalization**: Final render is automatically normalized to YouTube standards (-14 LUFS).
- **Interactive Slide Editor**: Drag-and-drop reordering, real-time preview, and batch script updates.

## Usage

### 1. Upload & Analyze

Drag and drop your presentation PDF into the main upload area. The application will process text from each page to create initial slides.

### 2. Configure & Enhance

Scroll down to the **Configure Slides** panel to manage your project globally:

- **Global Settings**: Set a global voice (or create a custom **Hybrid Voice**), adjust post-slide delays, or run batch operations like "Find & Replace".
- **Media Assets**: Click **Insert Video** to add MP4 clips or GIFs between slides.
- **Audio Mixing**: Upload custom background music or select from the library (e.g., "Modern EDM"). Use the sliders to mix volume levels.

### 3. Crafting the Narrative

In the **Slide Editor** grid:

- **AI Scripting**: Click the **AI Fix Script** button (Sparkles icon) to have Gemini rewrite raw slide text into a natural spoken script.
- **Manual Editing**: Edit scripts directly. **Highlight** specific text sections to generate/regenerate audio for just that part.
- **Generate Output**: Click the **Generate TTS** button (Speech icon) to create voiceovers.
- **Preview**: Click the **Play** button to hear the result or click the slide thumbnail to expand the visual preview.

### 4. Render

Click the **Download Video** button. The server will:

1. Bundle the Remotion composition.
2. Render frames in parallel using available CPU cores.
3. Normalize the final audio mix to -14 LUFS.
4. Download the resulting MP4.

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

## Roadmap & TODO

- [ ] **YouTube Metadata Generator**: Automatically generate optimized titles and descriptions using Gemini.
- [ ] **Thumbnail Generator**: Create custom YouTube thumbnails based on slide content.
- [ ] **Voiceover Recording**: Support for recording custom voiceovers directly within the app using a microphone.
- [ ] **Header Layout Optimization**: Refactor and organize the application header for better aesthetics and usability.

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS (v4)
- **Video Engine**: Remotion (v4)
- **AI**: Google Gemini API (gemini-2.0-flash-lite)
- **TTS**: Kokoro (FastAPI / Web Worker)
- **Backend**: Express.js (serving as a rendering orchestration layer)
- **Utilities**: Lucide React (icons), dnd-kit (drag & drop), pdfjs-dist (PDF processing)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [FFmpeg](https://ffmpeg.org/) (required by Remotion for rendering)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/techcow2/pdf2tutorial.git
   cd pdf2tutorial
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server (runs both Vite and the rendering server):
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5173`.

## Project Structure

- `src/video/`: Remotion compositions and video components.
- `src/components/`: React UI components (Slide Editor, Modals, Uploaders).
- `src/services/`: Core logic for AI, TTS, PDF processing, and local storage.
- `server.ts`: Express server handling the `@remotion/renderer` logic.

## Rendering

Videos are rendered server-side using Remotion. When you click "Download Video", the sequence is bundled and rendered via an Express endpoint, then served back as an MP4 file.

## License

MIT
