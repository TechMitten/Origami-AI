import express from 'express';
import { createServer as createViteServer } from 'vite';
import { renderVideoWithFfmpeg } from './src/services/FfmpegTutorialRenderer.js';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';

import multer from 'multer';

import { randomUUID } from "crypto";
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

  // Updated to default to 8080 for your VPS setup
  const port = process.env.PORT || 3000; 

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
      const allowedMimes = [
        'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
        'audio/mpeg', 'audio/wav', 'audio/mp3', 'video/mp4'
      ];
      
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Only specific media files are allowed.`));
      }
    }
  });

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

      console.log('Starting render process with', slides.length, 'slides...');

      const outDir = path.resolve(__dirname, 'out');
      if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
      }
      
      const outputLocation = path.resolve(outDir, `tutorial-${Date.now()}.mp4`);
      
      const publicDir = path.resolve(__dirname, 'public');

      // Use the new native FFmpeg renderer
      // This avoids Puppeteer/Remotion overhead completely
      await renderVideoWithFfmpeg({
          slides,
          musicSettings: musicSettings, // Pass original settings, renderer handles paths
          ttsVolume,
          outputLocation,
          publicDir
      });

      console.log('FFmpeg render completed successfully.');

      if (!req.body.disableAudioNormalization) {
        try {
          await normalizeAudioToYouTubeLoudness(outputLocation);
        } catch (normError) {
          console.warn('Audio normalization failed:', normError);
        }
      }
            
      res.download(outputLocation, (err) => {
        if (err && !res.headersSent) {
          res.status(500).send('Error downloading file');
        }
      });

    } catch (error) {
      const msg = (error as Error).message;
      console.error('Render error:', error);
      if (!res.headersSent) {
          res.status(500).json({ error: msg });
      }
    }
  });

  // --- START MODIFIED SECTION ---
  if (process.env.NODE_ENV === 'production') {
      const distDir = path.resolve(__dirname, 'dist');
      app.use(express.static(distDir));

      // Fixed wildcard route to prevent path-to-regexp crash
      app.get('*', (req, res) => {
          // If the request starts with /api but didn't match any route above, 404 it
          if (req.originalUrl.startsWith('/api')) {
            return res.status(404).json({ error: 'API route not found' });
          }
          // Otherwise, serve the SPA index.html
          res.sendFile(path.resolve(distDir, 'index.html'));
      });
  } else {
      if (vite) app.use(vite.middlewares);
  }
  // --- END MODIFIED SECTION ---

  const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
  
  server.timeout = 900000;
}

createServer();