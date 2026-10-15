import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../hooks/useStore'
import { requiresBusinessOnboarding } from '../store'
import PdConsentField from '../components/PdConsent'
import './BusinessOnboarding.css'

const LEGAL_TYPES = [
  {
    id: 'self_employed',
    icon: '👤',
    title: 'Самозанятый',
    subtitle: 'Физлицо с налогом на профессиональный доход',
  },
  {
    id: 'individual_entrepreneur',
    icon: '🏪',
    title: 'Индивидуальный предприниматель',
    subtitle: 'ИП на своём имени',
  },
  {
    id: 'legal_entity',
    icon: '🏢',
    title: 'Юридическое лицо',
    subtitle: 'ООО, АО и другие формы',
  },
]

const FIELD_DEFS = {
  fullName: { label: 'ФИО', placeholder: 'Иванов Иван Иванович' },
  inn12: { label: 'ИНН', placeholder: '12 цифр', digits: 12 },
  inn10: { label: 'ИНН', placeholder: '10 цифр', digits: 10 },
  region: { label: 'Регион', placeholder: 'Москва' },
  displayName: { label: 'Название на витрине', placeholder: 'Магазин Ивана' },
  ogrnip: { label: 'ОГРНИП', placeholder: '15 цифр', digits: 15 },
  registrationAddress: { label: 'Адрес регистрации', placeholder: 'Город, улица, дом' },
  legalName: { label: 'Полное наименование', placeholder: 'Общество с ограниченной ответственностью «Ромашка»' },
  shortName: { label: 'Сокращённое наименование', placeholder: 'ООО «Ромашка»' },
  kpp: { label: 'КПП', placeholder: '9 цифр', digits: 9 },
  ogrn: { label: 'ОГРН', placeholder: '13 цифр', digits: 13 },
  legalAddress: { label: 'Юридический адрес', placeholder: 'Город, улица, дом' },
  representativeFullName: { label: 'ФИО представителя', placeholder: 'Иванов Иван Иванович' },
  representativePosition: { label: 'Должность представителя', placeholder: 'Генеральный директор' },
  contactPhone: { label: 'Контактный телефон', placeholder: '+7 900 000-00-00' },
  contactEmail: { label: 'Контактный email', placeholder: 'you@example.com' },
}

