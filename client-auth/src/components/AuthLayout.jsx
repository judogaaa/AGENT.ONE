export default function AuthLayout({ title, subtitle, children, error, errorAction, wide }) {
  return (
    <div className={'auth-card' + (wide ? ' auth-card--wide' : '')}>
      <div className="auth-logo">
        <a href="https://agent-one.ru">AGENT<em>.ONE</em></a>
      </div>
      {title && <h1 className="auth-title">{title}</h1>}
      {subtitle && <p className="auth-subtitle">{subtitle}</p>}
      {error && <div className="auth-error-banner">{error}</div>}
      {errorAction && <div className="auth-error-action">{errorAction}</div>}
      {children}
    </div>
  )
}
