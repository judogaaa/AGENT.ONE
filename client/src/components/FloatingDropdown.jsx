import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * FloatingDropdown — stable portal-based dropdown.
 * Renders into document.body with position: fixed.
 * Positioned under the trigger button via getBoundingClientRect().
 * Clamped to viewport edges. Does NOT push page content.
 */
export default function FloatingDropdown({ trigger, children, width, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Position calculation when opening
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const w = width || 240;
    let left = rect.left;
    // Clamp right
    if (left + w > window.innerWidth - 8) {
      left = window.innerWidth - w - 8;
    }
    // Clamp left
    if (left < 8) left = 8;
    const top = rect.bottom + 6;
    setPos({ top, left, w });
  }, [open, width]);

  // Click outside + Escape + scroll close
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      const target = e.target;
      if (!target || !(target instanceof Node)) return;
      if (triggerRef.current && !triggerRef.current.contains(target) &&
          dropdownRef.current && !dropdownRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        e.preventDefault();
        setOpen(false);
      }
    };
    const handleScroll = () => setOpen(false);
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  const dropdownStyle = {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    width: pos.w,
    zIndex: 9999,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    boxShadow: '0 12px 30px rgba(15,23,42,.08)',
    maxHeight: Math.min(420, window.innerHeight - pos.top - 12),
    overflow: 'auto',
  };

  return (
    <>
      <div ref={triggerRef} style={{ flexShrink: 0 }}>
        <div onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer' }}>
          {typeof trigger === 'function' ? trigger({ open }) : trigger}
        </div>
      </div>
      {open && createPortal(
        <div ref={dropdownRef} style={dropdownStyle}>
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>,
        document.body
      )}
    </>
  );
}
