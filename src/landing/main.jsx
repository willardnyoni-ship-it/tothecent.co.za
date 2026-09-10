import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Landing from './Landing.jsx';
import '../styles/landing.css';

// Service worker registration is injected automatically by vite-plugin-pwa
// (see vite.config.js's injectRegister: 'auto') - no manual registration
// call needed here.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
);
