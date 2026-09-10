import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// GitHub Pages serves this repo's /docs folder (Settings -> Pages -> Branch:
// main, folder: /docs) - keeping the built site there means `npm run build`
// is the only step before a normal `git add/commit/push`, no separate CI.
export default defineConfig({
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // We already ship a hand-written public/manifest.json (start_url,
      // icons, etc. tuned for this app) - the plugin only needs to add the
      // service worker and its registration, not generate its own manifest.
      manifest: false,
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      workbox: {
        // Both HTML entry points need their own navigation fallback rather
        // than Workbox's single-page-app default of always falling back to
        // index.html - opening /app.html offline must still open the app,
        // not the landing page.
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
    }),
  ],
});
