import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Handy for debugging and automated checks in development builds.
if (import.meta.env.DEV) {
  void import('./state/editor').then(({ useEditor }) => {
    ;(window as unknown as { pucklet: unknown }).pucklet = useEditor
  })
}
