import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        // The StarAdmin theme targets Bootstrap 4 SCSS, which predates the Sass module system.
        quietDeps: true,
        silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'slash-div', 'if-function'],
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.VITE_PORT || 5175),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.PORT || 3456}` },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Fonts and images stay files: the Content-Security-Policy does not allow data: fonts.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1024,
  },
});
