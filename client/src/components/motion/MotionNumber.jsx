import { useState, useEffect, useRef } from 'react';

export default function MotionNumber({ value, className, style }) {
  const [animated, setAnimated] = useState(false);
  const prevRef = useRef(value);
  const r = useRef(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prevRef.current !== value) {
      prevRef.current = value;
      if (reduceMotion.current) return;
      setAnimated(false);
      if (r.current) { r.current.classList.remove('ao-number-animate'); void r.current.offsetWidth; r.current.classList.add('ao-number-animate'); setAnimated(true); }
    }
  }, [value]);

  return (
    <span ref={r} className={className} style={{ display: 'inline-block', ...style }}>
      {typeof value === 'number' ? value.toLocaleString('ru-RU') : value}
    </span>
  );
}
