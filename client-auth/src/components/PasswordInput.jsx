import { useState } from 'react'

export default function PasswordInput({ value, onChange, placeholder, label, error, id, showStrength, disabled }) {
  const [visible, setVisible] = useState(false)

  const strength = showStrength ? computeStrength(value) : null

  return (
    <div className="auth-field">
      {label && <label htmlFor={id}>{label}</label>}
      <div className="password-wrapper">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={error ? 'has-error' : ''}
          disabled={disabled}
          autoComplete={id === 'password' ? 'current-password' : id === 'password-confirm' ? 'new-password' : 'off'}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible(v => !v)}
          tabIndex={-1}
          aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        >
          {visible ? eyeOffIcon : eyeIcon}
        </button>
      </div>
      {error && <span className="auth-field-error">{error}</span>}
      {showStrength && strength && (
        <div className="password-strength">
          <div className="password-strength-bar">
            <div
              className="password-strength-fill"
              style={{ width: strength.percent + '%', background: strength.color }}
            />
          </div>
          <div className="password-strength-label">{strength.label}</div>
          <ul className="password-requirements">
            <li className={value.length >= 6 ? 'met' : ''}>
              {value.length >= 6 ? '✓' : '○'} Минимум 6 символов
            </li>
            <li className={/[A-Z]/.test(value) ? 'met' : ''}>
              {/[A-Z]/.test(value) ? '✓' : '○'} Заглавная буква
            </li>
            <li className={/[a-z]/.test(value) ? 'met' : ''}>
              {/[a-z]/.test(value) ? '✓' : '○'} Строчная буква
            </li>
            <li className={/\d/.test(value) ? 'met' : ''}>
              {/\d/.test(value) ? '✓' : '○'} Цифра
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}

function computeStrength(pw) {
  let score = 0
  if (pw.length >= 6) score += 25
  if (pw.length >= 10) score += 15
  if (/[A-Z]/.test(pw)) score += 20
  if (/[a-z]/.test(pw)) score += 15
  if (/\d/.test(pw)) score += 15
  if (/[^A-Za-z0-9]/.test(pw)) score += 10

  let label, color
  if (score <= 25) { label = 'Слабый'; color = '#dc2626' }
  else if (score <= 50) { label = 'Средний'; color = '#f59e0b' }
  else if (score <= 75) { label = 'Хороший'; color = '#10b981' }
  else { label = 'Надёжный'; color = '#059669' }

  return { percent: Math.min(score, 100), label, color }
}

const eyeIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

const eyeOffIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)
