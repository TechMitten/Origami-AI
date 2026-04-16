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
   - Firefox Nightly (enable `dom.webgpu.enabled`)
   - Safari 18+ (macOS Sonoma)
4. Restart browser and refresh the page
5. Try a different browser if issue persists

#### Browser Compatibility Issues

If your browser doesn't support WebGPU, you can still:
- Use remote API providers (Gemini, OpenAI, etc.) for narration generation
- Perform screen recording and manual video editing
- Cannot use: AI Assistant Chat, local LLM inference, WebGPU-accelerated features

### Development & Setup Issues

#### Dev Server Won't Start

**Error:** `EADDRINUSE: address already in use :::3000`

**Solutions:**
```bash
# Kill the process using port 3000
npm run stop

# Or manually:
# Windows: taskkill /pid <PID> /f
# Mac/Linux: kill -9 <PID>

# Then restart
npm run dev
```

#### FFmpeg.wasm or SharedArrayBuffer Errors

**Symptoms:**
- "SharedArrayBuffer is not defined" errors
- FFmpeg.wasm initialization fails
- Video rendering doesn't start

**Cause:** Opening `index.html` directly without the dev server

**Solutions:**
1. **Always** run the dev server: `npm run dev`
2. Do NOT open the file directly in the browser
3. Navigate to `http://localhost:3000` after server starts
4. Verify COOP/COEP headers are present in network responses

#### COOP/COEP Header Warnings

**Warning:** Missing `Cross-Origin-Opener-Policy` or `Cross-Origin-Embedder-Policy` headers

