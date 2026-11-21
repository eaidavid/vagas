import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { DEMO } from './api.js';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);

if (!DEMO && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
