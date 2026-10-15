import { LEGAL_FOOTER_LINKS } from '../config.js'

export function LegalFooter({ LinkComponent, useRouterLink = true, className = '' }) {
  const isAuthFooter = className.includes('agentone-legal-footer--auth')
  const isEmbedded = className.includes('agentone-legal-footer--embedded')
  const Link = ({ to, children }) => {
    if (useRouterLink && LinkComponent) {
      return <LinkComponent to={to}>{children}</LinkComponent>
    }
    // Force full navigation on the main SPA (no react-router). Nested footers /
    // overlays must not swallow these links.
    return (
      <a
        href={to}
        onClick={(e) => {
          e.preventDefault()
          window.location.assign(to)
        }}
      >
        {children}
      </a>
    )
  }

  const Tag = isEmbedded ? 'div' : 'footer'

  return (
    <Tag className={`agentone-legal-footer ${className}`.trim()} role="contentinfo">
      <div className="agentone-legal-footer-inner">
        {!isAuthFooter && (
          <div className="agentone-legal-footer-brand">
            <span>© {new Date().getFullYear()} AGENT.ONE</span>
            <span className="agentone-legal-footer-tagline">AI-маркетплейс для бизнеса</span>
          </div>
        )}
        <nav className="agentone-legal-footer-nav" aria-label="Юридические документы">
          {LEGAL_FOOTER_LINKS.map(p => (
            <Link key={p.slug} to={p.path}>{p.title}</Link>
          ))}
        </nav>
        {isAuthFooter && (
          <p className="agentone-legal-footer-copy">© {new Date().getFullYear()} AGENT.ONE</p>
        )}
      </div>
    </Tag>
  )
}

export default LegalFooter
