import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: [
      '.ngrok.io',
      '.ngrok-free.app',
      'localhost'
    ],
    proxy: {
      '/api': {
        target: 'https://nexus.nexilab.co',
        changeOrigin: true,
        secure: true,
      },
      '/health': {
        target: 'https://nexus.nexilab.co',
        changeOrigin: true,
        secure: true,
      }
    }
  },
  optimizeDeps: {
    include: ['pdfjs-dist']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pdfjs': ['pdfjs-dist']
        }
      }
    }
  }
})
