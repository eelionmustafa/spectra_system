export default function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0 2px' }}>
      <div style={{ width: '3px', height: '16px', background: 'var(--gold)', borderRadius: '2px', flexShrink: 0 }} />
      <div>
        <span style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--navy)', fontWeight: 700 }}>{title}</span>
        {sub && <span style={{ fontSize: '9px', color: 'var(--muted)', marginLeft: '8px' }}>{sub}</span>}
      </div>
      <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
    </div>
  )
}
