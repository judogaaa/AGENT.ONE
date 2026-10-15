import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import LegalShell from './LegalShell'
import './index.css'
import './styles/motion.css'
import '@legal/legal.css'

function Root() {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  return path.startsWith('/legal') ? <LegalShell key={path} /> : <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
