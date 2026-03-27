'use client'
import { useState } from 'react'

export default function DashboardLoading() {
  // Pre-generate random heights once to avoid calling Math.random() during render
  const [barHeights] = useState(() =>
    Array.from({ length: 12 }, () => 20 + Math.random() * 70)
  )

  const pulse: React.CSSProperties = {
    background: 'linear-gradient(90deg, #EEF2F7 25%, #E2E8F0 50%, #EEF2F7 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.4s infinite',
    borderRadius: '6px',
  }

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      {/* Topbar */}
      <div style={{ height: '52px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '12px' }}>
        <div style={{ ...pulse, width: '140px', height: '16px' }} />
        <div style={{ ...pulse, width: '80px', height: '11px', marginLeft: '8px' }} />
      </div>

      <div className="content">

        {/* Health banner */}
        <div style={{ background: 'var(--navy)', borderRadius: '12px', padding: '20px 24px', display: 'flex', gap: '32px', alignItems: 'center' }}>
          <div style={{ minWidth: '180px' }}>
            <div style={{ ...pulse, background: 'rgba(255,255,255,0.08)', width: '120px', height: '10px', marginBottom: '10px' }} />
            <div style={{ ...pulse, background: 'rgba(255,255,255,0.12)', width: '80px', height: '36px', marginBottom: '10px' }} />
            <div style={{ ...pulse, background: 'rgba(255,255,255,0.06)', width: '180px', height: '5px' }} />
          </div>
          <div style={{ width: '1px', height: '54px', background: 'rgba(255,255,255,0.07)' }} />
          {[100, 72, 56, 56, 60].map((w, i) => (
            <div key={i} style={{ minWidth: '72px' }}>
              <div style={{ ...pulse, background: 'rgba(255,255,255,0.07)', width: `${w}px`, height: '9px', marginBottom: '8px' }} />
              <div style={{ ...pulse, background: 'rgba(255,255,255,0.12)', width: `${w - 20}px`, height: '20px' }} />
            </div>
          ))}
        </div>

        {/* KPI cards */}
        <div className="row4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="kcard" style={{ borderLeft: '3px solid var(--border)' }}>
              <div style={{ ...pulse, width: '100px', height: '11px', marginBottom: '10px' }} />
              <div style={{ ...pulse, width: '70px', height: '28px', marginBottom: '8px' }} />
              <div style={{ ...pulse, width: '120px', height: '9px', marginBottom: '8px' }} />
              <div style={{ ...pulse, width: '60px', height: '18px', borderRadius: '10px' }} />
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="row2">
          <div className="panel">
            <div style={{ ...pulse, width: '180px', height: '13px', marginBottom: '16px' }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '110px' }}>
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ ...pulse, width: '100%', height: `${barHeights[i]}px`, borderRadius: '3px 3px 0 0' }} />
                </div>
              ))}
            </div>
          </div>
          <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ ...pulse, width: '120px', height: '120px', borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ ...pulse, width: '10px', height: '10px', borderRadius: '3px', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ ...pulse, width: '80px', height: '11px', marginBottom: '5px' }} />
                    <div style={{ ...pulse, width: '120px', height: '9px' }} />
                  </div>
                  <div style={{ ...pulse, width: '50px', height: '20px', borderRadius: '5px' }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="row2">
          <div className="panel">
            <div style={{ ...pulse, width: '160px', height: '13px', marginBottom: '16px' }} />
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ display: 'flex', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ ...pulse, width: '80px', height: '11px' }} />
                <div style={{ ...pulse, width: '60px', height: '11px' }} />
                <div style={{ ...pulse, width: '70px', height: '11px' }} />
                <div style={{ ...pulse, width: '60px', height: '11px' }} />
                <div style={{ ...pulse, width: '50px', height: '18px', borderRadius: '10px' }} />
              </div>
            ))}
          </div>
          <div className="panel">
            <div style={{ ...pulse, width: '100px', height: '13px', marginBottom: '14px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ ...pulse, height: '88px', borderRadius: '8px' }} />
              ))}
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
