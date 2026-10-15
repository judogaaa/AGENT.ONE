/**
 * Factual registry of personal/technical data collected by AGENT.ONE (from code audit, commit 83d8201).
 * Do not add items not backed by implementation.
 */
export const DATA_REGISTRY = {
  accountRegistration: {
    fields: ['email', 'password (bcrypt hash)', 'displayName', 'role', 'phone', 'firstName', 'lastName', 'patronymic', 'birthDate'],
    storage: 'PostgreSQL profiles',
    source: ['POST /api/auth/signup', 'Yandex OAuth signup'],
    thirdParties: ['Yandex ID (OAuth signup/login)'],
  },
  yandexOAuth: {
    fields: ['provider=yandex', 'provider subject (Yandex ID)', 'email (if returned)', 'display name (if returned)'],
    storage: 'PostgreSQL auth_identities, profiles',
    source: ['GET /api/auth/oauth/yandex/callback'],
    cookies: ['agentone_yandex_oauth (temporary, OAuth flow)'],
    thirdParties: ['Yandex LLC (oauth.yandex.ru)'],
  },
  sessionAuth: {
    fields: ['JWT access token (jti)', 'refresh token (SHA-256 hash in DB)', 'device fingerprint (SHA-256 of IP+UA+lang)'],
    storage: 'Redis jti:*, sess:*; PostgreSQL auth_sessions',
    cookies: ['agentone_sso_refresh_token', 'agentone_refresh_token'],
    retention: 'access TTL (env ACCESS_TOKEN_TTL_MINUTES); refresh TTL (REFRESH_TOKEN_TTL_HOURS)',
  },
  profileAccount: {
    fields: ['displayName', 'email', 'phone', 'firstName', 'lastName', 'patronymic', 'birthDate', 'avatarUrl', 'deliveryCity', 'deliveryAddress', 'deliveryComment', 'payerType', 'billingName', 'billingCompanyName', 'billingInn'],
    storage: 'PostgreSQL profiles',
    source: ['PUT profile APIs', 'Account settings'],
  },
  businessOnboarding: {
    fields: ['legalType', 'INN', 'KPP', 'OGRN/OGRNIP', 'legal name', 'addresses', 'representative', 'contact email/phone'],
    storage: 'PostgreSQL organizations',
    source: ['POST business onboarding'],
  },
  orders: {
    fields: ['customerName', 'customerPhone', 'customerEmail', 'deliveryCity', 'deliveryAddress', 'deliveryComment', 'order items'],
    storage: 'PostgreSQL orders, order_items',
    source: ['Checkout / POST orders'],
  },
  leads: {
    fields: ['name', 'phone', 'email', 'message', 'product reference'],
    storage: 'PostgreSQL leads',
    source: ['Lead forms', 'AI manager lead creation'],
  },
  aiManager: {
    fields: ['dialog messages', 'client contact from profile', 'product context', 'dialog status'],
    storage: 'PostgreSQL ai_manager_dialogs, ai_manager_messages, ai_manager_events',
    source: ['POST /api/ai-manager/chat'],
    thirdParties: ['LLM provider when configured (GROQ/OPENROUTER env) — message text may be sent for inference'],
  },
  shopProfile: {
    fields: ['shop name, description, contacts (phone, email, city), logo, cover'],
    storage: 'PostgreSQL shops',
    source: ['Business shop settings'],
  },
  auditLogs: {
    fields: ['actor user id', 'role', 'action', 'IP', 'User-Agent', 'metadata JSON (no passwords/tokens)'],
    storage: 'PostgreSQL audit_events',
    retention: 'operational; not auto-deleted in code',
  },
  clientLocalStorage: {
    fields: ['encrypted/salted token wrapper', 'profile JSON', 'cart', 'compare list', 'assistant chat cache'],
    storage: 'browser localStorage',
    category: 'functional/necessary for session UX',
  },
  analytics: {
    fields: [],
    note: 'No Google Analytics, Yandex Metrika or similar third-party analytics scripts in codebase at 83d8201',
  },
  marketing: {
    fields: [],
    note: 'No email marketing/newsletter sending implemented in codebase at 83d8201',
  },
}

export const COOKIE_REGISTRY = {
  necessary: [
    { name: 'agentone_sso_refresh_token', purpose: 'SSO refresh session', httpOnly: true, path: '/api/auth' },
    { name: 'agentone_refresh_token', purpose: 'Legacy refresh session (migration)', httpOnly: true, path: '/api/auth' },
    { name: 'agentone_yandex_oauth', purpose: 'Temporary OAuth browser correlation', httpOnly: true, path: '/api/auth/oauth/yandex', maxAge: 'minutes' },
  ],
  functional: [
    { name: 'localStorage: token, profile, cart, compare, assistant_*', purpose: 'Client-side UX state', storage: 'browser' },
    { name: 'agentone_cookie_consent', purpose: 'Stores cookie preference version and categories', storage: 'localStorage' },
  ],
  analytics: [],
  marketing: [],
}
