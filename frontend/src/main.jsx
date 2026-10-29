import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AdminPortal from './mirat/AdminPortal.jsx'
import MiratWorkspace from './mirat/MiratWorkspace.jsx'
import { screens } from './mirat/routes.js'

const path = window.location.pathname.replace(/\/$/, '') || '/'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {(path === '/admin' || path.startsWith('/admin/')) ? <AdminPortal /> : screens.some(([route]) => route === path) ? <MiratWorkspace path={path} /> : <App />}
  </StrictMode>,
)
