import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

/*
 * The service worker only looks for a new version when the page loads, so a
 * tab left open — or a home-screen app resumed from the background — can go
 * on serving an old build for days. That is how someone ends up copying a
 * code from a screen that no longer exists. Check again whenever the app
 * comes back to the foreground; vite-plugin-pwa's autoUpdate takes it from
 * there.
 */
if ('serviceWorker' in navigator) {
  const checkForUpdate = () => {
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {
        /* offline, or no worker yet — nothing to do */
      });
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdate();
  });
  window.addEventListener('focus', checkForUpdate);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
