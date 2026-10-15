// AGENT.ONE unified premium badge system
// Replaces all old colorful inline pill styles across the project.

const VARIANTS = {
  neutral:    { bg: '#f8fafc', border: '#e5e7eb', color: '#475569' },
  dark:       { bg: '#0b0f19', border: '#0b0f19', color: '#ffffff' },
  success:    { bg: '#f4f7f6', border: '#dbe6e0', color: '#2d5a3f' },
  warning:    { bg: '#faf7f2', border: '#ebe2cf', color: '#6b4d1a' },
  danger:     { bg: '#faf4f4', border: '#eed9d9', color: '#7a2828' },
  info:       { bg: '#f6f7fa', border: '#e1e5ec', color: '#3d4f6c' },
  muted:      { bg: '#f9fafb', border: '#e5e7eb', color: '#98a2b3' },
  ai:         { bg: '#f8fafc', border: '#d1d5db', color: '#374151' },
};

export const STATUS = VARIANTS;

export default function StatusBadge({ variant = 'neutral', size = 'md', children, style }) {
  const v = VARIANTS[variant] || VARIANTS.neutral;

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    borderRadius: 999,
    border: `1px solid ${v.border}`,
    background: v.bg,
    color: v.color,
    lineHeight: 1,
  };

  const sizeStyles = {
    sm: { fontSize: 11, padding: '3px 7px' },
    md: { fontSize: 12, padding: '4px 9px' },
  };

  return <span style={{ ...baseStyle, ...(sizeStyles[size] || sizeStyles.md), ...style }}>{children}</span>;
}
