import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ModalProvider } from './components/ModalProvider'

if (import.meta.env.PROD) {
  const noop = () => {}
  console.log = noop
  console.info = noop
  console.debug = noop
  console.trace = noop
  console.table = noop
  console.group = noop
  console.groupCollapsed = noop
  console.groupEnd = noop
  console.dir = noop
  console.dirxml = noop
  console.time = noop
  console.timeEnd = noop
  console.timeLog = noop
  console.clear = noop
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ModalProvider>
      <App />
    </ModalProvider>
  </StrictMode>,
)
