import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'eval/web',
  plugins: [react()],
  build: {
    outDir: '../../out/eval-web',
    emptyOutDir: true
  },
  server: {
    host: '127.0.0.1',
    port: 5177
  }
});
