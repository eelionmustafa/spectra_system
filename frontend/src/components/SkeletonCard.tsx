export default function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ background: 'var(--navy2)', borderRadius: '12px', padding: '20px', animation: 'pulse 1.5s ease-in-out infinite' }}>
      <div style={{ height: '14px', background: 'var(--navy3)', borderRadius: '4px', width: '33%', marginBottom: '16px' }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ height: '11px', background: 'var(--navy3)', borderRadius: '4px', marginBottom: '8px', width: i === lines - 1 ? '66%' : '100%' }} />
      ))}
    </div>
  )
}
