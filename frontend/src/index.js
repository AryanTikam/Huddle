import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css'; 

// Detect if running as Chrome extension
const isExtension = !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
if (isExtension) {
  document.documentElement.classList.add('extension-mode');
  document.body.classList.add('extension-mode');
  // Dynamically import extension-specific styles
  import('./extension.css');
}

// Expose extension detection globally
window.__HUDDLE_IS_EXTENSION__ = isExtension;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);