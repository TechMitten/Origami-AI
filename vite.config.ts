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
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
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
      usePolling: false, // Use native fs events instead of polling
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/*.log'],
    },
    hmr: {
      protocol: 'ws',
      // Use the IPv4 loopback explicitly. With 'localhost' the HMR ws server can
      // bind to IPv6 [::1] only while the browser dials 127.0.0.1 (or vice versa),
      // which silently breaks HMR and leaves the page running stale modules.
      host: process.env.HMR_HOST || '127.0.0.1',
      port: parseInt(process.env.HMR_PORT || '24678'),
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
