import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import svgr from 'vite-plugin-svgr';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
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
        '/auth': {
          target: env.VITE_ACCOUNTS_API_URL,
          changeOrigin: true,
        },
        '/v2': {
          target: env.VITE_NEXUS_API_URL,
          changeOrigin: true,
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
  };
});
