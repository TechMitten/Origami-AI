# Troubleshooting Guide

## Common Issues

### WebGPU & Browser Issues

#### WebGPU Not Detected

**Symptoms:**
- Page shows "WebGPU not supported" message
- Cannot use local AI features or AI Assistant Chat

**Solutions:**
1. Enable hardware acceleration in browser settings
2. Update GPU drivers to latest version
3. Verify your browser supports WebGPU:
   - Chrome/Edge 113+
   - Firefox Nightly (enable `dom.webgpu.enabled` in `about:config`)
   - Safari 18+ (macOS Sonoma+)
4. Check GPU status in browser:
   - Chrome: `chrome://gpu` (look for "WebGPU: Hardware accelerated")
   - Edge: `edge://gpu`
5. Restart browser and refresh the page
6. Try a different browser if issue persists

#### Browser Compatibility & WebGPU Fallback

If your browser doesn't support WebGPU:
- You can still connect custom OpenAI-compatible API providers (Settings → API) for narration script drafting, OCR, slide generation, Shorts scripts, and AI Assistant chat
- You can perform screen recording and manual video editing
- You cannot run local WebLLM models directly on your device without WebGPU support

### Development & Setup Issues

#### Dev Server Won't Start

**Error:** `EADDRINUSE: address already in use :::3000`

**Solutions:**
```bash
# Kill the process using port 3000
npm run stop

# Or manually:
# Windows: taskkill /pid <PID> /f (or npx kill-port 3000)
# Mac/Linux: kill -9 <PID> (or npx kill-port 3000)

# Then restart
npm run dev
```

#### Node Version Mismatch

**Symptoms:** Errors during install or server startup about Node.js version.

**Solutions:**
1. Check Node.js version: `node -v` (Origami AI requires Node.js ≥ 20.19.0 / ≥ 22.0.0)
2. Use `nvm` or your version manager:
   ```bash
   nvm install 22
   nvm use 22
   ```

#### FFmpeg.wasm or SharedArrayBuffer Errors

**Symptoms:**
- "SharedArrayBuffer is not defined" errors
- FFmpeg.wasm initialization fails
- Video rendering doesn't start

**Cause:** Opening `index.html` directly or bypassing the dev server / proxy headers.

**Solutions:**
1. **Always** run the dev server: `npm run dev` (or `npm run pages:dev` for Cloudflare Pages)
2. Do NOT open static build files directly using `file://` protocol
3. Navigate to `http://localhost:3000` after server starts
4. Verify COOP/COEP headers are present in network responses

#### COOP/COEP Header Warnings

**Warning:** Missing `Cross-Origin-Opener-Policy` or `Cross-Origin-Embedder-Policy` headers

**Solutions:**
1. Ensure dev server is running: `npm run dev`
2. Check headers in Network tab of DevTools:
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Cross-Origin-Embedder-Policy: credentialless`
3. If headers are missing, restart dev server
4. Clear browser cache and hard refresh (Ctrl+Shift+R / Cmd+Shift+R)

#### Production Build Issues

**Symptoms:**
- Errors after running `npm run build`
- Video rendering fails in production
- Features work in dev but not after build

**Solutions:**
```bash
# Clean rebuild
rm -rf dist node_modules
npm install
npm run build

# Test production build locally
npm run preview

