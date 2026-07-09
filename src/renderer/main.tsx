import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';

const App = lazy(async () => {
  const module = await import('./App');
  return { default: module.App };
});

const ConnectorDebug = lazy(async () => {
  const module = await import('./ConnectorDebug');
  return { default: module.ConnectorDebug };
});

const root = ReactDOM.createRoot(document.getElementById('root')!);
const loadingFallback = <main className="app-loading">Loading editor...</main>;

if (new URLSearchParams(window.location.search).has('connector-debug')) {
  root.render(
    <React.StrictMode>
      <Suspense fallback={loadingFallback}>
        <ConnectorDebug />
      </Suspense>
    </React.StrictMode>,
  );
} else if (!window.macroApi) {
  root.render(
    <main className="environment-error">
      <h1>Electron runtime required</h1>
      <p>This page cannot run as a normal browser tab. Start the desktop application with:</p>
      <code>npm run dev</code>
    </main>,
  );
} else {
  root.render(
    <React.StrictMode>
      <Suspense fallback={loadingFallback}>
        <App />
      </Suspense>
    </React.StrictMode>,
  );
}
