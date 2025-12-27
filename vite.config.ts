import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), svgr()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['localhost'],
    proxy: {
      '/api': {
        // For Docker development, proxy to local Nexus server
        // For production deployment, change to: 'https://nexus-dev.nexilab.co'
        // Use VITE_NEXUS_API_URL from .env, fallback to localhost for local dev
        target: process.env.VITE_NEXUS_API_URL || 'http://localhost:2026',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: process.env.VITE_NEXUS_API_URL || 'https://nexus-dev.nexilab.co',
        changeOrigin: true,
        secure: false,
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
