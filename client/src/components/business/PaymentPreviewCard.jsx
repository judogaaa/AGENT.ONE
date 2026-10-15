import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_TILT = 7;
const GLARE_OPACITY = 0.10;

export default function PaymentPreviewCard() {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const [reduceMotion, setReduceMotion] = useState(false);
  const cardRef = useRef(null);
  const rafRef = useRef(null);
  const targetRef = useRef({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const currentRef = useRef({ rx: 0, ry: 0, gx: 50, gy: 50 });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const handler = (e) => setReduceMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const animate = useCallback(() => {
    const c = currentRef.current;
    const t = targetRef.current;
    c.rx += (t.rx - c.rx) * 0.12;
    c.ry += (t.ry - c.ry) * 0.12;
    c.gx += (t.gx - c.gx) * 0.12;
    c.gy += (t.gy - c.gy) * 0.12;
    setTilt({ rx: c.rx, ry: c.ry, gx: c.gx, gy: c.gy });
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (reduceMotion || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    targetRef.current = {
      rx: (y - 0.5) * 2 * -MAX_TILT,
      ry: (x - 0.5) * 2 * MAX_TILT,
      gx: x * 100,
      gy: y * 100,
    };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(animate);
  }, [reduceMotion, animate]);

  const handleMouseEnter = useCallback(() => {
    if (reduceMotion) return;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(animate);
  }, [reduceMotion, animate]);

  const handleMouseLeave = useCallback(() => {
    targetRef.current = { rx: 0, ry: 0, gx: 50, gy: 50 };
    const timer = setTimeout(() => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const transform = reduceMotion
    ? 'none'
    : `perspective(800px) rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)`;

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        width: 260, height: 160, borderRadius: 18, position: 'relative', overflow: 'hidden',
        transform, transformStyle: 'preserve-3d', transition: reduceMotion ? 'none' : 'transform 0.1s ease-out',
        cursor: 'default', flexShrink: 0,
        background: 'linear-gradient(135deg, #1a1d23 0%, #272b33 40%, #1f2228 100%)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        userSelect: 'none',
      }}
    >
      {/* Glare */}
      {!reduceMotion && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
          background: `radial-gradient(circle at ${tilt.gx.toFixed(0)}% ${tilt.gy.toFixed(0)}%, rgba(255,255,255,${GLARE_OPACITY}) 0%, transparent 60%)`,
        }} />
      )}

      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 1, padding: '20px 22px', height: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        boxSizing: 'border-box',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 18 }}>
            AGENT.ONE PAY
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', gap: 3 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4b5563' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4b5563' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4b5563' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4b5563' }} />
              </div>
            ))}
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb', fontFamily: 'monospace', letterSpacing: 1 }}>
              0000
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Скоро
        </div>
      </div>
    </div>
  );
}
