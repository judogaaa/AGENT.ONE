/* ─── Demo Chat ─── */
import { useState, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import BrandMark from './BrandMark';
import AgentIcon from './AgentIcon';

export default function DemoChat() {
  const s = useStore();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 1000);
    const t2 = setTimeout(() => setStep(2), 2000);
    const t3 = setTimeout(() => setStep(3), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <section style={{ padding: '80px 0', background: '#f8f9fa', borderRadius: 40, margin: '0 20px 60px' }}>
      <h2 style={{ textAlign: 'center', fontSize: 'clamp(24px,4vw,36px)', fontWeight: 800, letterSpacing: '-.03em', marginBottom: 40 }}>Попробуйте прямо сейчас</h2>
      <div style={{ maxWidth: 600, margin: '0 auto', background: '#fff', border: '1px solid #e8e8e8', borderRadius: 20, padding: 30, boxShadow: '0 8px 32px rgba(0,0,0,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <BrandMark size={32} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '.06em' }}>AI-ассистент</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: '14px 18px', borderRadius: 16, fontSize: 14, maxWidth: '80%', background: '#111', color: '#fff', alignSelf: 'flex-end', borderBottomRightRadius: 6 }}>
            Хочу машину до 1.5 млн, не старше 2018
          </div>
          {step >= 1 && (
            <div style={{ padding: '14px 18px', borderRadius: 16, fontSize: 14, maxWidth: '80%', background: '#f5f5f5', color: '#111', alignSelf: 'flex-start', borderBottomLeftRadius: 6 }}>
              <div style={{ display: 'inline-flex', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#999', animation: 'blink 1s infinite' }}></span>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#999', animation: 'blink 1s .2s infinite' }}></span>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#999', animation: 'blink 1s .4s infinite' }}></span>
              </div>
            </div>
          )}
          {step >= 2 && (
            <div style={{ padding: '14px 18px', borderRadius: 16, fontSize: 14, maxWidth: '80%', background: '#f5f5f5', color: '#111', alignSelf: 'flex-start', borderBottomLeftRadius: 6 }}>
              Нашёл 3 варианта! Kia Rio 2019 за 1.13 млн — 1 владелец, 82 тыс. км. Hyundai Solaris 2018 за 980 тыс. Какой пробег тебе комфортен?
            </div>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 28 }}>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 14 }}>Напишите, что ищете — AI подберёт товары, сравнит варианты и поможет оформить заказ.</p>
        <button onClick={() => { s.setPage('assistant'); window.location.hash = '#/assistant'; }} style={{ padding: '14px 30px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 15, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Открыть AI-ассистента</button>
      </div>
    </section>
  );
}
