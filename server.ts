import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createServer() {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://unpkg.com", "blob:"],
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
