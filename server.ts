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
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://unpkg.com", "blob:", "https://www.googletagmanager.com", "https://www.google-analytics.com", "https://umami.techmitten.com", "https://static.cloudflareinsights.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        mediaSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "https:", "wss:", "ws:", "blob:", "data:", "https://unpkg.com", "https://www.google-analytics.com"],
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
          ignored: ['**/node_modules/**', '**/dist/**', '**/public/music/**']
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

  // Optional CPU monitor: set ENABLE_CPU_MONITOR=1 to enable (dev by default)
  const enableCpuMonitor = process.env.ENABLE_CPU_MONITOR === '1' || process.env.NODE_ENV !== 'production';
  if (enableCpuMonitor) {
    (async () => {
      try {
        const pidusageMod = await import('pidusage');
        const pidusage = pidusageMod.default || pidusageMod;
        const maxCpu = Number(process.env.MAX_CPU) || 85;
        const intervalMs = Number(process.env.CPU_CHECK_INTERVAL) || 2000;
        const consecutiveLimit = Number(process.env.CPU_CONSECUTIVE) || 3;

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