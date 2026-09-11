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
