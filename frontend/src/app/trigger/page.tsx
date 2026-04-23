'use client'

import { useState } from 'react'

const CLIENTS = [
  { personalId: '877796154', creditAccount: '877796154', name: 'Client 877796154' },
  { personalId: '193847562', creditAccount: '193847562', name: 'Arben Morina' },
  { personalId: '82861038',  creditAccount: '82861038',  name: 'Client 82861038' },
  { personalId: '51378951',  creditAccount: '51378951',  name: 'Client 51378951' },
]

interface Result {
  clientId: string
  ok: boolean
  newDueDays: number
  previousDueDays: string | number
  newStage?: number
  newRiskScore?: number
  stageChanged?: boolean
  error?: string
}

export default function TriggerPage() {
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState<string | null>(null)

  async function triggerPayment(client: typeof CLIENTS[0], newDueDays: number) {
    const key = `${client.personalId}-${newDueDays}`
    setLoading(key)
    try {
      const res = await fetch('/api/payment/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creditAccount: client.creditAccount,
          personalId: client.personalId,
          newDueDays,
        }),
      })
      const data = await res.json()
      setResults(prev => [{
        clientId: client.name,
        ok: res.ok,
        newDueDays,
        previousDueDays: data.previousDueDays ?? '?',
        newStage: data.newStage,
        newRiskScore: data.newRiskScore,
        stageChanged: data.stageChanged,
        error: data.error,
      }, ...prev.slice(0, 9)])
    } catch (e) {
      setResults(prev => [{ clientId: client.name, ok: false, newDueDays, previousDueDays: '?', error: (e as Error).message }, ...prev.slice(0, 9)])
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0D1B2A', fontFamily: 'monospace',
      padding: '40px 24px', color: '#F1F5F9',
    }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10, color: '#475569', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>
            SPECTRA · Demo Control Panel
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#C9A84C' }}>Payment Trigger</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
            Simulate payment events · Updates DPD · Broadcasts notification to all users
          </div>
        </div>

        {/* Client cards */}
        {CLIENTS.map(client => (
          <div key={client.personalId} style={{
            background: '#0F1E2D', border: '1px solid rgba(201,168,76,0.12)',
            borderRadius: 12, padding: '16px 20px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9', marginBottom: 12 }}>
              {client.name}
              <span style={{ fontSize: 10, color: '#475569', fontWeight: 400, marginLeft: 8 }}>
                {client.personalId}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'Clear Payment (0d)', dpd: 0, color: '#16A34A' },
                { label: '15 DPD',  dpd: 15, color: '#D97706' },
                { label: '30 DPD',  dpd: 30, color: '#EA580C' },
                { label: '60 DPD',  dpd: 60, color: '#DC2626' },
                { label: '90 DPD',  dpd: 90, color: '#991B1B' },
              ].map(action => {
                const key = `${client.personalId}-${action.dpd}`
                const busy = loading === key
                return (
                  <button
                    key={action.dpd}
                    onClick={() => triggerPayment(client, action.dpd)}
                    disabled={!!loading}
                    style={{
                      padding: '7px 14px', borderRadius: 7, border: `1px solid ${action.color}40`,
                      background: busy ? `${action.color}30` : `${action.color}15`,
                      color: action.color, fontSize: 11, fontWeight: 700,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading && !busy ? 0.5 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    {busy ? '...' : action.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Results log */}
        {results.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 10, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              Event Log
            </div>
            {results.map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 7, marginBottom: 6,
                background: r.ok ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
                border: `1px solid ${r.ok ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}`,
                fontSize: 11,
              }}>
                <span style={{ color: r.ok ? '#16A34A' : '#DC2626', fontWeight: 700 }}>
                  {r.ok ? '✓' : '✗'}
                </span>
                <span style={{ color: '#94A3B8', flex: 1 }}>{r.clientId}</span>
                <span style={{ color: '#F1F5F9' }}>
                  DPD: {r.previousDueDays}d → <strong>{r.newDueDays}d</strong>
                </span>
                {r.newRiskScore != null && (
                  <span style={{ color: '#94A3B8', fontSize: 10 }}>
                    Risk: <strong style={{ color: '#C9A84C' }}>{r.newRiskScore}</strong>
                  </span>
                )}
                {r.newStage != null && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                    background: r.newStage === 3 ? '#7F1D1D' : r.newStage === 2 ? '#78350F' : '#14532D',
                    color: r.newStage === 3 ? '#FCA5A5' : r.newStage === 2 ? '#FCD34D' : '#86EFAC',
                  }}>
                    Stage {r.newStage}{r.stageChanged ? ' ↑' : ''}
                  </span>
                )}
                {r.error && <span style={{ color: '#FCA5A5', fontSize: 10 }}>{r.error}</span>}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 32, fontSize: 10, color: '#1E293B', textAlign: 'center' }}>
          /trigger · not linked from nav
        </div>
      </div>
    </div>
  )
}
