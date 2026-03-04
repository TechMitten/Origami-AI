import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://unpkg.com", "blob:", "https://www.googletagmanager.com", "https://www.google-analytics.com"],
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

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });


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
    // URL-decode the filename (client sends it encoded)
    const filename = decodeURIComponent(req.params.filename);
    console.log(`[Music Preview] Requested file: ${filename}`);

    // Security: Prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      console.error(`Music proxy blocked potential path traversal: ${filename}`);
      return res.status(400).send('Invalid filename');
    }

    // Security: Validate filename contains only safe characters
    // Allow alphanumeric, spaces, hyphens, underscores, dots, apostrophes, and parentheses
    // Must end with .mp3
    if (!/^[\w\s().'-]+\.mp3$/i.test(filename)) {
      console.error(`Music proxy blocked invalid filename: ${filename}`);
      return res.status(400).send('Invalid filename');
    }

    console.log(`[Music Preview] Validated filename, proxying to: ${filename}`);
    const musicUrl = `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(filename)}`;
    console.log(`[Music Preview] Fetching from: ${musicUrl}`);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

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

      // Set proper headers for audio streaming
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      res.setHeader('Accept-Ranges', 'bytes');

      // Security: Don't expose server info
      res.removeHeader('X-Powered-By');

      // Check if response body exists
      if (!response.body) {
        return res.status(500).send('Failed to read audio stream');
      }

      // Stream the audio data efficiently using pipeline
      // Convert Web Stream to Node.js Readable stream
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

  let vite;
  if (process.env.NODE_ENV !== 'production') {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
  }


  if (process.env.NODE_ENV === 'production') {
      const distDir = path.resolve(__dirname, 'dist');
      const publicDir = path.resolve(__dirname, 'public');

      // Serve public assets first (music-library.json, etc.)
      app.use(express.static(publicDir));

      // Serve built app files
      app.use(express.static(distDir));

      app.use(limiter);

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
}

createServer();
