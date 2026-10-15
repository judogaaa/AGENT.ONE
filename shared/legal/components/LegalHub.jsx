import { useEffect } from 'react'
import { LEGAL_HUB_SECTIONS, LEGAL_PAGES } from '../config.js'

function DocLink({ to, children, useRouterLink, LinkComponent, className }) {
  if (useRouterLink && LinkComponent) {
    return <LinkComponent to={to} className={className}>{children}</LinkComponent>
  }
  return <a href={to} className={className}>{children}</a>
}

export function LegalHub({
  backTo = '/',
  backLabel = '← На главную',
  useRouterLink = true,
  LinkComponent,
}) {
  useEffect(() => {
    document.title = 'AGENT.ONE — Юридический центр'
  }, [])

  const pageBySlug = Object.fromEntries(LEGAL_PAGES.map(p => [p.slug, p]))

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
      <article className="legal-content legal-hub">
        <h1>Юридический центр</h1>
        <p className="legal-meta">
          Документы AGENT.ONE для покупателей, продавцов и всех пользователей сервиса.
        </p>
        <div className="legal-hub-sections">
          {LEGAL_HUB_SECTIONS.map(section => (
            <section key={section.id} className="legal-hub-section">
              <h2>{section.title}</h2>
              <p className="legal-hub-section-desc">{section.description}</p>
              <ul className="legal-hub-links">
                {section.slugs.map(slug => {
                  const page = pageBySlug[slug]
                  if (!page) return null
                  return (
                    <li key={slug}>
                      <DocLink
                        to={page.path}
                        useRouterLink={useRouterLink}
                        LinkComponent={LinkComponent}
                        className="legal-hub-link"
                      >
                        {page.title}
                      </DocLink>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </article>
    </div>
  )
}

export default LegalHub
