export default function PaymentStatusCard({ icon, value, label, sub, style }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 6, ...style,
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#0b0f19', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', lineHeight: 1.35 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: '#667085', lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}
