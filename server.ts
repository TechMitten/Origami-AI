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
  // In production, restrict this to your Cloudflare Pages URL
  app.use(cors({
    origin: process.env.CLIENT_URL || '*', 
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
  }));
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

  // Cleanup function for potentially stuck files
  const cleanupOldFiles = () => {
     try {
         const now = Date.now();
         const clean = (dir: string, ageMs: number) => {
             if (!fs.existsSync(dir)) return;
             fs.readdirSync(dir).forEach(file => {
                 const filePath = path.join(dir, file);
                 const stat = fs.statSync(filePath);
                 if (now - stat.mtimeMs > ageMs) {
                     fs.unlinkSync(filePath);
                     console.log(`Deleted old file: ${file}`);
                 }
             });
         };
         // Clean uploads older than 1 hour
         clean(uploadDir, 60 * 60 * 1000);
         // Clean outputs older than 1 hour
         clean(path.resolve(__dirname, 'out'), 60 * 60 * 1000);
     } catch (err) {
         console.error("Cleanup error:", err);
     }
  };
  
  // Run cleanup on startup
  cleanupOldFiles();
  // Run cleanup every 15 minutes
  setInterval(cleanupOldFiles, 15 * 60 * 1000);

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

  const upload = multer({ 
    storage,
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB max file size
    },
    fileFilter: (_req, file, cb) => {
      // Strict MIME type checking
      const allowedMimes = [
        'application/pdf',
        'image/png', 
        'image/jpeg', 
        'image/webp',
        'audio/mpeg', 
        'audio/wav', 
        'audio/mp3',
        'video/mp4'
      ];
      
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Only specific media files are allowed.`));
      }
    }
  });

  // Create Vite server in middleware mode and configure the app type as 'custom'
  // (server.middlewareMode: true)
  // Create Vite server in middleware mode and configure the app type as 'custom'
  // (server.middlewareMode: true)
  // Only create Vite server in development
  let vite;
  if (process.env.NODE_ENV !== 'production') {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
  }

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
      // Use 50% of available CPU cores for parallel rendering to avoid OOM
      // If we are on a free tier (1 vCPU or less), force concurrency to 1 to prevent OOM
      const cpuCount = os.cpus().length;
      const concurrency = cpuCount <= 1 ? 1 : Math.max(1, Math.floor(cpuCount / 2));
      console.log(`Using ${concurrency} CPU cores for parallel rendering (Total CPUs: ${cpuCount})`);

      const controller = new AbortController();

      res.on('close', () => {
          if (!res.writableEnded) {
              console.log('Client disconnected, cancelling render...');
              controller.abort();
          }
      });

      await renderMedia({
        composition,
        serveUrl: bundled,
        codec: 'h264',
        outputLocation,
        inputProps: { slides, musicSettings: processedMusicSettings, ttsVolume },
        verbose: true,
        dumpBrowserLogs: true,
        concurrency: concurrency, // Parallel frame rendering
        cancelSignal: (callback: () => void) => {
          if (controller.signal.aborted) {
            callback();
          } else {
            controller.signal.addEventListener('abort', () => callback(), { once: true });
          }
        },
      });

      console.log('Render complete:', outputLocation);
      
      
      // Normalize audio to YouTube's recommended -14 LUFS
      if (!req.body.disableAudioNormalization) {
        console.log('Normalizing audio to YouTube loudness standards (-14 LUFS)...');
        try {
          await normalizeAudioToYouTubeLoudness(outputLocation);
          console.log('Audio normalization complete');
        } catch (normError) {
          console.warn('Audio normalization failed (video will be sent without normalization):', normError);
          // Continue without normalization - the video is still valid
        }
      } else {
        console.log('Audio normalization disabled by user setting.');
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
      const msg = (error as Error).message;
      const isAbort = msg?.includes('aborted') || (error as Error).name === 'AbortError';
      
      if (isAbort) {
          console.log('Render operation was cancelled by user.');
      } else {
          console.error('Render error:', error);
          if (!res.headersSent) {
             res.status(500).json({ error: msg });
          }
      }
    }
  });

  // Use vite's connect instance as middleware
  // If you use your own express router (express.Router()), you should use router.use
  // Use vite's connect instance as middleware in dev
  // In production, serve built assets
  if (process.env.NODE_ENV === 'production') {
      const distDir = path.resolve(__dirname, 'dist');
      app.use(express.static(distDir));

      // SPA fallback
      app.get('*', (req, res) => {
          if (req.originalUrl.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
          res.sendFile(path.resolve(distDir, 'index.html'));
      });
  } else {
      if (vite) app.use(vite.middlewares);
  }

  const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
  
  // Set timeout to 15 minutes (900000 ms) - rendering can take time!
  server.timeout = 900000;
}

createServer();