**Solutions:**
1. Ensure dev server is running: `npm run dev`
2. Check headers in Network tab of DevTools:
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Cross-Origin-Embedder-Policy: credentialless`
3. If headers missing, restart dev server
4. Clear browser cache and hard refresh (Ctrl+Shift+R)

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
- Cache corruption

**Solutions:**
1. Verify stable internet connection
2. Clear browser cache and site data:
   - Chrome: Settings → Privacy → Clear browsing data → check "Cookies and other site data"
   - Check IndexedDB storage in DevTools
3. Free up disk space (need 50GB+)
4. Retry model download
5. Try a different/smaller model
6. Use remote API instead of local models

#### "Out of Memory" During AI Generation

**Symptoms:**
- GPU crashes during inference
- "Device lost" or OOM error
- Browser tab becomes unresponsive

**Solutions:**
1. **Reduce model size** - Use smaller models:
   - Instead of Llama 3.2 3B, use Llama 3.2 1B
   - Instead of Phi 3.5, use Gemma 2 2B
2. **Close background apps** - Free up system RAM
3. **Use F32 variant** - If F16 causes issues (uses slightly more memory but more stable)
4. **Reduce batch size** - Process fewer slides at once
5. **Switch to remote API** - Use OpenAI or Gemini instead
6. **Restart browser** - Clear GPU memory

#### WebLLM Model Selection

**Issue:** Cannot find or load desired model

**Solutions:**
1. Check internet connection (models must download first time)
2. Verify model is available for your precision setting (f16 vs f32)
3. Check available disk space for model cache
4. Some models require 5GB+ VRAM - check specification:
   - F16 models use ~half the VRAM of F32 variants
   - If GPU runs out of memory, switch to smaller model
5. Clear browser cache if model won't download

### TTS (Text-to-Speech) Issues

#### TTS Generation Takes Forever

**Symptoms:**
- TTS generation stuck at 0% or very low percentage
- Takes >10 minutes to generate audio for a few slides

**Solutions:**
1. Check internet connection stability
2. Clear browser cache
3. Try different TTS quantization:
   - Switch from q8 (high quality) to q4 (fast)
   - Settings → TTS Model → q4
4. Reduce slide batch size - generate fewer slides at once
5. Use remote TTS API instead of Kokoro.js

#### Audio Quality Issues

**Symptoms:**
- Audio sounds garbled or distorted
- Audio levels are too quiet or too loud

**Solutions:**
1. Verify TTS quantization is set correctly:
   - q8 = higher quality (slower)
   - q4 = faster (acceptable quality)
2. Check audio normalization setting in Settings
3. Try different voice:
   - Some voices may sound better for your content
   - Settings → Voice Settings → select different voice
4. Regenerate audio after changing settings

#### No Audio Playback

**Symptoms:**
- Generated audio doesn't play
- Speaker icon muted but can't unmute
- Volume is at 0

**Solutions:**
1. Check system volume is not muted
2. Check browser volume control
3. Check per-slide volume in Audio Mixing tab
4. Regenerate TTS audio
5. Try in incognito mode (check if extension is interfering)
6. Check browser's site data permissions for audio playback

### Video Rendering Issues

#### Video Rendering Fails or Is Very Slow

**Symptoms:**
- Render process stuck at 0%
- Rendering takes hours for short video
- Memory usage climbs continuously

**Causes:**
- Large project size or high resolution
- Insufficient GPU memory
- FFmpeg.wasm memory issues

**Solutions:**
1. **Reduce resolution** - Render at 720p instead of 1080p
2. **Reduce project complexity**:
   - Remove unused slides
   - Simplify transitions
   - Reduce number of effects
3. **Use Docker for rendering** - Better resource isolation:
   ```bash
   docker compose up --build
   ```
4. **Close background applications** - Free up system resources
5. **Restart browser** - Clear memory leaks
6. **Increase swap/virtual memory** (Windows):
   - Settings → System → About → Advanced system settings → Performance → Virtual memory

#### Audio/Video Sync Issues

**Symptoms:**
- Audio and video are out of sync
- Narration doesn't match what's on screen
- Video ends before narration finishes

**Solutions:**
1. Verify audio duration in Voice Settings tab
2. Check per-slide delay:
   - Settings → General → Post-Audio Delay
   - Increase if narration extends beyond video
3. Regenerate all audio:
   - Slide Editor → Batch Tools → Generate All Audio
4. Rebuild project:
   ```bash
   npm run build && npm run preview
   ```
5. Clear browser cache and try again

#### Video Export File Issues

**Symptoms:**
- Export fails with no error message
- MP4 file is 0 bytes or corrupted
- Cannot open exported video

**Solutions:**
1. Verify sufficient free disk space (>2GB)
2. Check file is actually at expected location
3. Try opening in different video player
4. Re-render with lower resolution
5. Clear browser cache and try again
6. Check browser console for detailed errors

### Screen Recording Issues

#### Screen Recording Won't Start

**Symptoms:**
- Click record but nothing happens
- "Permission denied" error
- Recording starts but no content captured

**Solutions:**
1. **Grant browser permissions**:
   - Browser may ask for screen sharing permission - allow it
   - Check browser settings → Permissions → Screen capture
2. **Check COOP/COEP headers** - Must run dev server
3. **Try different browser** - Some browsers have stricter permissions
4. **Use desktop/window capture** instead of tab capture
5. **Reload page** if permission request was denied
6. **Try incognito mode** to test without extensions

#### Auto-Zoom Not Activating

**Symptoms:**
- Auto-zoom feature enabled but doesn't zoom
- Camera stays at same zoom level
- Idle detection not working

**Solutions:**
1. Verify idle duration setting:
   - Default is 2 seconds (2000ms)
   - Ensure cursor was idle for longer than this
2. Check cursor movement was captured:
   - Review cursor data in the slide timeline
   - If no cursor data, extension may not be capturing
3. **Install Chrome Extension** for better interaction tracking:
   - See [chrome-extension/README.md](chrome-extension/README.md)
4. Ensure recording captured actual cursor movement
5. Check for JavaScript console errors during recording

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
2. **Reload extension**:
   - Click reload icon on the extension card
3. **Check developer mode**:
   - Ensure Developer mode is enabled (top right toggle)
4. Reload the Origami AI page after extension changes
5. **Try regular (non-unpacked) extension** if issues persist:
   - See Chrome Web Store version
6. **Use fallback local tracking** if extension unavailable:
   - App detects cursor movement without extension
   - Less precise but still functional

#### Tab Recording Captures Black Screen

**Symptoms:**
- Recording starts but video is black/empty
- Tab recording works but shows nothing
- Only audio captured, no video

**Solutions:**
1. Ensure target tab is visible and not minimized
2. Try recording a different application
3. Try desktop/window capture instead
4. Verify tab was actively rendering during recording
5. Check browser hardware acceleration is enabled:
   - Chrome Settings → System → Hardware acceleration toggle
6. Update GPU drivers
7. Try different browser or device

### Scene Analysis & Video Alignment Issues

#### "Analyze Video" Button Unavailable

**Symptoms:**
- Analyze Video button is grayed out or missing
- Upload MP4 but can't analyze it

**Causes:**
- Missing Gemini API key
- Not a silent MP4 (has audio track)
- Not supported file type

**Solutions:**
1. **Configure Gemini API** in Settings:
   - Get API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Settings → API → Configure Gemini
2. **Ensure file is silent MP4**:
   - MP4 files with audio tracks are rejected
   - Remove audio track using FFmpeg:
     ```bash
     ffmpeg -i input.mp4 -c:v copy -an output_silent.mp4
     ```
3. **Use MP4 format** - GIF, JPEG not supported for analysis
4. **Check file size** - Very large files may time out
5. **Verify internet connection** for API communication

#### Analyze Video Fails or Takes Too Long

**Symptoms:**
- Analysis stuck in progress
- "Failed to analyze" error
- Takes >5 minutes

**Solutions:**
1. Verify Gemini API key is valid:
   - Test at [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Check internet connection stability
3. Try with shorter video (< 2 minutes)
4. Verify Google Gemini base URL is correct:
   - Should be: `https://generativelanguage.googleapis.com/v1beta/openai/`
5. Check Google quota limits (free tier has limits)
6. Retry - may be temporary API issue

#### Malformed Scene JSON Response

**Symptoms:**
- Analysis completes but shows error about JSON parsing
- Scene Alignment editor won't open

**Note:** Origami AI automatically attempts to repair malformed responses

