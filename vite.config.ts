import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SECRET_KEY': JSON.stringify(process.env.VITE_SECRET_KEY || '')
  },
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
      host: 'localhost',
      port: 24678,
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
