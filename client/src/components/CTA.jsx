import { buildRegisterUrl } from '../utils/authUrl'

export default function CTA() {
  return (
    <section style={{ padding: '80px 0', textAlign: 'center' }}>
      <div style={{ background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', borderRadius: 30, padding: '60px 40px', color: '#fff' }}>
        <h2 style={{ fontSize: 'clamp(24px,4vw,36px)', fontWeight: 800, letterSpacing: '-.03em', marginBottom: 12 }}>Готовы начать?</h2>
        <p style={{ fontSize: 16, opacity: .9, marginBottom: 30 }}>Присоединяйтесь к бизнесам, которые уже продают с AI</p>
        <button style={{ background: '#fff', color: '#111', padding: '16px 32px', borderRadius: 999, fontSize: 16, fontWeight: 700, cursor: 'pointer', border: 'none' }} onClick={() => window.location.assign(buildRegisterUrl())}>
          Создать аккаунт бесплатно →
        </button>
      </div>
    </section>
  );
}
