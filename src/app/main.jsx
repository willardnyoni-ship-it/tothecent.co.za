import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BudgetProvider } from '../store/BudgetStore.jsx';
import { BusinessProvider } from '../store/BusinessStore.jsx';
import App from './App.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { registerServiceWorker } from '../lib/registerSW.js';
import '../styles/app.css';
import '../styles/business.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Last-resort net for anything outside a sheet (see Sheet.jsx for the
        more targeted boundary around modal content) - without this, any
        uncaught render error anywhere blanked the whole app with no way
        back except a hard reload, and no visible reason why. */}
    <ErrorBoundary>
      <BudgetProvider>
        <BusinessProvider>
          <App />
        </BusinessProvider>
      </BudgetProvider>
    </ErrorBoundary>
  </StrictMode>,
);

registerServiceWorker();
