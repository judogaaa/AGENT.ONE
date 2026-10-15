/* ─── Chat Component ─── */
import { useState, useRef, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import BrandMark from './BrandMark';
import AgentIcon from './AgentIcon';

export default function Chat() {
  const s = useStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const msgsRef = useRef(null);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = 99999;
  }, [s.chatMessages]);

  const send = async () => {
    if (!input.trim() || !s.currentShop) return;
    const msg = input;
    setInput('');
    setLoading(true);
    try {
      await s.sendChat(msg);
    } catch (e) {
      s.setChatMessages([...s.chatMessages, { role: 'assistant', content: 'Ошибка: ' + e.message }]);
    }
    setLoading(false);
  };

  const suggestions = [
    'Что есть в наличии?',
    'Какие цены?',
    'Как оформить заказ?',
    'Есть ли скидки?',
  ];

  if (!s.currentShop) return null;

  return (
    <>
      {/* Toggle Button - только если чат закрыт */}
      {!s.chatOpen && (
        <div
          onClick={() => s.setChatOpen(true)}
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${s.currentShop.color || '#111'}, ${s.currentShop.color || '#111'}dd)`,
            color: '#fff',
            fontSize: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 6px 24px rgba(0,0,0,.18)',
            zIndex: 999,
            transition: 'transform .2s',
          }}
        >
           <AgentIcon name="chat" size={22} />
        </div>
      )}

      {/* Chat Panel */}
      {s.chatOpen && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 400,
          height: 560,
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 12px 48px rgba(0,0,0,.15)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp .3s ease-out',
        }}>
          {/* Header */}
          <div style={{
            padding: '18px 20px',
            background: `linear-gradient(135deg, ${s.currentShop.color || '#111'}, ${s.currentShop.color || '#111'}dd)`,
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'rgba(255,255,255,.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}>
                <BrandMark size={36} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>AI-продавец</div>
                <div style={{ fontSize: 12, opacity: .8 }}>{s.currentShop.name}</div>
              </div>
            </div>
            <button
              onClick={() => s.setChatOpen(false)}
              style={{ fontSize: 20, color: 'rgba(255,255,255,.8)', cursor: 'pointer', border: 'none', background: 'none', padding: 4 }}
            >
              <AgentIcon name="x" size={18} />
            </button>
          </div>

          {/* Messages */}
          <div ref={msgsRef} style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: '#f8f9fa',
          }}>
            {s.chatMessages.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: 30 }}>
                <div style={{ marginBottom: 12 }}><AgentIcon name="chat" size={32} muted /></div>
                <div style={{ color: '#333', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Чем могу помочь?</div>
                <div style={{ color: '#999', fontSize: 13, marginBottom: 20 }}>Спросите о товарах, ценах или заказе</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {suggestions.map((text, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(text); }}
                      style={{
                        padding: '8px 16px',
                        background: '#fff',
                        border: '1px solid #e0e0e0',
                        borderRadius: 999,
                        fontSize: 12,
                        color: '#555',
                        cursor: 'pointer',
                        transition: 'all .2s',
                      }}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {s.chatMessages.map((m, i) => (
              <div key={i} style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
              }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: m.role === 'user' ? '#e8e8e8' : `linear-gradient(135deg, ${s.currentShop.color || '#111'}, ${s.currentShop.color || '#111'}dd)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  color: m.role === 'user' ? '#555' : '#fff',
                  flexShrink: 0,
                }}>
                  {m.role === 'user' ? <AgentIcon name="user" size={20} /> : <BrandMark size={28} />}
                </div>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: 16,
                  fontSize: 14,
                  lineHeight: 1.5,
                  maxWidth: '75%',
                  background: m.role === 'user' ? '#e8e8e8' : '#fff',
                  color: '#111',
                  border: m.role === 'user' ? 'none' : '1px solid #e8e8e8',
                  borderBottomRightRadius: m.role === 'user' ? 4 : 16,
                  borderBottomLeftRadius: m.role === 'user' ? 16 : 4,
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <BrandMark size={28} />
                <div style={{
                  padding: '14px 18px', borderRadius: 16, fontSize: 14, background: '#fff',
                  border: '1px solid #e8e8e8', borderBottomLeftRadius: 4,
                }}>
                  <span style={{ display: 'inline-flex', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ccc', animation: 'bounce .6s infinite' }}></span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ccc', animation: 'bounce .6s infinite .2s' }}></span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ccc', animation: 'bounce .6s infinite .4s' }}></span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: '14px 16px', borderTop: '1px solid #eee', background: '#fff' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') send(); }}
                placeholder="Напишите сообщение..."
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: '1px solid #e0e0e0',
                  borderRadius: 999,
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border .2s',
                }}
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${s.currentShop.color || '#111'}, ${s.currentShop.color || '#111'}dd)`,
                  color: '#fff',
                  fontSize: 16,
                  cursor: 'pointer',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: loading || !input.trim() ? .5 : 1,
                  transition: 'opacity .2s',
                }}
              >
                <AgentIcon name="arrow-right" size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: .4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}
