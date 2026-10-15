import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import PasswordInput from '../components/PasswordInput'
import PersonalDataConsentField from '@legal/components/PersonalDataConsentField.jsx'
import { signup, buildCompleteUrl, getYandexOAuthUrl, fetchProviders } from '../utils/auth'
import { LEGAL_DOCUMENT_VERSION } from '@legal/config.js'

export default function RegisterPage() {
  const [searchParams] = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [accountType, setAccountType] = useState('')
  const [termsConsent, setTermsConsent] = useState(false)
  const [pdConsent, setPdConsent] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [generalError, setGeneralError] = useState('')
  const [yandexEnabled, setYandexEnabled] = useState(true)
  const [yandexLoading, setYandexLoading] = useState(false)
  const oauthStarted = useRef(false)

  useEffect(() => {
    fetchProviders().then(providers => {
      const yp = providers.find(p => p.id === 'yandex')
      if (yp) setYandexEnabled(yp.enabled)
    })
  }, [])

  useEffect(() => {
    document.title = 'AGENT.ONE — Регистрация'
  }, [])

  const clearError = () => setGeneralError('')

  const validate = () => {
    const e = {}
    if (!name.trim()) e.name = 'Укажите имя'
    if (!email.trim()) e.email = 'Укажите email'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Некорректный email'
    if (!password) e.password = 'Введите пароль'
    else if (password.length < 6) e.password = 'Минимум 6 символов'
    if (!passwordConfirm) e.passwordConfirm = 'Подтвердите пароль'
    else if (password !== passwordConfirm) e.passwordConfirm = 'Пароли не совпадают'
    if (!accountType) e.accountType = 'Выберите тип аккаунта'
    if (!termsConsent) e.termsConsent = 'Примите пользовательское соглашение'
    if (!pdConsent) e.pdConsent = 'Дайте согласие на обработку персональных данных'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const requireRoleAndConsent = () => {
    const e = {}
    if (!accountType) e.accountType = 'Выберите тип аккаунта'
    if (!termsConsent) e.termsConsent = 'Примите пользовательское соглашение'
    if (!pdConsent) e.pdConsent = 'Дайте согласие на обработку персональных данных'
    if (Object.keys(e).length > 0) setErrors(e)
    return Object.keys(e).length === 0
  }

  const canSubmit = accountType && termsConsent && pdConsent

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGeneralError('')
    if (!validate()) return
    setLoading(true)
    try {
      await signup({
        email: email.trim(),
        password,
        displayName: name.trim(),
        role: accountType,
        terms_accepted: true,
        pd_consent: true,
        consent_source: 'signup_email',
        pd_consent_version: LEGAL_DOCUMENT_VERSION,
      })
      setSubmitted(true)
      window.location.assign(buildCompleteUrl(searchParams.get('return_to')))
    } catch (err) {
      setGeneralError(err.message)
      setLoading(false)
    }
  }

  const handleYandex = () => {
    if (oauthStarted.current || yandexLoading) return
    if (!requireRoleAndConsent()) return
    oauthStarted.current = true
    setYandexLoading(true)
    window.location.href = getYandexOAuthUrl('signup', accountType, searchParams.get('return_to'), true, true)
  }

  const makeOnChange = (setter, field) => (e) => {
    setter(e.target.value)
    setErrors(p => ({ ...p, [field]: '' }))
    clearError()
  }

  return (
    <AuthLayout title="Создать аккаунт" subtitle="Присоединяйтесь к AGENT.ONE" error={generalError} wide>
      <form className="auth-form register-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-form-grid">
          <div className="auth-field">
            <label htmlFor="name">Имя</label>
            <input id="name" type="text" value={name} onChange={makeOnChange(setName, 'name')} placeholder="Иван" className={errors.name ? 'has-error' : ''} disabled={loading || submitted} autoComplete="name" />
            {errors.name && <span className="auth-field-error">{errors.name}</span>}
          </div>
          <div className="auth-field">
            <label htmlFor="reg-email">Email</label>
            <input id="reg-email" type="email" value={email} onChange={makeOnChange(setEmail, 'email')} placeholder="you@example.com" className={errors.email ? 'has-error' : ''} disabled={loading || submitted} autoComplete="email" />
            {errors.email && <span className="auth-field-error">{errors.email}</span>}
          </div>
          <PasswordInput id="reg-password" label="Пароль" value={password} onChange={makeOnChange(setPassword, 'password')} placeholder="••••••" error={errors.password} showStrength={password.length > 0} disabled={loading || submitted} />
          <PasswordInput id="password-confirm" label="Подтверждение пароля" value={passwordConfirm} onChange={makeOnChange(setPasswordConfirm, 'passwordConfirm')} placeholder="••••••" error={errors.passwordConfirm} disabled={loading || submitted} />
        </div>

        <div className="auth-field">
          <label>Тип аккаунта</label>
          <div className={'account-type-grid' + (errors.accountType ? ' has-error' : '')} role="radiogroup" aria-label="Тип аккаунта">
            {['client', 'business'].map(type => (
              <div
                key={type}
                className={'account-type-card' + (accountType === type ? ' selected' : '')}
                onClick={() => { setAccountType(type); setErrors(p => ({ ...p, accountType: '' })); clearError() }}
                role="radio"
                aria-checked={accountType === type}
                tabIndex={0}
              >
                <div className="account-type-card-icon">{type === 'client' ? '👤' : '🏪'}</div>
                <div className="account-type-card-label">{type === 'client' ? 'Пользователь' : 'Бизнес'}</div>
              </div>
            ))}
          </div>
          {errors.accountType && <span className="auth-field-error" role="alert">{errors.accountType}</span>}
        </div>

        <div className="auth-consent">
          <input type="checkbox" id="terms-consent" checked={termsConsent} onChange={e => { setTermsConsent(e.target.checked); setErrors(p => ({ ...p, termsConsent: '' })) }} disabled={loading || submitted} />
          <label htmlFor="terms-consent">
            Я принимаю{' '}
            <Link to="/legal/terms" target="_blank" rel="noopener noreferrer">Пользовательское соглашение</Link>
          </label>
        </div>
        {errors.termsConsent && <span className="auth-field-error" role="alert">{errors.termsConsent}</span>}

        <PersonalDataConsentField
          checked={pdConsent}
          onChange={v => { setPdConsent(v); setErrors(p => ({ ...p, pdConsent: '' })) }}
          error={errors.pdConsent}
          source="signup_email"
          LinkComponent={Link}
          useRouterLink
        />

        <button type="submit" className="auth-btn auth-btn-primary" disabled={loading || submitted || !canSubmit}>
          {loading ? 'Создаём…' : 'Создать аккаунт'}
        </button>

        <div className="auth-divider">или</div>
        <button type="button" className="auth-btn auth-btn-social" disabled={!yandexEnabled || yandexLoading || loading || submitted || !canSubmit} onClick={handleYandex}>
          {yandexLoading ? 'Перенаправление…' : 'Зарегистрироваться через Яндекс'}
        </button>
      </form>
      <div className="auth-footer">Уже есть аккаунт? <Link to="/login">Войти</Link></div>
    </AuthLayout>
  )
}
