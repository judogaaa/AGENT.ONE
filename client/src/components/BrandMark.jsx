import brandMarkSrc from '../assets/brand-mark.png';

export default function BrandMark({ size = 32, className, style }) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: size < 32 ? 8 : 12,
        background: '#fff',
        border: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      <img
        src={brandMarkSrc}
        alt="AGENT.ONE"
        width={size}
        height={size}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
    </div>
  );
}
