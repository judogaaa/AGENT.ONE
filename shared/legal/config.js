/**
 * Typed legal operator details. Values marked REQUIRED must be filled before production deploy.
 * Never commit real secrets; use env injection at build time where applicable.
 */
export const PUBLIC_ADMIN_NAME = 'Администрация цифровой платформы AGENT.ONE'

export const PUBLIC_CONTACTS = {
  platformTitle: PUBLIC_ADMIN_NAME,
  contactHeading: 'Связаться с администрацией сервиса',
  email: import.meta.env.VITE_PUBLIC_CONTACT_EMAIL || '',
  telegram: import.meta.env.VITE_PUBLIC_TELEGRAM || '',
  telegramUrl: import.meta.env.VITE_PUBLIC_TELEGRAM_URL || '',
}

export const COMMERCIAL_REQUISITES_NOTICE =
  'Коммерческие реквизиты владельца сервиса будут опубликованы до начала приёма платежей и полноценной коммерческой эксплуатации платформы.'

export const LEGAL_DETAILS = {
  operatorName: { value: '', required: true, label: 'Полное наименование оператора ПДн' },
  operatorShortName: { value: 'AGENT.ONE', required: false, label: 'Сокращённое наименование' },
  operatorLegalForm: { value: '', required: true, label: 'Организационно-правовая форма' },
  inn: { value: '', required: true, label: 'ИНН' },
  ogrn: { value: '', required: true, label: 'ОГРН/ОГРНИП' },
  kpp: { value: '', required: false, label: 'КПП' },
  legalAddress: { value: '', required: true, label: 'Юридический адрес' },
  postalAddress: { value: '', required: true, label: 'Почтовый адрес' },
  generalEmail: { value: '', required: true, label: 'Общий email для обращений' },
  contactEmail: { value: '', required: true, label: 'Email для обращений по персональным данным' },
  contactPhone: { value: '', required: true, label: 'Телефон для обращений' },
  workingHours: { value: '', required: true, label: 'Режим работы (приём обращений)' },
  supportEmail: { value: '', required: false, label: 'Email поддержки' },
  dpoEmail: { value: '', required: false, label: 'Email ответственного за обработку ПДн (если назначен)' },
  registryNotification: { value: '', required: false, label: 'Регистрационный номер в реестре операторов Роскомнадзора' },
  bankName: { value: '', required: false, label: 'Банк (для оферты)' },
  bankBik: { value: '', required: false, label: 'БИК' },
  bankAccount: { value: '', required: false, label: 'Расчётный счёт' },
  bankCorrAccount: { value: '', required: false, label: 'Корреспондентский счёт' },
}

export const LEGAL_DOCUMENT_VERSION = '2026-08-03-legal-v1'
export const COOKIE_CONSENT_VERSION = '2026-08-03-cookie-v1'

export const LEGAL_PAGES = [
  { slug: 'privacy', path: '/legal/privacy', title: 'Политика обработки персональных данных' },
  { slug: 'personal-data-consent', path: '/legal/personal-data-consent', title: 'Согласие на обработку персональных данных' },
  { slug: 'cookies', path: '/legal/cookies', title: 'Политика использования cookie' },
  { slug: 'terms', path: '/legal/terms', title: 'Пользовательское соглашение' },
  { slug: 'offer', path: '/legal/offer', title: 'Публичная оферта' },
  { slug: 'marketplace-rules', path: '/legal/marketplace-rules', title: 'Правила для покупателей, продавцов и площадки' },
  { slug: 'payment-delivery-returns', path: '/legal/payment-delivery-returns', title: 'Оплата, доставка, отмена и возвраты' },
  { slug: 'requisites', path: '/legal/requisites', title: 'Реквизиты, контакты и обращения' },
]

/** Footer shortcuts shown on public pages */
export const LEGAL_FOOTER_LINKS = [
  { slug: 'hub', path: '/legal', title: 'Юридический центр' },
  { slug: 'privacy', path: '/legal/privacy', title: 'Политика ПД' },
  { slug: 'terms', path: '/legal/terms', title: 'Пользовательское соглашение' },
  { slug: 'cookies', path: '/legal/cookies', title: 'Cookie' },
  { slug: 'requisites', path: '/legal/requisites', title: 'Реквизиты' },
]

/** Legal hub sections on /legal */
export const LEGAL_HUB_SECTIONS = [
  {
    id: 'buyers',
    title: 'Для покупателей',
    description: 'Условия использования сервиса, правила площадки и порядок оплаты, доставки и возвратов.',
    slugs: ['terms', 'marketplace-rules', 'payment-delivery-returns'],
  },
  {
    id: 'sellers',
    title: 'Для продавцов и бизнеса',
    description: 'Оферта на услуги платформы и правила размещения товаров на AGENT.ONE.',
    slugs: ['offer', 'marketplace-rules'],
  },
  {
    id: 'privacy',
    title: 'Персональные данные и cookie',
    description: 'Как мы обрабатываем персональные данные и используем файлы cookie.',
    slugs: ['privacy', 'personal-data-consent', 'cookies'],
  },
  {
    id: 'contacts',
    title: 'Реквизиты и обращения',
    description: 'Публичные контакты администрации сервиса и порядок направления обращений.',
    slugs: ['requisites'],
  },
]

export const CONSENT_TYPES = {
  personal_data: 'personal_data',
  terms: 'terms',
  cookies: 'cookies',
  marketing: 'marketing',
}

export function getRequiredLegalDetailKeys() {
  return Object.entries(LEGAL_DETAILS)
    .filter(([, v]) => v.required && !String(v.value || '').trim())
    .map(([k]) => k)
}

export function formatLegalDetail(key) {
  const item = LEGAL_DETAILS[key]
  if (!item) return '[REQUIRED: не указано]'
  const val = String(item.value || '').trim()
  if (!val && item.required) return `[REQUIRED: ${item.label}]`
  return val || '—'
}

export function legalDocumentsMeta() {
  return {
    version: LEGAL_DOCUMENT_VERSION,
    cookieConsentVersion: COOKIE_CONSENT_VERSION,
    pages: LEGAL_PAGES.map(p => ({ slug: p.slug, title: p.title, version: LEGAL_DOCUMENT_VERSION })),
  }
}

export function getLegalPage(slug) {
  return LEGAL_PAGES.find(p => p.slug === slug) || null
}
