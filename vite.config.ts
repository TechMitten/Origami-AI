import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 10000, // 10MB
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router'],
          'web-llm': ['@mlc-ai/web-llm'],
          'ffmpeg': ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
          'pdfjs': ['pdfjs-dist'],
          'ocr': ['tesseract.js'],
        },
      },
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
    // Optimize HMR and file watching for lower CPU usage
    middlewareMode: true,
    watch: {
      // Native fs events (inotify/fs.watch) never fire on 9p/drvfs mounts
      // (WSL/Windows, devcontainers), so HMR silently stops updating until the
      // server is restarted. Polling is required for those filesystems.
      usePolling: true,
      interval: 100,
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/*.log'],
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
