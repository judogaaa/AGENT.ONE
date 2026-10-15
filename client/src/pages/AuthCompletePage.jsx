import { useEffect, useState } from 'react'
import { useStore } from '../hooks/useStore'
import { buildLoginUrl, buildRegisterUrl, validateReturnTo } from '../utils/authUrl'
import { requiresBusinessOnboarding } from '../store'

const styles = {
  container: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    minHeight: '60vh', padding: '40px 20px',
  },
  card: {
    background: '#fff', borderRadius: 16, padding: '48px 40px',
    maxWidth: 420, width: '100%', textAlign: 'center',
    boxShadow: '0 2px 20px rgba(0,0,0,0.08)',
  },
  title: { fontSize: 22, fontWeight: 600, marginBottom: 12, color: '#111' },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 24, lineHeight: 1.5 },
  btn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: '12px 28px', borderRadius: 10, fontSize: 15,
    fontWeight: 500, border: 'none', cursor: 'pointer',
    transition: 'all 0.2s', textDecoration: 'none',
  },
  btnPrimary: { background: '#111', color: '#fff' },
  btnSecondary: { background: '#f5f5f5', color: '#333', marginLeft: 12 },
  actions: { display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' },
  spinner: {
    display: 'inline-block', width: 24, height: 24,
    border: '3px solid #eee', borderTop: '3px solid #111',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
    marginBottom: 16,
  },
}

const errorMessages = {
  oauth_cancelled: 'Вход через Яндекс отменён.',
  oauth_state_invalid: 'Не удалось подтвердить авторизацию. Попробуйте войти ещё раз.',
  oauth_expired: 'Время авторизации истекло. Попробуйте ещё раз.',
  oauth_provider_error: 'Яндекс временно не смог выполнить авторизацию.',
  oauth_not_linked: 'Этот Яндекс ID ещё не связан с аккаунтом. Перейдите к регистрации.',
  oauth_yandex_not_linked: 'Этот аккаунт Яндекса ещё не зарегистрирован в AGENT.ONE. Перейдите к регистрации и создайте аккаунт.',
  oauth_email_required: 'Яндекс не предоставил email, необходимый для регистрации.',
  oauth_account_exists: 'Аккаунт с таким email уже существует. Войдите обычным способом.',
  oauth_unavailable: 'Вход через Яндекс временно недоступен.',
  oauth_state_invalid_or_expired: 'Сессия авторизации истекла или недействительна. Попробуйте ещё раз.',
}

const allowlistedCodes = new Set(Object.keys(errorMessages))

// Errors that point the user to registration: the primary action is
// «Создать аккаунт», and «Вернуться ко входу» is the secondary one.
const registerFocusedErrors = new Set([
  'oauth_not_linked',
  'oauth_yandex_not_linked',
])

function getGenericError() {
  return 'Не удалось выполнить вход. Попробуйте ещё раз.'
}

export default function AuthCompletePage() {
  const s = useStore()
  const [state, setState] = useState('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [returnTo, setReturnTo] = useState('/')
  const [errorCode, setErrorCode] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const rawReturnTo = params.get('return_to') || '/'
    const safe = validateReturnTo(rawReturnTo)
    setReturnTo(safe)

    const errorCode = params.get('error')
    if (errorCode) {
      const msg = allowlistedCodes.has(errorCode)
        ? errorMessages[errorCode]
        : getGenericError()
      setErrorCode(errorCode)
      setErrorMsg(msg)
      setState('error')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
        if (cancelled) return
        if (r.status === 401) {
          setState('expired')
          return
        }
        if (!r.ok) {
          setState('error')
          setErrorMsg('Ошибка сервера. Попробуйте позже.')
          return
        }
        const d = await r.json()
        if (!d.ok) {
          setState('error')
          setErrorMsg('Ошибка сервера. Попробуйте позже.')
          return
        }
        if (cancelled) return
        s.setUser(d.data.profile, d.data.token)
        const needsOnboarding = requiresBusinessOnboarding(d.data.profile)
        window.location.replace(needsOnboarding ? '/#/business/onboarding' : safe)
      } catch (e) {
        if (cancelled) return
        setState('error')
        setErrorMsg('Не удалось связаться с сервером. Проверьте подключение.')
      }
    })()

    return () => { cancelled = true }
  }, [])

  if (state === 'loading') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ ...styles.spinner, margin: '0 auto 16px' }} />
          <div style={styles.title}>Завершаем вход…</div>
          <div style={styles.subtitle}>Пожалуйста, подождите</div>
        </div>
      </div>
    )
  }

  if (state === 'expired') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.title}>Сессия истекла</div>
          <div style={styles.subtitle}>
            Время действия ссылки истекло. Пожалуйста, войдите заново.
          </div>
          <div style={styles.actions}>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={() => window.location.assign(buildLoginUrl(returnTo))}
            >
              Вернуться ко входу
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    const registerFocused = registerFocusedErrors.has(errorCode)
    const primary = registerFocused ? buildRegisterUrl(returnTo) : buildLoginUrl(returnTo)
    const secondary = registerFocused ? buildLoginUrl(returnTo) : buildRegisterUrl(returnTo)
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.title}>Ошибка</div>
          <div style={styles.subtitle}>{errorMsg}</div>
          <div style={styles.actions}>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary }}
              onClick={() => window.location.assign(secondary)}
            >
              {registerFocused ? 'Вернуться ко входу' : 'Зарегистрироваться'}
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={() => window.location.assign(primary)}
            >
              {registerFocused ? 'Создать аккаунт' : 'Вернуться ко входу'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
