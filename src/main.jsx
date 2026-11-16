import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
try {
  const saved = JSON.parse(localStorage.getItem('mktdesk_prod_v1_theme') || 'null');
  document.documentElement.dataset.theme = ['light','dark'].includes(saved) ? saved : (window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
} catch { document.documentElement.dataset.theme='light'; }
document.querySelector('meta[name="theme-color"]')?.setAttribute('content',document.documentElement.dataset.theme==='dark'?'#101e22':'#07515a');
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(err => console.warn('BravaDesk: instalação indisponível', err)));
}
