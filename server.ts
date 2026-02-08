import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url'; 

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createServer() {
  const app = express();
  
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