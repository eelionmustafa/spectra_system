export default function Loading() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`@keyframes sk-pulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>

      {/* Profile header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 18px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#E2E8F0', animation: 'sk-pulse 1.4s ease-in-out infinite', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: 180, height: 14, background: '#E2E8F0', borderRadius: 4, marginBottom: 6, animation: 'sk-pulse 1.4s ease-in-out infinite' }} />
          <div style={{ width: 120, height: 10, background: '#EEF2F7', borderRadius: 3, animation: 'sk-pulse 1.4s ease-in-out 0.1s infinite' }} />
        </div>
        <div style={{ width: 72, height: 40, background: '#E2E8F0', borderRadius: 7, animation: 'sk-pulse 1.4s ease-in-out 0.2s infinite' }} />
      </div>

      {/* KPI strip skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', padding: '8px 18px', background: '#F8FAFC', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 7, padding: '8px 12px', border: '1px solid var(--border)', borderLeft: '3px solid #E2E8F0' }}>
            <div style={{ width: 64, height: 8, background: '#E2E8F0', borderRadius: 2, marginBottom: 6, animation: `sk-pulse 1.4s ease-in-out ${i * 0.07}s infinite` }} />
            <div style={{ width: 44, height: 20, background: '#EEF2F7', borderRadius: 3, animation: `sk-pulse 1.4s ease-in-out ${i * 0.07}s infinite` }} />
          </div>
        ))}
      </div>

      {/* Tab + content skeleton */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: '41px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '2px', padding: '0 18px' }}>
            {['Overview', 'EWI Signals', 'Alerts', 'AI Insights', 'Actions Log'].map(t => (
              <div key={t} style={{ padding: '10px 14px', fontSize: '11.5px', color: 'var(--muted)', animation: 'sk-pulse 1.4s ease-in-out infinite' }}>{t}</div>
            ))}
          </div>
          <div style={{ flex: 1, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ background: 'white', borderRadius: 8, padding: '12px', border: '1px solid var(--border)', animation: `sk-pulse 1.4s ease-in-out ${i * 0.1}s infinite` }}>
                <div style={{ width: 100, height: 10, background: '#E2E8F0', borderRadius: 3, marginBottom: 10 }} />
                <div style={{ width: '100%', height: 80, background: '#F8FAFC', borderRadius: 5 }} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ width: 196, borderLeft: '1px solid var(--border)', padding: '14px 12px', background: 'white' }}>
          <div style={{ width: 60, height: 8, background: '#E2E8F0', borderRadius: 2, marginBottom: 8, animation: 'sk-pulse 1.4s ease-in-out infinite' }} />
          <div style={{ width: 80, height: 20, background: '#EEF2F7', borderRadius: 3, animation: 'sk-pulse 1.4s ease-in-out 0.1s infinite' }} />
        </div>
      </div>
    </div>
  )
}
