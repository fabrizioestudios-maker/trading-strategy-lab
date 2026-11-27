import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, /api va a la API de NEXUS (python -m nexus_api, puerto 8800). En producción la API sirve dist/.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8800' } },
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 900 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
