import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {HashRouter} from 'react-router-dom';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';

const preventZoom = (event: Event) => {
  event.preventDefault();
};

document.addEventListener('gesturestart', preventZoom, {passive: false});
document.addEventListener('gesturechange', preventZoom, {passive: false});
document.addEventListener('gestureend', preventZoom, {passive: false});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
);

// Register lightweight offline-shell Service Worker in production builds for full installable PWA support
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => undefined);
          }
        });
      })
      .catch((error) => {
        console.warn('Service Worker registration skipped:', error);
      });
  });
}
