import { LEGAL_DOCUMENT_VERSION } from '../config.js'

const LinkComp = ({ to, children, LinkComponent, useRouterLink }) => {
  if (useRouterLink && LinkComponent) {
    return <LinkComponent to={to} target="_blank" rel="noopener noreferrer">{children}</LinkComponent>
  }
  return <a href={to} target="_blank" rel="noopener noreferrer">{children}</a>
}

export function PersonalDataConsentField({
  checked,
  onChange,
  error,
  id = 'pd-consent',
  source,
  LinkComponent,
  useRouterLink = true,
  showMarketing = false,
  marketingChecked = false,
  onMarketingChange,
}) {
  return (
    <div className="legal-consent-block">
      <div className={`legal-consent-row${error ? ' has-error' : ''}`}>
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          data-consent-source={source}
          data-consent-version={LEGAL_DOCUMENT_VERSION}
        />
        <label htmlFor={id}>
          Я даю{' '}
          <LinkComp to="/legal/personal-data-consent" LinkComponent={LinkComponent} useRouterLink={useRouterLink}>
            согласие на обработку персональных данных
          </LinkComp>{' '}
          и ознакомлен(а) с{' '}
          <LinkComp to="/legal/privacy" LinkComponent={LinkComponent} useRouterLink={useRouterLink}>
            Политикой обработки персональных данных
          </LinkComp>
        </label>
      </div>
      {error && (
        <span className="legal-consent-error" id={`${id}-error`} role="alert">{error}</span>
      )}
      {showMarketing && (
        <div className="legal-consent-row legal-consent-optional">
          <input
            type="checkbox"
            id={`${id}-marketing`}
            checked={marketingChecked}
            onChange={e => onMarketingChange?.(e.target.checked)}
          />
          <label htmlFor={`${id}-marketing`}>
            Я согласен(на) получать рекламные и информационные сообщения (необязательно)
          </label>
        </div>
      )}
    </div>
  )
}

export function buildConsentPayload({ pdConsent, marketingConsent }) {
  return {
    pd_consent: pdConsent === true,
    pd_consent_version: LEGAL_DOCUMENT_VERSION,
    consent_source: '',
    marketing_consent: marketingConsent === true,
  }
}

export default PersonalDataConsentField
