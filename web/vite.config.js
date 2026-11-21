import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const demo = process.env.VITE_DEMO === '1';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  // A demonstração vira um arquivo só (publicada como artefato)
  build: demo ? { outDir: 'dist-demo', rollupOptions: { output: { inlineDynamicImports: true } } } : {},
  base: demo ? './' : '/',
});
