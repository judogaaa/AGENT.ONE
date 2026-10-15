import { useEffect } from 'react'
import { getLegalDocument } from '../documents.js'
import { LEGAL_PAGES } from '../config.js'
import { resetCookieConsentChoice } from '../cookieCategories.js'
import PublicContactBlock from './PublicContactBlock.jsx'

function DocLink({ to, children, useRouterLink, LinkComponent, className }) {
  if (useRouterLink && LinkComponent) {
    return <LinkComponent to={to} target="_blank" rel="noopener noreferrer" className={className}>{children}</LinkComponent>
  }
  return <a href={to} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
}

export function LegalDocumentView({ slug, backTo = '/legal', backLabel = '← Юридический центр', useRouterLink = true, LinkComponent }) {
  const doc = getLegalDocument(slug)
  useEffect(() => {
    if (doc) document.title = `AGENT.ONE — ${doc.title}`
  }, [doc])

  if (!doc) {
    return (
      <div className="legal-page">
        <div className="legal-content"><h1>Документ не найден</h1></div>
      </div>
    )
  }

  return (
    <div className="legal-page">
      <div className="legal-header">
        <div className="auth-logo">
          <a href="https://agent-one.ru">AGENT<em>.ONE</em></a>
        </div>
        <DocLink to={backTo} useRouterLink={useRouterLink} LinkComponent={LinkComponent} className="legal-back">
          {backLabel}
        </DocLink>
      </div>
      <article className="legal-content">
        <h1>{doc.title}</h1>
        <p className="legal-meta">Версия документа: {doc.version}</p>
        {slug === 'cookies' && (
          <div className="cookie-choice-reset">
            <button
              type="button"
              className="cookie-choice-reset-btn"
              onClick={() => resetCookieConsentChoice()}
            >
              Изменить выбор cookie
            </button>
          </div>
        )}
        {doc.showPublicContacts && <PublicContactBlock />}
        {doc.sections.map((section, i) => (
          <section key={i}>
            {section.title && <h2>{section.title}</h2>}
            {(section.paragraphs || []).map((p, j) => (
              <p key={j}>{p}</p>
            ))}
            {section.list && (
              <ul>
                {section.list.map((item, k) => (
                  <li key={k}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <nav className="legal-nav" aria-label="Другие документы">
          <h2>Другие документы</h2>
          <ul>
            {LEGAL_PAGES.filter(p => p.slug !== slug).map(p => (
              <li key={p.slug}>
                <DocLink to={p.path} useRouterLink={useRouterLink} LinkComponent={LinkComponent}>{p.title}</DocLink>
              </li>
            ))}
          </ul>
        </nav>
      </article>
    </div>
  )
}

export default LegalDocumentView
