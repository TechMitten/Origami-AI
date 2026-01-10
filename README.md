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

The application will be available at `http://localhost:5173`.

## Configuration

Open the **Settings Modal** (Gear Icon) in the application to configure:

- **API Keys**: Add your [Google AI Studio](https://aistudio.google.com/) API Key for script refinement.
- **TTS Settings**: Choose between internal Web Worker TTS or a local Dockerized Kokoro FastAPI instance.
- **Audio Defaults**: Set default voice models and quantization levels (q4/q8).

## Usage

### 1. Upload & Analyze

Drag and drop your presentation PDF into the main upload area. The application will process the file, extracting each page as a distinct slide and readying it for editing.

### 2. Crafting the Narrative

- **Script Generation**: Use the "Magic Wand" icon on any slide to have Gemini automatically generate a spoken script based on the visual content.
- **Manual Editing**: Fine-tune the generated script or write your own text directly in the slide editor.
- **Text-to-Speech**: Click the "Speaker" icon to generate audio for your script using the configured high-quality TTS engine.

### 3. Slide Management

- **Reorder**: Drag and drop slides to rearrange the flow of your video.
- **Enhance**: Insert MP4 videos or GIFs between slides to add dynamic content or breaks.
- **Preview**: Use the integrated player to watch a real-time preview of your tutorial.

### 4. Final Polish & Export

- **Audio Mix**: Add background music and adjust the volume levels to balance with the voiceover.
- **Render**: Click the **Download Video** button. The server will render the frame-perfect video using Remotion and trigger a download of the final MP4 file.

## Project Structure

- `src/video/`: Remotion compositions and video components.
- `src/components/`: React UI components (Slide Editor, Modals, Uploaders).
- `src/services/`: Core logic for AI, TTS, PDF processing, and local storage.
- `server.ts`: Express server handling the `@remotion/renderer` logic.

## Rendering

Videos are rendered server-side using Remotion. When you click "Download Video", the sequence is bundled and rendered via an Express endpoint, then served back as an MP4 file.

## License

MIT
