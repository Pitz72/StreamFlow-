import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Caratteri inclusi nell'app (niente rete a runtime, CSP font-src 'self').
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
