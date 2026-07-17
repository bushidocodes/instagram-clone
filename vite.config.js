import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  publicDir: "public",
  plugins: [
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      injectRegister: false,
      manifest: false,
      injectManifest: {
        globPatterns: ["**/*.{html,js,css,png,jpg,jpeg,svg,ico,woff,woff2}"],
        globIgnores: ["**/node_modules/**", "sw.js", "workbox-*.js"],
      },
      devOptions: { enabled: true, type: "module" },
    }),
  ],
  server: { port: 1338, strictPort: true },
  preview: { port: 1338, strictPort: true },
  build: {
    outDir: "dist",
    rollupOptions: { input: { main: "index.html", help: "help/index.html" } },
  },
});
