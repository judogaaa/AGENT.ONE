let analyticsLoaded = false

export function isAnalyticsAllowed(categories) {
  return Boolean(categories?.analytics)
}

export function loadAnalyticsIfAllowed(categories) {
  if (!isAnalyticsAllowed(categories) || analyticsLoaded) return false
  analyticsLoaded = true
  window.__AGENTONE_ANALYTICS_LOADED__ = true
  return true
}

export function resetAnalyticsForTests() {
  analyticsLoaded = false
  delete window.__AGENTONE_ANALYTICS_LOADED__
}

export function AnalyticsGate({ categories }) {
  if (typeof window !== 'undefined') {
    loadAnalyticsIfAllowed(categories)
  }
  return null
}

export default AnalyticsGate
