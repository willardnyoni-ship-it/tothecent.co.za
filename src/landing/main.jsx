import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Landing from './Landing.jsx';
import { registerServiceWorker } from '../lib/registerSW.js';
import '../styles/landing.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
);

registerServiceWorker();
