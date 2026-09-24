import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import MiratWorkspace from './mirat/MiratWorkspace.jsx'
import { screens } from './mirat/routes.js'
import { BrowserRouter } from 'react-router-dom';
import AuthProvider from './auth/AuthProvider.jsx'

const path = window.location.pathname.replace(/\/$/, '') || '/'

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {screens.some(([route]) => route === path) ? <MiratWorkspace path={path} /> : <App />}
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);  