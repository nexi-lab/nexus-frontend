import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.ngrok.io', '.ngrok-free.app', 'localhost'],
    proxy: {
      '/api': {
        // target: 'https://nexus.nexilab.co',
        target: 'https://nexus-dev.nexilab.co',
        changeOrigin: true,
        secure: true,
      },
      '/health': {
        // target: 'https://nexus.nexilab.co',
        target: 'https://nexus-dev.nexilab.co',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
        },
      },
    },
  },
});
