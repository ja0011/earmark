import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const api = process.env.EARMARK_API_URL ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom', 'viem'] },
  optimizeDeps: { include: ['@elevenlabs/client'] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/webhooks': { target: api, changeOrigin: true },
    },
  },
  preview: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
