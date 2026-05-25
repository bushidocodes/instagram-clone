import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  publicDir: 'public',
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      // app.js handles SW registration; don't inject a second one
      injectRegister: false,
      // manifest.json already lives in public/ and is referenced in HTML
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,png,jpg,jpeg,svg,ico,woff,woff2}'],
        globIgnores: ['**/node_modules/**', 'sw.js', 'workbox-*.js']
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
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
