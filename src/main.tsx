import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/styles/globals.css';
// Side-effect import: initialises i18next and sets <html lang dir> before the
// first render, so the very first paint is already in the right direction.
import '@/i18n';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