# Then access http://localhost:4173
```

### AI & Model Issues

#### Model Download Fails

**Symptoms:**
- Model download stops or hangs
- "Failed to fetch model" error
- Download percentage stuck at 0%

**Causes:**
- Internet connection dropped
- Browser storage quota exceeded
- Cache corruption in CacheStorage / IndexedDB

**Solutions:**
1. Verify stable internet connection
2. Clear browser cache and site data:
   - Chrome: Settings → Privacy → Clear browsing data → check "Cached images and files" and "Cookies and other site data"
   - Or open DevTools (F12) → Application → Storage → "Clear site data"
3. Free up disk space (need 50GB+ free for caching multiple large models)
4. Retry model download
5. Try a different/smaller model (e.g. Llama 3.2 1B or Gemma 2 2B)
6. Use remote OpenAI-compatible API instead of local models

#### "Out of Memory" During AI Generation

**Symptoms:**
- GPU crashes during inference
- "Device lost" or OOM error
- Browser tab becomes unresponsive

**Solutions:**
1. **Reduce model size** - Use smaller models:
   - Instead of Llama 3.2 3B, use Llama 3.2 1B or Qwen 3 0.6B / 1.7B
   - Instead of Phi 3.5 Vision, use Gemma 2 2B for pure text
2. **Close background apps** - Free up system RAM and VRAM
3. **Use F32 variant** - If F16 causes hardware driver crashes
4. **Reduce batch size** - Process fewer slides at once
5. **Switch to remote API** - Use custom OpenAI/Gemini endpoint in Settings → API
6. **Restart browser** - Clear GPU memory

#### WebLLM Model Selection

**Issue:** Cannot find or load desired model

**Solutions:**
1. Check internet connection (models must download on first use)
2. In Settings → WebLLM, check precision filter (`All`, `f16`, `f32`) and capability filter (`All`, `Vision`, `Text`)
3. Check available disk space for model cache
4. Verify VRAM requirement:
   - F16 models use ~half the VRAM of F32 variants
   - Models requiring 4GB+ VRAM (e.g. 7B/8B/9B models) may fail on integrated GPUs; choose 1B–3B models instead
5. WebLLM models load on demand to preserve tab stability

### TTS (Text-to-Speech) Issues

#### TTS Generation Takes Forever

**Symptoms:**
- TTS generation stuck at 0% or very low percentage
- Takes >10 minutes to generate audio for a few slides

**Solutions:**
1. Check internet connection stability during initial voice model download
2. Clear browser cache and site data
3. Try different TTS quantization:
   - Switch from `q8` (high quality) to `q4` (fast) in Settings → TTS Model
4. Reduce slide batch size - generate fewer slides at once
5. Check if another background download is active (downloads run sequentially: TTS → FFmpeg → WebLLM)

#### Audio Quality Issues

**Symptoms:**
- Audio sounds garbled or distorted
- Audio levels are too quiet or too loud

**Solutions:**
1. Verify TTS quantization in Settings → TTS Model:
   - `q8` = higher quality (slightly larger download)
   - `q4` = faster (acceptable quality)
2. Check "Disable Audio Normalization" setting in Settings → TTS Model if audio dynamic range sounds unnatural
3. Try different voice in Settings → General / Slide Editor:
   - Voices like `af_heart`, `af_bella`, `am_adam`, `am_michael` offer different pitch and styles
4. Regenerate audio after changing settings

#### No Audio Playback

**Symptoms:**
- Generated audio doesn't play
- Speaker icon muted but can't unmute
- Volume is at 0

**Solutions:**
1. Check system volume is not muted
2. Check browser tab volume / media permissions
3. Check per-slide audio volume in Slide Editor / Audio Mixing settings
4. Regenerate TTS audio for the slide
5. Try in incognito mode (check if browser extensions block audio autoplay)
6. Check browser's site data permissions for audio playback

### Video Rendering Issues

#### Video Rendering Fails or Is Very Slow

**Symptoms:**
- Render process stuck at 0%
- Rendering takes hours for short video
- Memory usage climbs continuously

**Causes:**
- High resolution export (1080p) on limited GPU/CPU hardware
- Large project size or numerous complex transitions
- FFmpeg.wasm memory consumption

**Solutions:**
1. **Reduce resolution** - Render at 720p instead of 1080p
2. **Reduce project complexity**:
   - Split long projects into smaller segments
   - Simplify slide transitions
3. **Use Docker for rendering** - Better resource isolation:
   ```bash
   docker compose up --build
   ```
4. **Close background applications** - Free up system CPU and memory
5. **Restart browser** - Clear memory leaks before rendering long videos
6. **Increase virtual memory** (Windows: System Properties → Advanced → Performance → Virtual memory)

#### Audio/Video Sync Issues

**Symptoms:**
- Audio and video are out of sync
- Narration doesn't match what's on screen
- Video ends before narration finishes

**Solutions:**
1. Check per-slide post-audio delay:
   - Settings → General → Post-Audio Delay (or per-slide in Slide Editor)
   - Increase delay if narration cuts off too quickly
2. Verify audio was generated completely for all slides
3. Re-export project or test in Preview mode before final rendering

#### Video Export File Issues

**Symptoms:**
- Export fails with no error message
- MP4 file is 0 bytes or corrupted
- Cannot open exported video

**Solutions:**
1. Verify sufficient free disk space (>2GB)
2. Check file in VLC or standard video player (some basic players struggle with certain WebCodecs mux rates)
3. Re-render with 720p resolution
4. Clear browser cache and reload app
5. Check browser console (F12) for detailed FFmpeg error logs

### Shorts Generator & Pollinations Issues

#### Shorts Visual Generation Fails or Hangs

**Symptoms:**
- Image or video generation in Shorts storyboard fails
- Progress spinner spins indefinitely on scene generation
- Error: "Failed to generate visual" or "Rate limit exceeded"

**Causes:**
- Pollinations connection expired or quota exceeded
- Server proxy missing `POLLINATIONS_API_KEY` (when no user key is connected)
- Model rate limits on upstream provider

**Solutions:**
1. **Use Free Model**: Select `free` (Free slow model) in model dropdown if you do not have an API key or server key
2. **Connect Pollinations Account**:
   - Open Settings → API → Pollinations Account
   - Click "Connect with Pollinations" to sign in and grant token access
   - If expired, click "Reconnect"
3. **Switch Model**:
   - For images: Try `flux`, `zimage`, `nanobanana`, or `krea`
   - For video clips: Try `wan-fast` or `seedance-2.0-fast`
4. **Inspect Console / Network**:
   - Check if `/api/pollinations/image` or `/api/pollinations/video` returned an error code
5. **Retry Individual Scene**:
   - Click the regenerate button on the specific scene card rather than rebuilding the entire project

#### Shorts Video Rendering Fails

**Symptoms:**
- "Shorts render aborted" or encoding error
- Browser tab freezes during canvas compositing
- Captions missing or misaligned

**Solutions:**
1. Verify all scenes have audio or visual assets ready
2. Ensure hardware acceleration is enabled for WebCodecs encoding
3. If using Firefox/older Safari where `VideoEncoder` is unavailable, allow extra time for the fallback MediaRecorder transcode
4. Try disabling captions or switching caption style (Bold Pop, Clean Lower, Karaoke)
5. Reduce scene count or total duration (keep shorts within 15–60 seconds for best performance)

### Screen Recording Issues

#### Screen Recording Won't Start

**Symptoms:**
- Click record but nothing happens
- "Permission denied" error
- Recording starts but no content captured

**Solutions:**
1. **Grant browser permissions**:
   - Allow screen capture permission in browser prompt
   - Check browser settings → Permissions → Screen capture
2. **Check COOP/COEP headers** - Must run dev server
3. **Try different capture source**: Desktop/Window capture instead of tab capture
4. **Reload page** if permission request was denied
5. **Try incognito mode** to test without interference from screen capture extensions

#### Auto-Zoom Not Activating

**Symptoms:**
- Auto-zoom feature enabled but doesn't zoom
- Camera stays at same zoom level
- Idle detection not working

**Solutions:**
1. Verify idle duration setting:
   - Default is 2 seconds (2000ms)
   - Ensure cursor was idle for longer than this
2. Check cursor movement was captured in the slide timeline
3. **Install Chrome Extension** for DOM-level interaction and cursor telemetry:
   - See [chrome-extension/README.md](chrome-extension/README.md)
4. Ensure recording captured actual cursor movement (the fallback in-page tracker captures basic window movements)

#### Chrome Extension Not Capturing Data

**Symptoms:**
- Extension shows "ARM" but no data collected
- Cursor position not tracked
- Interactions not recorded

**Solutions:**
1. Verify extension is installed and enabled:
   - Open `chrome://extensions`
   - Look for "Origami AI" extension
   - Ensure toggle is on (blue)
