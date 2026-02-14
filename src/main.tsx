import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import EnvCheck from './components/EnvCheck';
import { registerServiceWorker } from './lib/pwa';
import './index.css';

registerServiceWorker();

try {
  const rootElement = document.getElementById('root');
  
  if (!rootElement) {
    throw new Error('Root element not found');
  }
  
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <EnvCheck>
          <App />
        </EnvCheck>
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (error) {
  document.body.innerHTML = `
    <div style="min-height: 100vh; background: linear-gradient(to bottom right, #0B0B0B, #1A1A1A, #0B0B0B); display: flex; align-items: center; justify-content: center; padding: 20px; font-family: system-ui, -apple-system, sans-serif;">
      <div style="max-width: 600px; background: #1A1A1A; border: 2px solid #DC2626; border-radius: 8px; padding: 32px; color: white;">
        <h1 style="color: #DC2626; margin-bottom: 16px; font-size: 24px;">🚨 Critical Error</h1>
        <p style="color: #FCA5A5; margin-bottom: 16px;">NPC failed to initialize.</p>
        <div style="background: #0B0B0B; border: 1px solid #DC2626; border-radius: 4px; padding: 16px; margin-bottom: 16px; font-family: monospace; font-size: 14px; color: #FCA5A5; overflow-x: auto;">${error instanceof Error ? error.message : String(error)}</div>
        <button onclick="window.location.reload()" style="width: 100%; background: linear-gradient(to right, #374151, #1f2937); color: white; padding: 12px; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;">🔄 Reload</button>
      </div>
    </div>
  `;
}
