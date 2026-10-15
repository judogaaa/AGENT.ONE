import PersonalDataConsentField from '../../../shared/legal/components/PersonalDataConsentField.jsx'
import { LEGAL_DOCUMENT_VERSION } from '../../../shared/legal/config.js'

export function PdConsentField(props) {
  return <PersonalDataConsentField {...props} useRouterLink={false} />
}

export function consentPayload(checked, source) {
  return {
    pd_consent: checked === true,
    pd_consent_version: LEGAL_DOCUMENT_VERSION,
    consent_source: source,
  }
}

export default PdConsentField