**Solutions:**
1. **Retry analysis** - Auto-repair usually succeeds on retry
2. **Try shorter video** - May simplify response parsing
3. **Verify video quality** - Clear, stable video better for analysis
4. **Check console logs** for detailed error messages
5. **Contact support** if error persists

### AI Assistant Chat Issues

#### Chat Page Shows "WebGPU Not Supported"

**Symptoms:**
- Cannot access AI Assistant Chat
- Error message about WebGPU requirement

**Solutions:**
1. Check browser supports WebGPU (see WebGPU section above)
2. Enable hardware acceleration
3. Update to latest browser version
4. Update GPU drivers
5. Try different browser (Chrome 113+, Edge 113+)
6. If WebGPU unavailable, can't use local chat models

#### Model Download Stuck or Fails

**Symptoms:**
- Download progress bar stuck
- Model won't load
- Download fails partway through

**Solutions:**
1. Check internet connection stability
2. Verify sufficient disk space (50GB+ recommended)
3. Clear browser cache and site data
4. Try smaller model:
   - Instead of Llama 3.2 3B, try Llama 3.2 1B
5. Retry download
6. Check browser console for detailed error messages

#### "Device Lost" Error During Chat

**Symptoms:**
- Chat works initially then crashes
- "Device lost" error message
- GPU becomes unresponsive

**Solutions:**
1. Refresh the page immediately
2. Close other browser tabs to free GPU memory
3. Close background applications
4. Try smaller/different model
5. Restart browser completely
6. Check GPU drivers for stability issues

#### Chat Runs Very Slowly

**Symptoms:**
- Responses take very long time
- Typing lag or interface freeze
- GPU seems maxed out

**Solutions:**
1. **Close background applications** - Free system resources
2. **Reduce browser tabs** - Each tab uses GPU memory
3. **Try smaller model**:
   - Gemma 2 2B is fastest and most efficient
   - Larger models (7B+) need more resources
4. **Use F32 variant** if F16 causes slowdown (more stable, slightly slower)
5. **Restart GPU** - Close and reopen browser
6. **Check system resources** - Task Manager (Windows) or Activity Monitor (Mac)

#### Cannot Attach Images or Videos

**Symptoms:**
- File upload button disabled
- "File too large" error
- Unsupported file type message

**Solutions:**
1. **Check file size**:
   - Images: max 8MB
   - Videos: max 20MB
2. **Compress files** if needed:
   - Image: Use online tools or ImageMagick
   - Video: Use FFmpeg to reduce bitrate
3. **Verify file format**:
   - Images: JPEG, PNG, WEBP
   - Videos: WebM, MP4
4. **Ensure storage permissions** granted to browser:
   - Settings → Privacy → Site permissions → Camera/Microphone
5. **Check browser storage quota** - May be full

#### AI Responses Cut Off or Incomplete

**Symptoms:**
- Chat response stops midway
- Last response is incomplete
- Token limit reached warning

**Solutions:**
1. Increase max tokens setting if available
2. Shorten your input prompt
3. Break long questions into multiple messages
4. Start new chat session (clears context/tokens)
5. Use smaller model if token limit is strict

### Bug Reporter Issues

#### Gemini Analysis Fails Immediately

**Symptoms:**
- Click "Report Issue" but analysis fails instantly
- Error appears without attempting upload

**Cause:** Missing or invalid Gemini API configuration

**Solutions:**
1. **Get API key** from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Configure in Settings:
   - Settings → API → Base URL: `https://generativelanguage.googleapis.com/v1beta/openai/`
   - Settings → API → API Key: `YOUR_GEMINI_KEY`
3. Test API key validity at Google AI Studio
4. Check internet connection
5. Verify Gemini API quota (free tier has limits)

#### Video Upload Takes Too Long

**Symptoms:**
- Upload progress stuck or very slow
- Upload never completes

**Solutions:**
1. Check internet connection bandwidth
2. Use shorter screen recording (< 30 seconds for faster upload)
3. Close other applications using network
4. Try different internet connection (WiFi vs wired)
5. Verify video file is reasonable size (< 100MB)
6. Check upload size limits in browser devtools

#### Analysis Returns Empty or Malformed Report

**Symptoms:**
- Analysis completes but report is blank
- Report contains invalid or garbled text

**Note:** Origami AI automatically attempts to repair responses

**Solutions:**
1. **Retry analysis** - Auto-repair usually succeeds
2. Verify bug is clearly visible in recording
3. Ensure good screen clarity during recording
4. Add description text for AI context
5. Keep video focused on the issue
6. Check console for detailed error messages

#### Cannot Copy Debugging Prompt

**Symptoms:**
- "Copy to clipboard" button doesn't work
- Text doesn't appear in clipboard

**Solutions:**
1. Check browser clipboard permissions:
   - Allow clipboard access in browser settings
2. Try again with different browser
3. Grant clipboard permission if prompted
4. Manually select and copy the text:
   - Triple-click to select all
   - Ctrl+C / Cmd+C to copy
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

Report issues at: https://github.com/IslandApps/Origami-AI/issues

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
