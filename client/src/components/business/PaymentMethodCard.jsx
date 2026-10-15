export default function PaymentMethodCard({ title, description, checked, onChange, disabled }) {
  return (
    <div
      onClick={disabled ? undefined : () => onChange(!checked)}
      style={{
        background: '#fff', border: checked ? '1.5px solid #0b0f19' : '1px solid #e5e7eb',
        borderRadius: 18, padding: '14px 16px', cursor: disabled ? 'default' : 'pointer',
        transition: 'border-color .15s', display: 'flex', alignItems: 'flex-start', gap: 14,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div
        style={{
          width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
          background: checked ? '#0b0f19' : '#fff', border: checked ? 'none' : '1.5px solid #d1d5db',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background .15s, border-color .15s',
        }}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: disabled ? '#98a2b3' : '#0b0f19' }}>{title}</div>
        {description && <div style={{ fontSize: 12, color: '#667085', marginTop: 3, lineHeight: 1.45 }}>{description}</div>}
      </div>
      {!disabled && (
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, flexShrink: 0,
          background: checked ? '#ecfdf5' : '#f8fafc', color: checked ? '#065f46' : '#98a2b3',
          border: `1px solid ${checked ? '#ecfdf5' : '#e5e7eb'}`,
        }}>
          {checked ? 'Включено' : 'Выключено'}
        </span>
      )}
      {disabled && (
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, flexShrink: 0,
          background: '#f9fafb', color: '#9ca3af', border: '1px solid #e5e7eb',
        }}>
          Скоро
        </span>
      )}
    </div>
  );
}
