// Next.js automatic streaming skeleton for /portal/[id]
// This renders instantly while the RSC page.tsx is fetching data from SQL Server.
// It mirrors the portal header + tab bar + content card structure so the user
// sees a properly-shaped placeholder rather than a blank screen.

export default function PortalLoading() {
  const pulse: React.CSSProperties = {
    background: 'linear-gradient(90deg, #E2E8F0 25%, #F1F5F9 50%, #E2E8F0 75%)',
    backgroundSize: '200% 100%',
    animation: 'spectra-pulse 1.4s ease-in-out infinite',
    borderRadius: '6px',
  }

  return (
    <div style={{ background: '#F1F5F9', minHeight: '100vh' }}>
      <style>{`
        @keyframes spectra-pulse {
          0% { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
      `}</style>

      {/* Header skeleton */}
      <div style={{ background: 'linear-gradient(135deg, #0D2137 0%, #1B3A5C 100%)', padding: '16px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '80px', height: '18px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px' }} />
          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ width: '120px', height: '14px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px' }} />
            <div style={{ width: '80px', height: '10px', background: 'rgba(255,255,255,0.12)', borderRadius: '4px' }} />
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ width: '60px', height: '10px', background: 'rgba(255,255,255,0.12)', borderRadius: '4px', marginBottom: '4px' }} />
            <div style={{ width: '90px', height: '20px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px' }} />
          </div>
        </div>
      </div>

      {/* Tab bar skeleton */}
      <div style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '0 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', gap: '4px' }}>
          {['Overview', 'Accounts', 'Loans', 'Cards', 'Payments'].map(tab => (
            <div key={tab} style={{ padding: '12px 16px' }}>
              <div style={{ width: `${tab.length * 7}px`, height: '13px', ...pulse }} />
            </div>
          ))}
        </div>
      </div>

      {/* Content skeleton */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Summary KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ background: 'white', borderRadius: '10px', padding: '16px 18px', border: '1px solid #E2E8F0' }}>
              <div style={{ width: '70px', height: '10px', marginBottom: '10px', ...pulse }} />
              <div style={{ width: '90px', height: '22px', marginBottom: '6px', ...pulse }} />
              <div style={{ width: '55px', height: '10px', ...pulse }} />
            </div>
          ))}
        </div>

        {/* Accounts card skeleton */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ width: '100px', height: '14px', ...pulse }} />
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ padding: '13px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0, ...pulse }} />
              <div style={{ flex: 1 }}>
                <div style={{ width: '120px', height: '13px', marginBottom: '5px', ...pulse }} />
                <div style={{ width: '80px', height: '10px', ...pulse }} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ width: '70px', height: '16px', marginBottom: '4px', ...pulse }} />
                <div style={{ width: '30px', height: '10px', ...pulse }} />
              </div>
            </div>
          ))}
        </div>

        {/* Transactions skeleton */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ width: '140px', height: '14px', ...pulse }} />
          </div>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ padding: '11px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0, ...pulse }} />
              <div style={{ flex: 1 }}>
                <div style={{ width: '110px', height: '12px', marginBottom: '4px', ...pulse }} />
                <div style={{ width: '70px', height: '10px', ...pulse }} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ width: '60px', height: '14px', marginBottom: '3px', ...pulse }} />
                <div style={{ width: '45px', height: '10px', ...pulse }} />
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
