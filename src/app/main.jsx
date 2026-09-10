import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BudgetProvider } from '../store/BudgetStore.jsx';
import App from './App.jsx';
import '../styles/app.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BudgetProvider>
      <App />
    </BudgetProvider>
  </StrictMode>,
);
