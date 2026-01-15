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
        // VITE_NEXUS_API_URL is required - set it in .env file
        // Example: VITE_NEXUS_API_URL=http://localhost:2026
        // If not set, proxy will fail (which is intentional - forces configuration)
        target: process.env.VITE_NEXUS_API_URL,
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        // VITE_NEXUS_API_URL is required - set it in .env file
        // If not set, proxy will fail (which is intentional - forces configuration)
        target: process.env.VITE_NEXUS_API_URL,
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
