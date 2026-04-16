import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import compression from 'compression';
import helmet from 'helmet';
import hpp from 'hpp';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createServer() {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://umami.techmitten.com", "blob:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        mediaSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "https:", "wss:", "ws:", "blob:", "data:", "https://unpkg.com"],
        workerSrc: ["'self'", "blob:"],
      },
    },
  }));
  app.use(compression());
  app.use(hpp());

  app.use(cors({
    origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : false,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
  }));

  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    next();
  });

  app.use(express.json({ limit: '200mb' }));

  // LLM / Gemini proxy endpoints
  // These keep API keys on the server (process.env.LLM_API_KEY) and avoid exposing them to the client bundle.
  const getServerApiKey = () => process.env.LLM_API_KEY || process.env.VITE_LLM_API_KEY || '';

  const toChatCompletionsEndpoint = (baseUrl: string) => {
    let endpoint = baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/';
    if (!endpoint.endsWith('/chat/completions')) {
      endpoint = endpoint.replace(/\/+$/, '');
      endpoint = `${endpoint}/chat/completions`;
    }
    return endpoint;
  };

  app.post('/api/llm/chat', async (req: Request, res: Response) => {
    try {
      const apiKey = getServerApiKey();
      if (!apiKey) return res.status(500).json({ error: 'Server not configured with LLM_API_KEY' });

      const { baseUrl, model, messages, temperature } = req.body || {};
      const endpoint = toChatCompletionsEndpoint(baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/');

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, temperature }),
      });

      const text = await resp.text();
      res.status(resp.status).send(text);
    } catch (err) {
      console.error('[LLM Proxy] /api/llm/chat error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/llm/analyze-video', async (req: Request, res: Response) => {
    try {
      const apiKey = getServerApiKey();
      if (!apiKey) return res.status(500).json({ error: 'Server not configured with LLM_API_KEY' });

      const {
        baseUrl,
        model,
        systemPrompt,
        userPrompt,
        mediaBase64,
        mediaMimeType,
        mediaFileName,
      } = req.body || {};

      const normalizedModel = (model || '').replace(/^models\//, '').trim();

      // If no media was provided, just proxy to chat completions
      if (!mediaBase64) {
        const chatEndpoint = toChatCompletionsEndpoint(baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/');
        const resp = await fetch(chatEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model: normalizedModel, messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt } ], temperature: 0.2 }),
        });
        const text = await resp.text();
        return res.status(resp.status).send(text);
      }

      // Upload flow for Gemini media analysis
      // Start upload
      const startResp = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String((mediaBase64 || '').length / 1.37),
          'X-Goog-Upload-Header-Content-Type': mediaMimeType || 'application/octet-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: mediaFileName || 'upload' } }),
      });

      if (!startResp.ok) {
        const errText = await startResp.text().catch(() => '');
        throw new Error(errText || `Failed to start Gemini upload: ${startResp.statusText}`);
      }

      const uploadUrl = startResp.headers.get('x-goog-upload-url');
      if (!uploadUrl) throw new Error('Gemini upload URL not returned');

      // Post binary
      const buffer = Buffer.from(mediaBase64, 'base64');
      const finalizeResp = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Command': 'upload, finalize',
          'X-Goog-Upload-Offset': '0',
          'Content-Type': mediaMimeType || 'application/octet-stream',
        },
        body: buffer,
      });

      if (!finalizeResp.ok) {
        const errText = await finalizeResp.text().catch(() => '');
        throw new Error(errText || `Failed to upload Gemini file: ${finalizeResp.statusText}`);
      }

      const finalizeData: any = await finalizeResp.json();
      const uploaded = (finalizeData.file ?? finalizeData) as any;
      if (!uploaded?.name || !uploaded?.uri) throw new Error('Gemini upload did not return file metadata');

      // Wait for active
      const cleanName = uploaded.name.startsWith('files/') ? uploaded.name : uploaded.name.replace(/^\/+/, '');
      const fileEndpoint = `https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${encodeURIComponent(apiKey)}`;

      let activeResource: any = null;
      for (let attempt = 0; attempt < 45; attempt++) {
        const s = await fetch(fileEndpoint);
        if (!s.ok) throw new Error(`Failed to check Gemini file state: ${s.statusText}`);
        const d: any = await s.json();
        const resource = (d.file ?? d) as any;
        const state = (resource.state || '').toUpperCase();
        if (state === 'ACTIVE') { activeResource = resource; break; }
        if (state === 'FAILED') throw new Error('Gemini failed to process uploaded media');
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!activeResource) throw new Error('Gemini media processing timed out');

      // Generate content using the file URI
      const generateEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const genResp = await fetch(generateEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [ { role: 'user', parts: [ { text: userPrompt }, { file_data: { mime_type: mediaMimeType || 'application/octet-stream', file_uri: activeResource.uri } } ] } ],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
        })
      });

      if (!genResp.ok) {
        const errText = await genResp.text().catch(() => '');
        throw new Error(errText || `Gemini generate failed: ${genResp.statusText}`);
      }

      const genData: any = await genResp.json();
      const text = genData.candidates?.[0]?.content?.parts?.find((p: any) => typeof p?.text === 'string')?.text || '';
      if (!text) throw new Error('Gemini returned no text output');

      // Best-effort cleanup: delete uploaded file
      try {
        await fetch(`https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${encodeURIComponent(apiKey)}`, { method: 'DELETE' });
      } catch { /* ignore */ }

      res.status(200).send(text);
    } catch (err) {
      console.error('[LLM Proxy] /api/llm/analyze-video error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/llm/analyze-issue', async (req: Request, res: Response) => {
    try {
      const apiKey = getServerApiKey();
      if (!apiKey) return res.status(500).json({ error: 'Server not configured with LLM_API_KEY' });

      const {
        model,
        systemPrompt,
        userPrompt,
        mediaBase64,
        mediaMimeType,
        mediaFileName,
      } = req.body || {};

      const normalizedModel = (model || '').replace(/^models\//, '').trim();

      if (!mediaBase64) {
        return res.status(400).json({ error: 'mediaBase64 is required for issue capture analysis' });
      }

      // Upload flow
      const startResp = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String((mediaBase64 || '').length / 1.37),
          'X-Goog-Upload-Header-Content-Type': mediaMimeType || 'application/octet-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: mediaFileName || 'upload' } }),
      });

      if (!startResp.ok) {
        const errText = await startResp.text().catch(() => '');
        throw new Error(errText || `Failed to start Gemini upload: ${startResp.statusText}`);
      }

      const uploadUrl = startResp.headers.get('x-goog-upload-url');
      if (!uploadUrl) throw new Error('Gemini upload URL not returned');

      const buffer = Buffer.from(mediaBase64, 'base64');
      const finalizeResp = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Command': 'upload, finalize',
          'X-Goog-Upload-Offset': '0',
          'Content-Type': mediaMimeType || 'application/octet-stream',
        },
        body: buffer,
      });

      if (!finalizeResp.ok) {
        const errText = await finalizeResp.text().catch(() => '');
        throw new Error(errText || `Failed to upload Gemini file: ${finalizeResp.statusText}`);
      }

      const finalizeData: any = await finalizeResp.json();
      const uploaded = (finalizeData.file ?? finalizeData) as any;
      if (!uploaded?.name || !uploaded?.uri) throw new Error('Gemini upload did not return file metadata');

      // Wait for active
      const cleanName = uploaded.name.startsWith('files/') ? uploaded.name : uploaded.name.replace(/^\/+/, '');
      const fileEndpoint = `https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${encodeURIComponent(apiKey)}`;

      let activeResource: any = null;
      for (let attempt = 0; attempt < 45; attempt++) {
        const s = await fetch(fileEndpoint);
        if (!s.ok) throw new Error(`Failed to check Gemini file state: ${s.statusText}`);
        const d: any = await s.json();
        const resource = (d.file ?? d) as any;
        const state = (resource.state || '').toUpperCase();
        if (state === 'ACTIVE') { activeResource = resource; break; }
        if (state === 'FAILED') throw new Error('Gemini failed to process uploaded media');
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!activeResource) throw new Error('Gemini media processing timed out');

      const generateEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const genResp = await fetch(generateEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [ { role: 'user', parts: [ { text: userPrompt }, { file_data: { mime_type: mediaMimeType || 'application/octet-stream', file_uri: activeResource.uri } } ] } ],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
        })
      });

      if (!genResp.ok) {
        const errText = await genResp.text().catch(() => '');
        throw new Error(errText || `Gemini generate failed: ${genResp.statusText}`);
      }

      const genData: any = await genResp.json();
      const text = genData.candidates?.[0]?.content?.parts?.find((p: any) => typeof p?.text === 'string')?.text || '';
      if (!text) throw new Error('Gemini returned no text output');

      try {
        await fetch(`https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${encodeURIComponent(apiKey)}`, { method: 'DELETE' });
      } catch { /* ignore */ }

      res.status(200).send(text);
    } catch (err) {
      console.error('[LLM Proxy] /api/llm/analyze-issue error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // Proxy endpoint for music preview (bypasses CORS issues with incompetech.com)
  app.get('/api/music-preview/:filename', async (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    console.log(`[Music Preview] Requested file: ${filename}`);

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      console.error(`Music proxy blocked potential path traversal: ${filename}`);
      return res.status(400).send('Invalid filename');
    }

    if (!/^[\w\s().'-]+\.mp3$/i.test(filename)) {
      console.error(`Music proxy blocked invalid filename: ${filename}`);
      return res.status(400).send('Invalid filename');
    }

    console.log(`[Music Preview] Validated filename, proxying to: ${filename}`);
    const musicUrl = `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(filename)}`;
    console.log(`[Music Preview] Fetching from: ${musicUrl}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(musicUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Origami-AI-Music-Preview/1.0',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`Music proxy failed for ${filename}: ${response.status} ${response.statusText}`);
        return res.status(response.status).send('Failed to fetch music');
      }

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Accept-Ranges', 'bytes');
      res.removeHeader('X-Powered-By');

      if (!response.body) {
        return res.status(500).send('Failed to read audio stream');
      }

      const nodeStream = Readable.fromWeb(response.body as any);
      await pipeline(nodeStream, res);

    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`Music proxy timeout for ${filename}`);
        return res.status(504).send('Request timeout');
      }
      console.error(`Music proxy error for ${filename}:`, error);
      res.status(500).send('Failed to proxy music');
    }
  });

  app.use('/music', express.static(path.resolve(__dirname, 'public/music')));
  app.use(express.static(path.resolve(__dirname, 'public')));

  const port = Number(process.env.PORT) || 3000;

  let vite: any;
  if (process.env.NODE_ENV !== 'production') {
    // FIX #1: Prevent Vite from over-watching and spiking CPU
    vite = await createViteServer({
      server: { 
        middlewareMode: true,
        watch: {
          ignored: ['**/node_modules/**', '**/dist/**', '**/public/music/**'],
          awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 1000 },
        },
        hmr: {
          protocol: 'ws',
          host: 'localhost',
          port: 24678,
        }
      },
      appType: 'spa',
    });
  }

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    const publicDir = path.resolve(__dirname, 'public');

    app.use(express.static(publicDir));
    app.use(express.static(distDir));

    app.use((req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: 'API route not found' });
      }
      if (!req.path.includes('.')) {
        return res.sendFile(path.resolve(distDir, 'index.html'));
      }
      next();
    });

    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
  } else {
    if (vite) app.use(vite.middlewares);
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
  });

  server.timeout = 900000;

  // Track open connections so we can forcefully destroy them on shutdown
  const connections = new Set<any>();
  server.on('connection', (socket) => {
    connections.add(socket);
    socket.on('close', () => connections.delete(socket));
  });

  // FIX #2: Graceful Shutdown to kill "Ghost" processes
  const handleShutdown = async () => {
    console.log('\n[Shutdown] Closing server and cleaning up processes...');
    // Stop accepting new connections
    server.close(async () => {
      try {
        if (vite) await vite.close();
      } catch (e) {
        console.error('[Shutdown] Error closing vite:', e);
      }
    });

    // Destroy lingering sockets
    for (const sock of connections) {
      try { sock.destroy(); } catch (e) { /* ignore */ }
    }

    // If we still haven't exited after a short grace period, force exit
    const forceKillMs = Number(process.env.FORCE_KILL_MS) || 10000;
    setTimeout(() => {
      console.warn('[Shutdown] Forcing exit after grace period.');
      process.exit(0);
    }, forceKillMs).unref();
    console.log('[Shutdown] Shutdown sequence initiated.');
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);

  // Optional CPU monitor: DISABLED by default in dev to reduce CPU overhead
  // Set ENABLE_CPU_MONITOR=1 explicitly to enable
  const enableCpuMonitor = process.env.ENABLE_CPU_MONITOR === '1';
  if (enableCpuMonitor) {
    (async () => {
      try {
        const pidusageMod = await import('pidusage');
        const pidusage = pidusageMod.default || pidusageMod;
        const maxCpu = Number(process.env.MAX_CPU) || 85;
        const intervalMs = Number(process.env.CPU_CHECK_INTERVAL) || 5000; // Increased from 2000ms
        const consecutiveLimit = Number(process.env.CPU_CONSECUTIVE) || 5; // Increased from 3

        let consecutive = 0;
        const cpuTimer = setInterval(async () => {
          try {
            const stat = await pidusage(process.pid);
            const cpu = stat.cpu || 0;
            if (cpu >= maxCpu) {
              consecutive += 1;
              console.warn(`[CPU Monitor] High CPU ${cpu.toFixed(1)}% (threshold ${maxCpu}%) - ${consecutive}/${consecutiveLimit}`);
            } else {
              consecutive = 0;
            }
            if (consecutive >= consecutiveLimit) {
              console.error('[CPU Monitor] CPU threshold exceeded repeatedly — initiating graceful shutdown.');
              clearInterval(cpuTimer);
              await handleShutdown();
            }
          } catch (err) {
            // ignore monitoring errors
          }
        }, intervalMs);
      } catch (e) {
        console.warn('[CPU Monitor] pidusage not available; skipping CPU monitoring.');
      }
    })();
  }

  // Log and exit on uncaught errors to avoid stuck states
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    try { handleShutdown(); } catch { process.exit(1); }
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
    try { handleShutdown(); } catch { process.exit(1); }
  });
}

createServer();
