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
        app: resolve(__dirname, 'app/index.html'),
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
      // 'auto' injects a <script src="./registerSW.js"> - relative, which
      // broke once app/index.html moved a directory deeper than the output
      // root (it resolved to /app/registerSW.js, a 404). Registering by
      // hand with an absolute '/sw.js' works from any page depth.
      injectRegister: false,
      registerType: 'autoUpdate',
      workbox: {
        // Both HTML entry points need their own navigation fallback rather
        // than Workbox's single-page-app default of always falling back to
        // index.html - opening /app/ offline must still open the app,
        // not the landing page.
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        // Because the service worker is registered by hand (see main.jsx)
        // rather than through vite-plugin-pwa's own registerType:'autoUpdate'
        // script, none of that script's update-checking/skipWaiting logic
        // ever ran - a new service worker installed but sat "waiting"
        // until every tab on the site fully closed, so a deploy could look
        // like it never happened to anyone who just refreshed. These two
        // make a new service worker activate and take over open tabs
        // immediately instead of waiting; main.jsx reloads once when that
        // happens so the new build actually shows up.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
});
