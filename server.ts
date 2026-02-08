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

  // Security Middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled for now to avoid breaking existing scripts/styles
    crossOriginEmbedderPolicy: false, // Disabled to allow cross-origin resources if needed
  }));
  app.use(compression());
  app.use(hpp());

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  });
  
  // Apply rate limiting to all requests that fall through static files (e.g. API/SPA)
  // We place it AFTER static files middleware if we want to exclude static assets,
  // BUT to be safe against DoS on static assets, we can place it here with a higher limit.
  // Given the user wants "No broken functions", safely placing it for API/App logic is safer.
  // However, I will apply it globally but with a high limit OR just apply it to the SPA fallback later.
  // Let's stick to applying it only to non-static or catch-all routes by placing it later.
  // But wait, the previous plan was to place it later. I will do that.
  
  
  // In production, restrict this to your Cloudflare Pages URL
  app.use(cors({
    origin: process.env.CLIENT_URL || '*', 
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
  }));

  // Add CORP header for COOP/COEP compatibility
  // Using 'credentialless' instead of 'require-corp' allows CDN resources
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    next();
  });

  app.use(express.json({ limit: '200mb' }));

  // Serve static files from public directory
  app.use('/music', express.static(path.resolve(__dirname, 'public/music')));

  app.use(express.static(path.resolve(__dirname, 'public')));

  // Updated to default to 8080 for your VPS setup
  const port = Number(process.env.PORT) || 3000; 

  // Server-side endpoints removed as rendering is now client-side.
  // Files are no longer stored on the server.

  let vite;
  if (process.env.NODE_ENV !== 'production') {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
  }


  // --- START MODIFIED SECTION ---
  if (process.env.NODE_ENV === 'production') {
      const distDir = path.resolve(__dirname, 'dist');
      app.use(express.static(distDir));

      // Apply rate limiting to the main application routes (SPA fallback)
      app.use(limiter);

      // Catch-all route for SPA - must be last
      // Use middleware style to avoid Express 5 path-to-regexp issues
      app.use((req, res, next) => {
          // If the request starts with /api but didn't match any route above, 404 it
          if (req.originalUrl.startsWith('/api')) {
            return res.status(404).json({ error: 'API route not found' });
          }
          // Otherwise, serve the SPA index.html for all non-file routes
          if (!req.path.includes('.')) {
            return res.sendFile(path.resolve(distDir, 'index.html'));
          }
          next();
      });

      // Global Error Handler
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
      });
  } else {
      if (vite) app.use(vite.middlewares);
  }
  // --- END MODIFIED SECTION ---

  const server = app.listen(port, 'localhost', () => {
    console.log(`Server running at http://localhost:${port}`);
  });
  
  server.timeout = 900000;
}

createServer();