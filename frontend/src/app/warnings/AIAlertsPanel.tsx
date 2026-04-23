'use client'

import { useState } from 'react'
import Link from 'next/link'
import { fmt } from '@/lib/formatters'
import type { DPDTrajectoryClient } from '@/lib/queries'

interface AIAlert {
  client_id:          string
  urgency:            'Critical' | 'High' | 'Medium'
  headline:           string
  trajectory_summary: string
  recommended_action: string
  client:             DPDTrajectoryClient
}

interface AIAlertsResult {
  alerts:             AIAlert[]
  portfolio_note:     string | null
  analysed_at:        string
  candidates_scanned: number
}

const U = {
  Critical: { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626', badge: 'br' },
  High:     { bg: '#FFFBEB', border: '#FCD34D', color: '#D97706', badge: 'ba' },
  Medium:   { bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8', badge: 'bb' },
} as const

function TrajBar({ values }: { values: (number | null)[] }) {
  const max = Math.max(...values.filter((v): v is number => v !== null), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 36 }}>
      {values.map((v, i) => {
        const h = v != null ? Math.max(4, Math.round((v / max) * 28)) : 4
        const isNow = i === values.length - 1
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 8, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              {v != null ? `${v}d` : '—'}
            </span>
            <div style={{
              width: 14, height: h,
              background: isNow ? '#DC2626' : v != null ? '#93C5FD' : '#E5E7EB',
              borderRadius: 2,
            }} />
          </div>
        )
      })}
    </div>
  )
}

export default function AIAlertsPanel() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<AIAlertsResult | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function runAnalysis() {
    setStatus('loading')
    setErrMsg(null)
    try {
      const res  = await fetch('/api/ai/deterioration-alerts', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
      setResult(data)
      setStatus('done')
    } catch (e) {
      setErrMsg((e as Error).message)
      setStatus('error')
    }
  }

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div className="panel" style={{
        padding: '16px 20px', marginBottom: 12,
        background: 'linear-gradient(135deg, #0D1B2A 0%, #162840 100%)', color: 'white',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 4 }}>
              AI Deterioration Alerts
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 4 }}>
              Trajectory-based early warning
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, maxWidth: 480 }}>
              AI scans DPD trends over the last 3 weekly snapshots and flags clients heading toward default —
              before they cross the 90-day threshold.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            <button
              onClick={runAnalysis}
              disabled={status === 'loading'}
              style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: status === 'loading' ? 'rgba(201,168,76,0.4)' : 'var(--gold)',
                color: '#0D1B2A', fontWeight: 700, fontSize: 12,
                cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
              }}
            >
              {status === 'loading' ? (
                <>
                  <span style={{
                    display: 'inline-block', width: 11, height: 11,
                    border: '2px solid rgba(13,27,42,0.4)', borderTopColor: '#0D1B2A',
                    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                  }} />
                  Analysing…
                </>
              ) : status === 'done' ? 'Re-analyse' : 'Run AI Analysis'}
            </button>
            {result && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>
                Scanned {result.candidates_scanned} clients ·{' '}
                {new Date(result.analysed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {status === 'error' && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>
          {errMsg}
        </div>
      )}

      {/* Loading */}
      {status === 'loading' && (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Analysing portfolio trajectories…
          </div>
          <div style={{ fontSize: 11 }}>
            AI is scanning DPD trends across active clients. This takes 10–20 seconds.
          </div>
        </div>
      )}

      {/* Results */}
      {status === 'done' && result && (
        <>
          {result.portfolio_note && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 12,
              background: '#F0F9FF', border: '1px solid #BAE6FD',
              fontSize: 12, color: '#0C4A6E', lineHeight: 1.6,
            }}>
              <strong>Portfolio observation:</strong> {result.portfolio_note}
            </div>
          )}

          {result.alerts.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>
              No significant deterioration trajectories detected. Portfolio looks stable.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {result.alerts.length} client{result.alerts.length !== 1 ? 's' : ''} flagged for immediate attention
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.alerts.map((alert, i) => {
                  const u = U[alert.urgency] ?? U.Medium
                  const c = alert.client
                  return (
                    <div key={i} style={{
                      borderRadius: 8, border: `1px solid ${u.border}`,
                      borderLeft: `4px solid ${u.color}`, background: u.bg, padding: '12px 16px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>

                        {/* Identity + mini chart */}
                        <div style={{ flex: '0 0 auto', minWidth: 110 }}>
                          <Link href={`/clients/${c.personal_id}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', textDecoration: 'none', display: 'block', lineHeight: 1.3 }}>
                            {c.full_name}
                          </Link>
                          <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', marginBottom: 8 }}>
                            {c.personal_id}
                          </div>
                          <TrajBar values={[c.dpd_3w, c.dpd_2w, c.dpd_1w, c.dpd_now]} />
                          <div style={{ fontSize: 8, color: 'var(--muted)', marginTop: 2 }}>3wk ago → now</div>
                        </div>

                        {/* AI analysis */}
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7, flexWrap: 'wrap' }}>
                            <span className={`badge ${u.badge}`}>{alert.urgency}</span>
                            <span className="badge bb">{c.stage}</span>
                            <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                              DPD: {c.dpd_now}d (+{c.dpd_delta}d)
                            </span>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4, lineHeight: 1.5 }}>
                            {alert.headline}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, lineHeight: 1.5, fontStyle: 'italic' }}>
                            {alert.trajectory_summary}
                          </div>
                          <div style={{ fontSize: 11, color: u.color, fontWeight: 600 }}>
                            Recommended: {alert.recommended_action}
                          </div>
                        </div>

                        {/* Exposure + link */}
                        <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
                          <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Exposure</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--mono)' }}>
                            {fmt(c.exposure)}
                          </div>
                          <Link href={`/clients/${c.personal_id}`} style={{
                            display: 'inline-block', marginTop: 8, fontSize: 10, fontWeight: 600,
                            color: u.color, textDecoration: 'none', padding: '4px 10px',
                            borderRadius: 6, background: 'white', border: `1px solid ${u.border}`,
                            whiteSpace: 'nowrap',
                          }}>
                            Review →
                          </Link>
                        </div>

                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
