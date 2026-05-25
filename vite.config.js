import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  server: {
    port: 1338,
    strictPort: true
  },
  preview: {
    port: 1338,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        help: 'help/index.html'
      }
    }
  }
});
