import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import './ui/style.css'
import './ui/account-ui.css'
import './ui/wiring.css'
import './ui/friends-preferences.css'
import './ui/search-area-picker.css'
import './ui/parity-account.css'
import './ui/parity-public.css'
import './ui/parity-social.css'
import './ui/parity-shell.css'
import './features/garden/sky.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
