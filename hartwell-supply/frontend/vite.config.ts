import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom', 'viem'] },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/earmark': 'http://localhost:8788',
      '/api': 'http://localhost:8788',
    },
    fs: { allow: ['..', '../../earmark-plugin'] },
  },
  preview: { port: 5174 },
});
