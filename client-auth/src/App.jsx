import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { useState } from 'react'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import LegalDocumentView from '@legal/components/LegalDocumentView.jsx'
import LegalHub from '@legal/components/LegalHub.jsx'
import LegalFooter from '@legal/components/LegalFooter.jsx'
import CookieBanner from '@legal/components/CookieBanner.jsx'
import { AnalyticsGate } from '@legal/analyticsGate.js'
import { loadCookieConsent } from '@legal/cookieCategories.js'
import '@legal/legal.css'
import './styles/auth.css'

const LEGAL_SLUGS = [
  'privacy',
  'personal-data-consent',
  'cookies',
  'terms',
  'offer',
  'marketplace-rules',
  'payment-delivery-returns',
  'requisites',
]

function LegalPageRoute({ slug }) {
  return (
    <LegalDocumentView
      slug={slug}
      backTo="/legal"
      backLabel="← Юридический центр"
      useRouterLink
      LinkComponent={Link}
    />
  )
}

export default function App() {
  const [cookieCategories, setCookieCategories] = useState(
    () => loadCookieConsent()?.categories || { necessary: true }
  )

  return (
    <div className="auth-app">
      <div className="auth-shell">
        <main className="auth-main">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/legal" element={<LegalHub backTo="/register" backLabel="← К регистрации" useRouterLink LinkComponent={Link} />} />
            {LEGAL_SLUGS.map(slug => (
              <Route key={slug} path={`/legal/${slug}`} element={<LegalPageRoute slug={slug} />} />
            ))}
            <Route path="/terms" element={<Navigate to="/legal/terms" replace />} />
            <Route path="/privacy" element={<Navigate to="/legal/privacy" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </main>
        <LegalFooter
          LinkComponent={Link}
          useRouterLink
          className="agentone-legal-footer--auth"
        />
      </div>
      <CookieBanner onConsentChange={setCookieCategories} useRouterLink LinkComponent={Link} />
      <AnalyticsGate categories={cookieCategories} />
    </div>
  )
}
