const icons = {
  'document':    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  'pencil':      'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z M15 5l4 4',
  'credit-card': 'M1 5a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z M1 10h22',
  'robot':       'M12 2v4 M9 6h6 M8 10h.01 M16 10h.01 M8 14h8 M5 22h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z',
  'checklist':   'M9 5H21 M9 12H21 M9 19H21 M5 5h.01 M5 12h.01 M5 19h.01',
  'calendar':    'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18',
  'sync':        'M21.5 2.5v5h-5 M2.5 21.5v-5h5 M2 12a10 10 0 0 1 18.36-5.64 M2.32 16.36A10 10 0 0 0 22 12',
  'box':         'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12',
  'lock':        'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4',
  'store':       'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  'truck':       'M1 3h15v13h-15z M16 8h4l3 3v5h-7z M5.5 18.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18.5 18.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  'shield':      'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  'star':        'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.86L12 17.77l-6.18 3.23L7 14.14 2 9.27l6.91-1.01z',
  'search':      'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M21 21l-4.35-4.35',
  'user':        'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'chevron-down':'M6 9l6 6 6-6',
  'check':        'M20 6L9 17l-5-5',
  'x':            'M18 6L6 18 M6 6l12 12',
  'cart':         'M1 3h2l.5 3H21l-2 8H6.2L5 6 M7 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  'chat':         'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  'arrow-right':  'M5 12h14 M12 5l7 7-7 7',
  'grid':         'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  'list':         'M4 6h16 M4 12h16 M4 18h16',
  'alert':        'M12 9v4 M12 17h.01 M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z',
  'compare':      'M8 7h12m0 0l-4-4m4 4l-4 4 M16 17H4m0 0l4 4m-4-4l4-4',
  'heart':        'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  'heart-filled': 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
};

export default function AgentIcon({ name, size = 20, className, muted, filled }) {
  const d = icons[name];
  if (!d) return null;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ display:'block', flexShrink:0, opacity: muted ? 0.6 : 1 }}
      aria-hidden="true"
    >
      {d.split(' M').map((p, i) => <path key={i} d={i === 0 ? p : 'M' + p} />)}
    </svg>
  );
}
