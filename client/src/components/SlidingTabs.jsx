import { useRef, useEffect, useState, useCallback } from 'react';
import './SlidingTabs.css';

export default function SlidingTabs({ tabs = [], value, onChange, size, className, ariaLabel }) {
  const containerRef = useRef(null);
  const [pillStyle, setPillStyle] = useState({});
  const [snap, setSnap] = useState(true);

  const updatePill = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector('.ao-sliding-tabs__tab--active');
    if (!activeBtn) return;
    setPillStyle({
      transform: `translateX(${activeBtn.offsetLeft - 4}px)`,
      width: `${activeBtn.offsetWidth}px`,
    });
  }, []);

  useEffect(() => {
    setSnap(true);
    updatePill();
    const frame = requestAnimationFrame(() => setSnap(false));
    return () => cancelAnimationFrame(frame);
  }, [value, tabs]);

  useEffect(() => {
    const onResize = () => { setSnap(true); updatePill(); requestAnimationFrame(() => setSnap(false)); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updatePill]);

  return (
    <div
      ref={containerRef}
      className={`ao-sliding-tabs${size === 'sm' ? ' ao-sliding-tabs--sm' : ''}${className ? ' ' + className : ''}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      <div className={`ao-sliding-tabs__pill${snap ? ' ao-sliding-tabs__pill--snap' : ''}`} style={pillStyle} />
      {tabs.map(t => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          className={`ao-sliding-tabs__tab${value === t.value ? ' ao-sliding-tabs__tab--active' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
