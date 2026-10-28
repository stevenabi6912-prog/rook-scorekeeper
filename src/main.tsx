import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { applyTheme, loadTheme } from './lib/theme'

// Before the first paint, so a phone on the light theme never flashes dark.
applyTheme(loadTheme())

// A phone that stays on one screen all evening never navigates, so it would
// never notice a new build. Ask the service worker to check every five
// minutes; with autoUpdate a new build then takes over and reloads the page.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    setInterval(() => registration.update().catch(() => undefined), 5 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
