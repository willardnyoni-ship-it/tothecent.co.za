// Registered by hand (not vite-plugin-pwa's auto-injected script) with an
// absolute path so it resolves correctly regardless of the calling page's
// own depth (the landing page is at the site root, the app one directory
// deeper at /app/, but sw.js always lives at the root).
//
// Because we register by hand, vite-plugin-pwa's registerType:'autoUpdate'
// script (and its update-checking/skipWaiting logic) never runs either -
// without this, a new service worker would install but sit "waiting" until
// every tab on the site fully closed, so a real deploy could look like it
// never happened to anyone who just hit refresh. skipWaiting/clientsClaim
// (vite.config.js) make the new worker take over immediately; reloading
// once on 'controllerchange' is what actually makes the new build appear.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW failed', e));
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
