import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    target: 'es2020',
    // Orçamento: bundle inicial < 150 KB gzip (docs/decisoes-arquitetura.md)
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (/node_modules[/](react|react-dom|scheduler)[/]/.test(id)) return 'react';
          if (id.includes('node_modules/@tanstack') || id.includes('node_modules/react-router')) return 'vendor';
        },
      },
    },
  },
});