const TYPE_FIELDS = {
  self_employed: ['fullName', 'inn12', 'region', 'displayName'],
  individual_entrepreneur: ['fullName', 'inn12', 'ogrnip', 'displayName', 'registrationAddress'],
  legal_entity: ['legalName', 'shortName', 'inn10', 'kpp', 'ogrn', 'legalAddress', 'representativeFullName', 'representativePosition'],
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function buildOnboardingPayload(legalType, values, pdConsent = false) {
  const payload = { legalType }
  for (const key of TYPE_FIELDS[legalType] || []) {
    payload[key] = (values[key] || '').trim()
  }
  payload.contactPhone = (values.contactPhone || '').trim()
  payload.contactEmail = (values.contactEmail || '').trim()
  payload.authority_confirmed = true
  payload.pd_consent = pdConsent === true
  payload.consent_source = 'business_onboarding'
  return payload
}

export function validateOnboardingFields(legalType, values) {
  const errors = {}
  if (!legalType) {
    errors.legalType = 'Выберите тип бизнеса'
    return errors
  }
  for (const key of TYPE_FIELDS[legalType] || []) {
    const def = FIELD_DEFS[key]
    const value = (values[key] || '').trim()
    if (!value) {
      errors[key] = 'Заполните поле'
      continue
    }
    if (def.digits && !new RegExp(`^\\d{${def.digits}}$`).test(value)) {
      errors[key] = `Должно быть ${def.digits} цифр`
    }
  }
  const phone = (values.contactPhone || '').trim()
  if (!phone) {
    errors.contactPhone = 'Заполните поле'
  }
  const email = (values.contactEmail || '').trim()
  if (!email) {
    errors.contactEmail = 'Заполните поле'
  } else if (!EMAIL_RE.test(email)) {
    errors.contactEmail = 'Некорректный email'
  }
  return errors
}

export default function BusinessOnboardingPage() {
  const s = useStore()
  const [legalType, setLegalType] = useState('')
  const [values, setValues] = useState({})
  const [confirmed, setConfirmed] = useState(false)
  const [pdConsent, setPdConsent] = useState(false)
  const [pdError, setPdError] = useState('')
  const [touched, setTouched] = useState({})
  const [errors, setErrors] = useState({})
  const [generalError, setGeneralError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const done = requiresBusinessOnboarding(s.user) === false && s.user?.role === 'business'

  useEffect(() => {
    if (!s.user || !s.token) {
      s.setPage('home')
      return
    }
    if (s.user.role !== 'business') {
      s.setPage('home')
      return
    }
    if (requiresBusinessOnboarding(s.user) === false) {
      s.setPage('dashboard')
    }
  }, [s.user?.id, s.user?.role, done])

  const fields = useMemo(() => TYPE_FIELDS[legalType] || [], [legalType])

  const setField = (key) => (e) => {
    const value = e.target.value
    setValues((v) => ({ ...v, [key]: value }))
    setTouched((t) => ({ ...t, [key]: true }))
    setErrors((prev) => ({ ...prev, [key]: '' }))
    setGeneralError('')
  }

  const selectType = (id) => {
    setLegalType(id)
    setErrors((prev) => ({ ...prev, legalType: '' }))
    setGeneralError('')
  }

  const fieldErrors = validateOnboardingFields(legalType, values)
  const canSubmit =
    !!legalType &&
    Object.keys(fieldErrors).length === 0 &&
    confirmed &&
    pdConsent &&
    !submitting

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit || submitting) return
    setGeneralError('')
    const nextErrors = validateOnboardingFields(legalType, values)
    if (Object.keys(nextErrors).length > 0 || !confirmed || !pdConsent) {
      if (!pdConsent) setPdError('Дайте согласие на обработку персональных данных')
      setErrors(nextErrors)
      setTouched(Object.keys(FIELD_DEFS).reduce((acc, key) => ({ ...acc, [key]: true }), {}))
      return
    }
    setSubmitting(true)
    try {
      await s.submitBusinessOnboarding(buildOnboardingPayload(legalType, values, pdConsent))
      s.setPage('dashboard')
    } catch (err) {
      setGeneralError(err.message || 'Не удалось сохранить данные. Попробуйте позже.')
      setSubmitting(false)
    }
  }

  if (!s.user || !s.token || s.user.role !== 'business') return null
  if (done) return null

  return (
    <div className="ob-page">
      <div className="ob-card">
        <div className="ob-head">
          <h1 className="ob-title">Заполните данные бизнеса</h1>
          <p className="ob-subtitle">
            Это обязательный шаг: без него бизнес-кабинет недоступен. Данные не передаются
            третьим лицам и используются только для подтверждения продавца.
          </p>
        </div>

        {generalError && (
          <div className="ob-error" role="alert">
            {generalError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <fieldset className="ob-fieldset">
            <legend>Форма бизнеса</legend>
            <div className="ob-types" role="radiogroup" aria-label="Форма бизнеса">
              {LEGAL_TYPES.map((t) => {
                const selected = legalType === t.id
                return (
                  <button
                    type="button"
                    key={t.id}
                    className={'ob-type' + (selected ? ' selected' : '')}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => selectType(t.id)}
                  >
                    <span className="ob-type-icon" aria-hidden="true">{t.icon}</span>
                    <span className="ob-type-title">{t.title}</span>
                    <span className="ob-type-sub">{t.subtitle}</span>
                  </button>
                )
              })}
            </div>
            {errors.legalType && (
              <span className="ob-field-error" id="legal-type-error" role="alert">{errors.legalType}</span>
            )}
          </fieldset>

          {legalType && (
            <fieldset className="ob-fieldset">
              <legend>Данные</legend>
              <div className="ob-grid">
                {fields.map((key) => {
                  const def = FIELD_DEFS[key]
                  const err = errors[key] || (touched[key] ? fieldErrors[key] : '')
                  return (
                    <div className="ob-field" key={key}>
                      <label htmlFor={`ob-${key}`}>{def.label}</label>
                      <input
                        id={`ob-${key}`}
                        type="text"
                        value={values[key] || ''}
                        onChange={setField(key)}
                        placeholder={def.placeholder}
                        className={err ? 'has-error' : ''}
                        aria-invalid={err ? 'true' : undefined}
                        aria-describedby={err ? `ob-${key}-error` : undefined}
                        inputMode={def.digits ? 'numeric' : undefined}
                        maxLength={def.digits || undefined}
                        autoComplete="off"
                      />
                      {err && (
                        <span className="ob-field-error" id={`ob-${key}-error`} role="alert">{err}</span>
                      )}
                    </div>
                  )
                })}
                <div className="ob-field">
                  <label htmlFor="ob-contactPhone">Контактный телефон</label>
                  <input
                    id="ob-contactPhone"
                    type="tel"
                    value={values.contactPhone || ''}
                    onChange={setField('contactPhone')}
                    placeholder={FIELD_DEFS.contactPhone.placeholder}
                    className={errors.contactPhone || (touched.contactPhone && fieldErrors.contactPhone) ? 'has-error' : ''}
                    aria-invalid={errors.contactPhone || (touched.contactPhone && fieldErrors.contactPhone) ? 'true' : undefined}
                    aria-describedby={errors.contactPhone || (touched.contactPhone && fieldErrors.contactPhone) ? 'ob-contactPhone-error' : undefined}
                    autoComplete="tel"
                  />
                  {(errors.contactPhone || (touched.contactPhone && fieldErrors.contactPhone)) && (
                    <span className="ob-field-error" id="ob-contactPhone-error" role="alert">{errors.contactPhone || fieldErrors.contactPhone}</span>
                  )}
                </div>
                <div className="ob-field">
                  <label htmlFor="ob-contactEmail">Контактный email</label>
                  <input
                    id="ob-contactEmail"
                    type="email"
                    value={values.contactEmail || ''}
                    onChange={setField('contactEmail')}
                    placeholder={FIELD_DEFS.contactEmail.placeholder}
                    className={errors.contactEmail || (touched.contactEmail && fieldErrors.contactEmail) ? 'has-error' : ''}
                    aria-invalid={errors.contactEmail || (touched.contactEmail && fieldErrors.contactEmail) ? 'true' : undefined}
                    aria-describedby={errors.contactEmail || (touched.contactEmail && fieldErrors.contactEmail) ? 'ob-contactEmail-error' : undefined}
                    autoComplete="email"
                  />
                  {(errors.contactEmail || (touched.contactEmail && fieldErrors.contactEmail)) && (
                    <span className="ob-field-error" id="ob-contactEmail-error" role="alert">{errors.contactEmail || fieldErrors.contactEmail}</span>
                  )}
                </div>
              </div>
            </fieldset>
          )}

          <div className="ob-consent">
            <input
              type="checkbox"
              id="ob-authority"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked)
                setGeneralError('')
              }}
            />
            <label htmlFor="ob-authority">
              Подтверждаю достоверность указанных данных и наличие полномочий действовать от имени бизнеса
            </label>
          </div>

          <PdConsentField checked={pdConsent} onChange={setPdConsent} error={pdError} source="business_onboarding" />

          <button
            type="submit"
            className="ob-submit"
            disabled={!canSubmit}
            title={!canSubmit ? 'Выберите форму бизнеса, заполните обязательные поля и подтвердите достоверность' : undefined}
          >
            {submitting ? 'Сохраняем…' : 'Продолжить в бизнес-кабинет'}
          </button>
        </form>
      </div>
    </div>
  )
}
