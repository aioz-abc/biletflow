import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AuthProvider from './auth/AuthProvider.jsx'
import CampaignPortal from './mirat/CampaignPortal.jsx'
import AdminPortal from './mirat/AdminPortal.jsx'
import MiratWorkspace from './mirat/MiratWorkspace.jsx'
import { screens } from './mirat/routes.js'

const path = window.location.pathname.replace(/\/$/, '') || '/'
const isCampaign = path === '/organizer/campaigns/new'
const isAdmin = path === '/admin' || path.startsWith('/admin/')
const isWorkspace = screens.some(([route]) => route === path)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isCampaign ? <CampaignPortal /> : isAdmin ? <AdminPortal /> : isWorkspace ? <MiratWorkspace path={path} /> : (
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    )}
  </StrictMode>,
)
