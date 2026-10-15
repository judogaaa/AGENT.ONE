import { LEGAL_DOCUMENT_VERSION } from './config.js'

export function hasCurrentPersonalDataConsent(profile) {
  if (!profile) return false
  const version = profile.privacyVersion || profile.privacy_version || ''
  return version === LEGAL_DOCUMENT_VERSION
}

export function hasCurrentTermsConsent(profile) {
  if (!profile) return false
  const version = profile.termsVersion || profile.terms_version || ''
  return version === LEGAL_DOCUMENT_VERSION
}
