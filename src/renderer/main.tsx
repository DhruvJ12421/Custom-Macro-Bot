import React from 'react';
import ReactDOM from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { App } from './App';
import { ConnectorDebug } from './ConnectorDebug';

const root = ReactDOM.createRoot(document.getElementById('root')!);

if (new URLSearchParams(window.location.search).has('connector-debug')) {
  root.render(
    <React.StrictMode>
      <ConnectorDebug />
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
      <App />
    </React.StrictMode>,
  );
}
