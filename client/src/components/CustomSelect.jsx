import { useState, useRef, useEffect } from 'react';
import AgentIcon from './AgentIcon';

export default function CustomSelect({ value, onChange, options, placeholder, disabled, className }) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const ref = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex(o => o.value === value);
    setActiveIdx(idx >= 0 ? idx : 0);
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    if (rect.bottom > vh - 8) {
      menuRef.current.style.top = 'auto';
      menuRef.current.style.bottom = 'calc(100% + 6px)';
    }
  }, [open]);

  const selected = options.find(o => o.value === value);

  const select = (val) => {
    onChange({ target: { value: val } });
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIdx(i => Math.min(i + 1, options.length - 1)); break;
      case 'ArrowUp': e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); break;
      case 'Enter': case ' ':
        e.preventDefault();
        if (activeIdx >= 0 && activeIdx < options.length) select(options[activeIdx].value);
        break;
      case 'Escape': e.preventDefault(); setOpen(false); break;
    }
  };

  return (
    <div className={className} ref={ref} tabIndex={disabled ? -1 : 0} onKeyDown={handleKeyDown} style={{ position:'relative', userSelect:'none', outline:'none' }}>
      <div onClick={() => !disabled && setOpen(o => !o)}
        style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
          height:36, padding:'0 12px', borderRadius:14, border:'1px solid '+(open?'#d1d5db':'#e5e7eb'),
          background:disabled?'#f9fafb':'#fff', cursor:disabled?'default':'pointer',
          fontSize:13, color: selected ? '#111827' : '#9ca3af',
          opacity: disabled ? 0.6 : 1, boxSizing:'border-box',
        }}
      >
        <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {selected ? selected.label : (placeholder || '')}
        </span>
        <AgentIcon name="chevron-down" size={12} muted />
      </div>
      {open && (
        <div ref={menuRef} style={{
          position:'absolute', top:'calc(100% + 6px)', left:0, right:0, minWidth:'100%', zIndex:1100,
          background:'#fff', border:'1px solid #e5e7eb', borderRadius:14,
          boxShadow:'0 8px 32px rgba(15,23,42,.08)', padding:6,
          maxHeight:260, overflowY:'auto',
        }}>
          {options.map((o, i) => (
            <div key={o.value ?? i} onClick={() => select(o.value)} onMouseEnter={() => setActiveIdx(i)}
              style={{
                padding:'8px 12px', borderRadius:10, cursor:'pointer', fontSize:13,
                fontWeight: o.value === value ? 600 : 400,
                color: o.value === value ? '#0b0f19' : '#374151',
                background: o.value === value ? '#f8fafc' : i === activeIdx ? '#f9fafb' : 'transparent',
              }}
            >{o.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}
