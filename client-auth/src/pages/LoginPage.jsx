import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import PasswordInput from '../components/PasswordInput'
import { signin, buildCompleteUrl, getYandexOAuthUrl, fetchProviders, validateReturnTo } from '../utils/auth'

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [generalError, setGeneralError] = useState('')
  const [yandexEnabled, setYandexEnabled] = useState(true)
  const [yandexLoading, setYandexLoading] = useState(false)
  // Synchronous guard: a double click must never fire two OAuth redirects.
  // State updates are async, so a ref is checked and set before any redirect.
  const oauthStarted = useRef(false)

  useEffect(() => {
    fetchProviders().then(providers => {
      const yp = providers.find(p => p.id === 'yandex')
      if (yp) setYandexEnabled(yp.enabled)
    })
  }, [])

  useEffect(() => {
    document.title = 'AGENT.ONE — Вход'
  }, [])

  const clearError = () => setGeneralError('')

  const validate = () => {
    const e = {}
    if (!email.trim()) e.email = 'Укажите email'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Некорректный email'
    if (!password) e.password = 'Введите пароль'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGeneralError('')
    if (!validate()) return
    setLoading(true)
    try {
      await signin(email.trim(), password)
      setSubmitted(true)
      const returnTo = searchParams.get('return_to')
      window.location.assign(buildCompleteUrl(returnTo))
    } catch (err) {
      setGeneralError(err.message)
      setLoading(false)
    }
  }

  // The registration link is opened only by an explicit user action and only
  // opens /register. It never carries the email, the password, a role or
  // terms_accepted — no automatic signup, no account probing.
  const safeReturnTo = validateReturnTo(searchParams.get('return_to'))
  const registerPath = safeReturnTo && safeReturnTo !== '/'
    ? '/register?return_to=' + encodeURIComponent(safeReturnTo)
    : '/register'
  const registerAction = generalError ? (
    <Link className="auth-btn auth-btn-secondary auth-btn-block" to={registerPath}>Создать аккаунт</Link>
  ) : null

  const onFieldChange = (setter) => (e) => {
    setter(e.target.value)
    setErrors(p => ({ ...p, [e.target.id?.replace('reg-', '') || 'email']: '' }))
    clearError()
  }

  const startYandex = () => {
    if (oauthStarted.current || yandexLoading || loading || submitted) return
    oauthStarted.current = true
    setYandexLoading(true)
    const returnTo = searchParams.get('return_to')
    window.location.href = getYandexOAuthUrl('login', '', returnTo)
  }

  return (
    <AuthLayout
      title="Войти"
      subtitle="Войдите в аккаунт AGENT.ONE"
      error={generalError}
      errorAction={registerAction}
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={onFieldChange(setEmail)}
            placeholder="you@example.com"
            className={errors.email ? 'has-error' : ''}
            disabled={loading || submitted}
            autoComplete="email"
          />
          {errors.email && <span className="auth-field-error">{errors.email}</span>}
        </div>

        <PasswordInput
          id="password"
          label="Пароль"
          value={password}
          onChange={onFieldChange(setPassword)}
          placeholder="••••••"
          error={errors.password}
          disabled={loading || submitted}
        />

        <div className="auth-row">
          <label>
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              disabled={loading || submitted}
            />
            Запомнить меня
          </label>
          <span className="auth-link coming-soon" title="Скоро">Забыли пароль?</span>
        </div>

        <button
          type="submit"
          className="auth-btn auth-btn-primary"
          disabled={loading || submitted}
        >
          {loading ? 'Вход…' : 'Войти'}
        </button>

        <div className="auth-divider">или</div>

        <button
          type="button"
          className="auth-btn auth-btn-social"
          disabled={!yandexEnabled || yandexLoading || loading || submitted}
          onClick={startYandex}
        >
          {yandexLoading ? 'Перенаправление…' : 'Продолжить с Яндексом'}
        </button>
      </form>

      <div className="auth-footer">
        Нет аккаунта? <Link to={registerPath}>Создать аккаунт</Link>
      </div>
    </AuthLayout>
  )
}
