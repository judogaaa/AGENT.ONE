import { useState, useRef, useEffect } from 'react';
import AgentIcon from '../AgentIcon';

export default function MotionMorphMenu({ trigger, items = [] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    const handleEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleEsc);
    return () => { document.removeEventListener('click', handleClick, true); document.removeEventListener('keydown', handleEsc); };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(o => !o)}
        style={{ padding: '10px 22px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#0b0f19', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}
      >
        {trigger}
        <span style={{ fontSize: 9, transition: 'transform 200ms var(--ao-ease-out)', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-flex' }}>
          <AgentIcon name="chevron-down" size={12} muted />
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 50,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18,
            boxShadow: '0 12px 40px rgba(0,0,0,0.08)', padding: 6, minWidth: 200,
          }}
          className="ao-panel-reveal"
        >
          {items.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => { item.onClick(); setOpen(false); }}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 12,
                border: 'none', background: 'transparent', color: '#374151',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <AgentIcon name={item.icon} size={15} muted />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
