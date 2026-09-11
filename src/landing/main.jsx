import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Landing from './Landing.jsx';
import '../styles/landing.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
);

// Registered by hand with an absolute path (see src/app/main.jsx for why:
// vite-plugin-pwa's auto-injected registration script used a relative path
// that broke once the app moved to /app/, a directory below root).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW failed', e)));
}
