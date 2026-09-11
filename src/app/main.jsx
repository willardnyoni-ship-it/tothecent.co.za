import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BudgetProvider } from '../store/BudgetStore.jsx';
import { BusinessProvider } from '../store/BusinessStore.jsx';
import App from './App.jsx';
import '../styles/app.css';
import '../styles/business.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BudgetProvider>
      <BusinessProvider>
        <App />
      </BusinessProvider>
    </BudgetProvider>
  </StrictMode>,
);

// Registered by hand (not vite-plugin-pwa's auto-injected script) with an
// absolute path so it resolves correctly regardless of this page's own
// depth - this file is served from /app/, one directory below the site
// root where sw.js actually lives.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW failed', e)));
}
