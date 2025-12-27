import express from 'express';
import { createServer as createViteServer } from 'vite';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '200mb' })); 

  // Create Vite server in middleware mode and configure the app type as 'custom'
  // (server.middlewareMode: true)
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  // API Routes
  app.post('/api/render', async (req, res) => {
    try {
      const { slides, musicSettings } = req.body;
      if (!slides || !Array.isArray(slides)) {
         return res.status(400).json({ error: 'Invalid or missing slides data' });
      }

      console.log('Starting render process with', slides.length, 'slides...');
      
      const entryPoint = path.resolve(__dirname, './src/video/Root.tsx');
      console.log('Bundling from:', entryPoint);

      const bundled = await bundle({
        entryPoint,
        // Optional: webpack override if needed
      });

      const composition = await selectComposition({
        serveUrl: bundled,
        id: 'TechTutorial',
        inputProps: { slides, musicSettings },
      });

      const outDir = path.resolve(__dirname, 'out');
      if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
      }
      
      const outputLocation = path.resolve(outDir, `tutorial-${Date.now()}.mp4`);

      await renderMedia({
        composition,
        serveUrl: bundled,
        codec: 'h264',
        outputLocation,
        inputProps: { slides, musicSettings },
        verbose: true,     // Enable verbose logging to see puppeteer errors
        dumpBrowserLogs: true, // Dump browser console logs to terminal
      });

      console.log('Render complete:', outputLocation);
      
      res.download(outputLocation, (err) => {
        if (err) {
            console.error('Error sending file:', err);
             if (!res.headersSent) {
                res.status(500).send('Error downloading file');
             }
        }
      });

    } catch (error) {
      console.error('Render error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Use vite's connect instance as middleware
  // If you use your own express router (express.Router()), you should use router.use
  app.use(vite.middlewares);



  const port = process.env.PORT || 5173;
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

createServer();
