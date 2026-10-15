import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const LAYER_STYLE = {
  position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 2147483000,
};

function getGhostSize(rect) {
  const w = Math.min(150, Math.max(100, rect.width));
  const ratio = rect.height > 0 ? rect.height / rect.width : 1;
  return { width: w, height: Math.max(80, Math.min(150, w * ratio)) };
}

export default function FlyToCartLayer({ ghosts, onComplete }) {
  if (!ghosts || ghosts.length === 0) return null;
  return createPortal(
    <div style={LAYER_STYLE}>
      {ghosts.map(g => <GhostItem key={g.id} ghost={g} onComplete={onComplete} />)}
    </div>,
    document.body
  );
}

function GhostItem({ ghost, onComplete }) {
  const ref = useRef(/** @type {HTMLImageElement | null} */ (null));
  const [imgFailed, setImgFailed] = useState(false);

  const { sourceRect, targetRect, imageUrl } = ghost;
  const srcX = sourceRect.left + sourceRect.width / 2;
  const srcY = sourceRect.top + sourceRect.height / 2;
  const tgtX = targetRect.left + targetRect.width / 2;
  const tgtY = targetRect.top + targetRect.height / 2;
  const deltaX = tgtX - srcX;
  const deltaY = tgtY - srcY;
  const distance = Math.hypot(deltaX, deltaY);
  const arcHeight = Math.min(240, Math.max(110, distance * 0.24));
  const size = getGhostSize(sourceRect);

  // Inline styles — applied BEFORE useLayoutEffect runs
  const ghostStyle = {
    position: 'fixed',
    left: `${srcX - size.width / 2}px`,
    top: `${srcY - size.height / 2}px`,
    width: `${size.width}px`,
    height: `${size.height}px`,
    minWidth: `${size.width}px`,
    minHeight: `${size.height}px`,
    maxWidth: 'none',
    display: 'block',
    opacity: 1,
    visibility: 'visible',
    pointerEvents: 'none',
    objectFit: 'contain',
    zIndex: 2147483001,
    transformOrigin: 'center center',
    willChange: 'transform, opacity',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    background: '#fff',
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame1, frame2, animation;

    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        animation = el.animate(
          [
            { transform: 'translate3d(0px, 0px, 0px) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
            { transform: `translate3d(${deltaX * 0.16}px, ${deltaY * 0.16 - arcHeight * 0.55}px, 0px) scale(1.02) rotate(2deg)`, opacity: 1, offset: 0.2 },
            { transform: `translate3d(${deltaX * 0.55}px, ${deltaY * 0.55 - arcHeight}px, 0px) scale(0.82) rotate(5deg)`, opacity: 1, offset: 0.55 },
            { transform: `translate3d(${deltaX * 0.82}px, ${deltaY * 0.82 - arcHeight * 0.42}px, 0px) scale(0.5) rotate(-3deg)`, opacity: 0.9, offset: 0.82 },
            { transform: `translate3d(${deltaX}px, ${deltaY}px, 0px) scale(0.08) rotate(-8deg)`, opacity: 0, offset: 1 },
          ],
          { duration: 1100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
        );

        animation.finished.then(() => onComplete(ghost.id)).catch(() => {});
        const safety = setTimeout(() => onComplete(ghost.id), 3000);
        return () => { clearTimeout(safety); };
      });
    });

    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      if (animation) animation.cancel();
    };
  }, [ghost.id, onComplete, deltaX, deltaY, arcHeight]);

  if (imgFailed || !imageUrl) {
    return (
      <div ref={ref} aria-hidden="true" data-fly-to-cart-ghost="true"
        style={{ position: 'fixed', zIndex: 2147483001, pointerEvents: 'none', width: 80, height: 80, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 9h18M9 3v18"/>
        </svg>
      </div>
    );
  }

  return (
    <img ref={ref} src={imageUrl} alt="" aria-hidden="true"
      style={ghostStyle} data-fly-to-cart-ghost="true"
      onError={() => setImgFailed(true)} />
  );
}
