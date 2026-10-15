export async function recordConsent({ consentType, documentVersion, source, granted = true, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch('/api/legal/consents', {
    method: 'POST',
    headers,
    body: JSON.stringify({ consentType, documentVersion, source, granted }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'consent record failed')
  }
  return res.json()
}

export async function withdrawConsent(consentType, token) {
  const res = await fetch('/api/legal/consents/withdraw', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ consentType }),
  })
  if (!res.ok) throw new Error('withdraw failed')
  return res.json()
}

export async function fetchLegalMeta() {
  const res = await fetch('/api/legal/meta')
  if (!res.ok) throw new Error('meta failed')
  return res.json()
}