2. Reload extension by clicking the circular reload icon
3. Ensure "Developer mode" is on in `chrome://extensions`
4. Reload the Origami AI page after extension changes
5. **Use fallback local tracking** if extension is unavailable:
   - App detects basic cursor movement without extension
   - Less precise but functional

#### Tab Recording Captures Black Screen

**Symptoms:**
- Recording starts but video is black/empty
- Tab recording works but shows nothing
- Only audio captured, no video

**Solutions:**
1. Ensure target tab is visible and not minimized
2. Try recording a different application window
3. Try desktop/window capture instead of tab capture
4. Verify tab was actively rendering during recording
5. Check browser hardware acceleration is enabled:
   - Chrome: `chrome://settings/system` → Hardware acceleration toggle
6. Update GPU drivers
7. Try a different Chromium browser if issue persists

### Scene Analysis & Video Alignment Issues

#### "Analyze Video" Fails or Button Unavailable

**Symptoms:**
- Analyze Video button is grayed out or fails immediately
- Upload MP4 but analysis returns an error

**Solutions:**
1. **Configured API Key vs Server Proxy**:
   - In production or local server mode with server keys, requests proxy via `/api/llm/analyze-video`
   - For direct client API calls, configure a Google Gemini endpoint in Settings → API (Base URL: `https://generativelanguage.googleapis.com/v1beta/openai/` and valid API key from [Google AI Studio](https://aistudio.google.com/app/apikey))
2. **Use Supported Format**:
   - Ensure video is MP4 or WebM format
3. **Video Size & Duration**:
   - Keep analysis videos under 2–3 minutes for reliable processing and faster uploads
4. **Check Quota**: Verify your Gemini API quota has not been exceeded

#### Malformed Scene JSON Response

**Symptoms:**
- Analysis completes but shows error about JSON parsing
- Scene Alignment editor won't open

**Note:** Origami AI automatically attempts an LLM self-repair step on malformed responses.

**Solutions:**
1. **Retry analysis** - Auto-repair usually succeeds on retry
2. **Try shorter video** - Simplifies response token generation
3. **Verify video quality** - Clear, stable video yields better scene detection

### AI Assistant Chat Issues

#### Chat Page Shows "WebGPU Not Supported"

**Symptoms:**
- Cannot access local AI Assistant Chat
- Error message about WebGPU requirement

**Solutions:**
1. Check browser supports WebGPU (Chrome/Edge 113+, Firefox Nightly with flag)
2. Enable hardware acceleration in browser settings
3. **Use Cloud LLM Fallback**: In Settings → API, enable "Use for Assistant" to route chat through your OpenAI-compatible API without needing local WebGPU

#### "Device Lost" Error During Chat

**Symptoms:**
- Chat works initially then crashes with "Device lost"
- GPU becomes unresponsive

**Solutions:**
1. Refresh the page immediately
2. Close other browser tabs to free GPU memory
3. Try smaller model (Gemma 2 2B or Llama 3.2 1B)
4. Update GPU drivers
5. Switch to remote API in Settings → API

#### Cannot Attach Images or Videos to Assistant

**Symptoms:**
- File upload button disabled or error on attach
- "File too large" message

**Solutions:**
1. **Check file size**:
   - Images: max 8MB (JPEG, PNG, WEBP)
   - Videos: max 20MB (WebM, MP4)
2. **Model Vision Capability**:
   - When using local WebLLM, ensure a Vision-capable model is loaded (e.g. `Phi-3.5-vision-instruct`) or select "Vision" in Settings → WebLLM filter
   - When using remote API, ensure your configured model supports multimodal vision input (e.g. `gpt-4o`, `gemini-1.5-flash`)

### Project Archives (.origami) Issues

#### Project Export or Import Fails

**Symptoms:**
- Cannot import `.origami` project archive
- Error: "Invalid project archive format"

**Solutions:**
1. Verify the file is an authentic `.origami` ZIP archive created by Origami AI
2. Ensure slide assets (images, audio blobs) are not corrupted
3. Check browser storage quota (large projects with high-resolution slides require available IndexedDB quota)
4. If importing on a different device, ensure sufficient RAM for unzipping large archives

### Bug Reporter Issues

#### Issue Analysis Fails

**Symptoms:**
- "Report Issue" analysis fails
- Cannot generate debugging prompt

**Solutions:**
1. Configure Gemini API key in Settings → API or ensure server proxy has `LLM_API_KEY` set
2. Keep issue screen recordings under 30 seconds for fast analysis
3. Ensure the bug and cursor actions are clearly visible during capture
4. Check browser clipboard permissions if "Copy Prompt" fails (or manually select and copy text using Ctrl+C / Cmd+C)
5. Check if browser incognito mode has different permissions

### Chrome Extension Issues

#### Extension Icon Doesn't Appear

**Symptoms:**
- Extension not visible in toolbar
- Cannot find extension button

**Solutions:**
1. Verify extension is installed:
   - Open `chrome://extensions`
   - Search for "Origami AI"
2. Ensure Developer mode is enabled (top right toggle)
3. Pin extension to toolbar:
   - Click Extensions menu (puzzle icon)
   - Click pin icon next to Origami AI
4. Reload the Origami AI page
5. Restart browser

#### Extension Shows "ARM" But No Data Captured

**Symptoms:**
- Extension icon shows "ARM" (armed)
- Recording works but no cursor/interaction data

**Causes:**
- Page is protected or privileged
- Extension doesn't have permission for page

**Solutions:**
1. **Verify page type**:
   - Chrome Extension cannot access: `chrome://`, `about:`, extensions pages
   - Extension works on regular websites only
2. **Check permissions**:
   - Open `chrome://extensions`
   - Find Origami AI extension
   - Ensure "Allow access to all sites" is enabled
3. **Reload extension**:
   - Click reload icon on extension card
4. **Reload page** and try recording again
5. **Use fallback tracking** if extension unavailable:
   - App detects basic cursor movement without extension

#### Extension Stopped Working After Browser Update

**Symptoms:**
- Extension was working, now doesn't capture data
- Suddenly stopped functioning

**Solutions:**
1. **Reload extension** in `chrome://extensions`:
   - Find Origami AI extension
   - Click the reload icon (circular arrows)
2. Verify extension is still enabled (toggle should be blue)
3. Refresh the Origami AI page
4. Restart browser
5. **Reinstall if still broken**:
   - Open `chrome://extensions`
   - Remove the extension
   - Re-add by loading unpacked from `chrome-extension/` folder

#### Cannot Load Unpacked Extension

**Symptoms:**
- "Load unpacked" button doesn't work
- Error about invalid extension format

**Solutions:**
1. **Select correct folder**:
   - Must select `chrome-extension/` folder from repo
   - NOT the parent `Origami-AI/` folder
   - NOT a subfolder like `chrome-extension/src/`
2. **Verify Developer mode is enabled**:
   - Open `chrome://extensions`
   - Top right toggle should be ON (blue)
3. **Check file structure**:
   - `chrome-extension/` should contain `manifest.json`
   - See [chrome-extension/README.md](chrome-extension/README.md)
4. **Verify manifest.json is valid**:
   - Check for syntax errors
   - Use JSON linter if needed
5. Restart browser and try again

## Performance Optimization

### Improving Video Rendering Speed

1. **Reduce resolution** - 720p faster than 1080p
2. **Decrease project size** - Fewer slides = faster render
3. **Simplify transitions** - Fewer effects = faster processing
4. **Use hardware encoding** if GPU supports (check DevTools)
5. **Run via Docker** for better resource isolation

### Improving AI Response Time

1. **Use smaller models** - Gemma 2 2B faster than Llama 3.2 3B
2. **Reduce input length** - Shorter prompts = faster responses
3. **Use F32 variant** if F16 causes GPU strain
4. **Close background applications** - Free up GPU/CPU
5. **Restart browser** - Clear GPU memory

### Reducing Memory Usage

1. **Don't keep too many browser tabs open**
2. **Clear browser cache regularly**
3. **Use model quantization** (q4 instead of q8)
4. **Process slides in batches** instead of all at once
5. **Close other applications**

## Advanced Troubleshooting

### Checking Browser Console Logs

1. Press `F12` to open Developer Tools
2. Click "Console" tab
3. Look for error messages
4. Share relevant errors when reporting issues

### Checking Network Activity

1. Open DevTools (F12)
2. Click "Network" tab
3. Reproduce the issue
4. Check for failed requests (red)
5. Look for 403/404/500 status codes

### Checking Browser Storage

1. Open DevTools (F12)
2. Click "Application" tab
3. Check IndexedDB and LocalStorage
4. Look for Origami AI data
5. Can manually clear if corrupted

### Enabling Debug Logging

Add debug information:
```javascript
// In browser console (F12)
localStorage.setItem('DEBUG', 'true');
// Then reload page
```

## When to Report Issues

Report issues at: https://github.com/TechMitten/Origami-AI/issues

**Include when reporting:**
- Browser name and version
- Operating system and version
- Node.js version (if running locally)
- Steps to reproduce
- Console error messages
- Screenshots or screen recording of issue
- Expected vs actual behavior

**Before reporting:**
1. Check this troubleshooting guide
2. Try in incognito/private mode
3. Clear browser cache and cookies
4. Update to latest browser version
5. Try on different device if possible
