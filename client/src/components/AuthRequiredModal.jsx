import { useStore } from '../hooks/useStore';
import BrandMark from './BrandMark';
import { buildLoginUrl, buildRegisterUrl, getCurrentRelativePath } from '../utils/authUrl';

export default function AuthRequiredModal() {
  const s = useStore();

  if (!s.authModal) return null;

  const handleLogin = () => {
    s.clearPendingAction();
    s.closeAuthModal();
    window.location.assign(buildLoginUrl(getCurrentRelativePath()));
  };

  const handleRegister = () => {
    s.clearPendingAction();
    s.closeAuthModal();
    window.location.assign(buildRegisterUrl(getCurrentRelativePath()));
  };

  const handleGuest = () => {
    s.clearPendingAction();
    s.closeAuthModal();
  };

  return (
    <div
      onClick={handleGuest}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 24, padding: 40,
          maxWidth: 400, width: '90%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.12)',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <BrandMark size={56} />
        </div>

        <div style={{ fontSize: 24, fontWeight: 700, color: '#0b0f19', marginBottom: 10, letterSpacing: '-0.02em' }}>
          Войдите в AGENT.ONE
        </div>

        <div style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5, marginBottom: 28 }}>
          Чтобы использовать эту функцию, необходимо войти в аккаунт или создать новый.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={handleLogin}
            style={{
              width: '100%', padding: '13px 0', background: '#0b0f19', color: '#fff',
              borderRadius: 999, fontSize: 15, fontWeight: 600,
              cursor: 'pointer', border: 'none',
            }}
          >
            Войти
          </button>

          <button
            onClick={handleRegister}
            style={{
              width: '100%', padding: '13px 0', background: '#fff', color: '#0b0f19',
              borderRadius: 999, fontSize: 15, fontWeight: 600,
              cursor: 'pointer', border: '1px solid #e5e7eb',
            }}
          >
            Зарегистрироваться
          </button>
        </div>

        <button
          onClick={handleGuest}
          style={{
            marginTop: 18, background: 'none', border: 'none',
            fontSize: 14, color: '#9ca3af', cursor: 'pointer',
          }}
        >
          Продолжить как гость
        </button>
      </div>
    </div>
  );
}
