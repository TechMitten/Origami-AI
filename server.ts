import express from 'express';
import { createServer as createViteServer } from 'vite';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';

import multer from 'multer';

import { randomUUID } from "crypto";
import os from 'os';
import { normalizeAudioToYouTubeLoudness } from './src/services/audioNormalization.js'; 

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '200mb' }));
  // Serve static files from public directory
  app.use('/music', express.static(path.resolve(__dirname, 'public/music')));
  app.use(express.static(path.resolve(__dirname, 'public')));

  const port = process.env.PORT || 5173; 

  // Configure Multer for file uploads
  const uploadDir = path.resolve(__dirname, 'public/uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      // Keep original extension
      const ext = path.extname(file.originalname) || '.bin';
      const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-');
      cb(null, `${name}-${Date.now()}-${randomUUID()}${ext}`);
    }
  });

  const upload = multer({ storage });

  // Create Vite server in middleware mode and configure the app type as 'custom'
  // (server.middlewareMode: true)
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  // API Routes
  app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
  });

  app.post('/api/render', async (req, res) => {
    try {
      const { slides, musicSettings, ttsVolume } = req.body;
      if (!slides || !Array.isArray(slides)) {
         return res.status(400).json({ error: 'Invalid or missing slides data' });
      }

      // Convert relative music URL to absolute URL for rendering
      let processedMusicSettings = musicSettings;
      if (musicSettings?.url && musicSettings.url.startsWith('/')) {
        const serverUrl = `http://localhost:${port}`;
        processedMusicSettings = {
          ...musicSettings,
          url: `${serverUrl}${musicSettings.url}`
        };
        console.log('Converted music URL:', musicSettings.url, '->', processedMusicSettings.url);
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
        inputProps: { slides, musicSettings: processedMusicSettings, ttsVolume },
      });

      const outDir = path.resolve(__dirname, 'out');
      if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
      }
      
      const outputLocation = path.resolve(outDir, `tutorial-${Date.now()}.mp4`);

      // Use all available CPU cores for parallel rendering
      const cpuCount = os.cpus().length;
      console.log(`Using ${cpuCount} CPU cores for parallel rendering`);

      await renderMedia({
        composition,
        serveUrl: bundled,
        codec: 'h264',
        outputLocation,
        inputProps: { slides, musicSettings: processedMusicSettings, ttsVolume },
        verbose: false,
        dumpBrowserLogs: false,
        concurrency: cpuCount, // Parallel frame rendering
      });

      console.log('Render complete:', outputLocation);
      
      // Normalize audio to YouTube's recommended -14 LUFS
      console.log('Normalizing audio to YouTube loudness standards (-14 LUFS)...');
      try {
        await normalizeAudioToYouTubeLoudness(outputLocation);
        console.log('Audio normalization complete');
      } catch (normError) {
        console.warn('Audio normalization failed (video will be sent without normalization):', normError);
        // Continue without normalization - the video is still valid
      }
      
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

  const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
  
  // Set timeout to 15 minutes (900000 ms) - rendering can take time!
  server.timeout = 900000;
}

createServer();
