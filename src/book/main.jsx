import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installDemo } from '../lib/demo.js';
import Book from './Book.jsx';
import '../styles/book.css';

// ?demo=appointments (the owner's preview): example data, dates moved to mid-month.
installDemo();

createRoot(document.getElementById('root')).render(<StrictMode><Book /></StrictMode>);
