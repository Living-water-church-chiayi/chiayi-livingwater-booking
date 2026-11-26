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
