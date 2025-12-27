# PDF2Tutorial

A powerful, automated video generation platform designed to create educational tech tutorials from PDF slides. This project leverages AI for script refinement, high-quality Text-to-Speech (TTS), and programmatic video rendering.

## Features

- **PDF to Presentation**: Upload PDF slides and automatically extract them into a sequence of video scenes.
- **AI-Powered Scripting**: Integrated with Google Gemini AI to transform fragmented slide notes into coherent, professional scripts.
- **High-Quality TTS**: Supports local and cloud-based Text-to-Speech using [Kokoro-js](https://github.com/m-bain/kokoro-js) with customizable voices and quantization.
- **Rich Media Support**: Insert MP4 videos and GIFs seamlessly between slides.
- **Programmatic Video Rendering**: Built on [Remotion](https://www.remotion.dev/), allowing for precise, frame-perfect video assembly and export.
- **Interactive Slide Editor**: Drag-and-drop slide reordering, real-time audio generation, and script editing.
- **Background Music**: Add and mix background tracks with custom volume controls.

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

## Configuration

Open the **Settings Modal** (Gear Icon) in the application to configure:

- **API Keys**: Add your [Google AI Studio](https://aistudio.google.com/) API Key for script refinement.
- **TTS Settings**: Choose between internal Web Worker TTS or a local Dockerized Kokoro FastAPI instance.
- **Audio Defaults**: Set default voice models and quantization levels (q4/q8).

## Project Structure

- `src/video/`: Remotion compositions and video components.
- `src/components/`: React UI components (Slide Editor, Modals, Uploaders).
- `src/services/`: Core logic for AI, TTS, PDF processing, and local storage.
- `server.ts`: Express server handling the `@remotion/renderer` logic.

## Rendering

Videos are rendered server-side using Remotion. When you click "Download Video", the sequence is bundled and rendered via an Express endpoint, then served back as an MP4 file.

## License

MIT
