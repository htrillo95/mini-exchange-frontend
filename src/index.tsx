import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { MarketModeProvider } from './market/MarketModeContext';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MarketModeProvider>
          <App />
        </MarketModeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
