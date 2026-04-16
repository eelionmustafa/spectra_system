'use client'

import { useState } from 'react'

interface Props {
  personalId: string
  beforeScore?: number
  beforeLabel?: string | null
  beforeDpd?: number
  clientName?: string | null
}

interface PayResult {
  newRiskScore: number
  newRiskLabel: string
  previousDueDays: number | null
}

function labelColor(label: string | null | undefined) {
  if (label === 'Critical') return '#ef4444'
  if (label === 'High')     return '#f97316'
  if (label === 'Medium')   return '#eab308'
  return '#10b981'
}

function labelBg(label: string | null | undefined) {
  if (label === 'Critical') return 'rgba(239,68,68,0.12)'
  if (label === 'High')     return 'rgba(249,115,22,0.12)'
  if (label === 'Medium')   return 'rgba(234,179,8,0.10)'
  return 'rgba(16,185,129,0.10)'
}

export default function PayButton({ personalId, beforeScore, beforeLabel, beforeDpd, clientName }: Props) {
  const [state,   setState]   = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result,  setResult]  = useState<PayResult | null>(null)
  const [errMsg,  setErrMsg]  = useState('')

  async function handlePay() {
    setState('loading')
    try {
      const res = await fetch('/api/payment/demo-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalId, newDueDays: 0 }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Payment failed')
      }
      const data = await res.json()
      setResult({
        newRiskScore:    data.newRiskScore,
        newRiskLabel:    data.newRiskLabel,
        previousDueDays: data.previousDueDays,
      })
      setState('done')
    } catch (e) {
      setErrMsg((e as Error).message)
      setState('error')
    }
  }

  if (state === 'done' && result) {
    const beforePct  = beforeScore != null ? Math.round(beforeScore * 100) : null
    const afterPct   = Math.round(result.newRiskScore * 100)
    const beforeClr  = labelColor(beforeLabel)
    const afterClr   = labelColor(result.newRiskLabel)
    const improved   = beforePct != null && afterPct < beforePct

    return (
      <div style={{ animation: 'fadeUp 0.4s cubic-bezier(0.34,1.2,0.64,1)' }}>

        {/* Success banner */}
        <div style={{
          background: 'linear-gradient(135deg, #052e16 0%, #064e3b 100%)',
          border: '1px solid #10b981',
          borderRadius: 14,
          padding: '14px 16px',
          textAlign: 'center',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 26, marginBottom: 4 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#6ee7b7' }}>Payment received!</div>
          {clientName && (
            <div style={{ fontSize: 12, color: '#34d399', marginTop: 2 }}>{clientName}</div>
          )}
        </div>

        {/* Before → After */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: '14px 16px',
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1.5, textTransform: 'uppercase', textAlign: 'center', marginBottom: 12 }}>
            Risk Impact
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>

            {/* Before */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Before</div>
              {beforePct != null && (
                <div style={{
                  background: labelBg(beforeLabel),
                  border: `1px solid ${beforeClr}40`,
                  borderRadius: 10,
                  padding: '10px 8px',
                }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: beforeClr, lineHeight: 1, fontFamily: 'monospace' }}>
                    {beforePct}<span style={{ fontSize: 12 }}>%</span>
                  </div>
                  <div style={{ fontSize: 10, color: beforeClr, fontWeight: 700, marginTop: 3 }}>{beforeLabel}</div>
                  {beforeDpd != null && beforeDpd > 0 && (
                    <div style={{ fontSize: 9, color: '#475569', marginTop: 4 }}>{beforeDpd}d overdue</div>
                  )}
                </div>
              )}
            </div>

            {/* Arrow */}
            <div style={{ fontSize: 20, color: improved ? '#10b981' : '#475569', flexShrink: 0 }}>
              {improved ? '→' : '→'}
            </div>

            {/* After */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>After</div>
              <div style={{
                background: labelBg(result.newRiskLabel),
                border: `1px solid ${afterClr}40`,
                borderRadius: 10,
                padding: '10px 8px',
                boxShadow: `0 0 16px ${afterClr}25`,
              }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: afterClr, lineHeight: 1, fontFamily: 'monospace' }}>
                  {afterPct}<span style={{ fontSize: 12 }}>%</span>
                </div>
                <div style={{ fontSize: 10, color: afterClr, fontWeight: 700, marginTop: 3 }}>{result.newRiskLabel}</div>
                <div style={{ fontSize: 9, color: '#475569', marginTop: 4 }}>0d overdue</div>
              </div>
            </div>

          </div>

          {/* Summary line */}
          {improved && beforePct != null && (
            <div style={{
              marginTop: 12,
              padding: '7px 10px',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 8,
              fontSize: 11,
              color: '#34d399',
              textAlign: 'center',
              fontWeight: 600,
            }}>
              Risk dropped {beforePct - afterPct} points — SPECTRA updated instantly
            </div>
          )}
        </div>

        <div style={{ fontSize: 10, color: '#1e3a5f', textAlign: 'center' }}>
          This client will reset automatically for the next demo
        </div>

        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#fca5a5', fontSize: 12, marginBottom: 10 }}>{errMsg}</div>
        <button onClick={() => setState('idle')} style={{
          width: '100%', background: '#1e293b', color: '#94a3b8',
          border: '1px solid #334155', borderRadius: 12,
          padding: '14px', fontSize: 14, cursor: 'pointer', fontWeight: 600,
        }}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handlePay}
      disabled={state === 'loading'}
      style={{
        width: '100%',
        background: state === 'loading'
          ? 'rgba(16,185,129,0.15)'
          : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
        color: state === 'loading' ? '#34d399' : '#fff',
        border: state === 'loading' ? '1px solid #10b98140' : 'none',
        borderRadius: 14,
        padding: '16px',
        fontSize: 16,
        fontWeight: 800,
        cursor: state === 'loading' ? 'not-allowed' : 'pointer',
        letterSpacing: 0.3,
        transition: 'all 0.2s',
        boxShadow: state === 'loading' ? 'none' : '0 4px 16px rgba(16,185,129,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      {state === 'loading' ? (
        <>
          <span style={{
            width: 14, height: 14, borderRadius: '50%',
            border: '2px solid #34d39940', borderTop: '2px solid #34d399',
            display: 'inline-block', animation: 'spin 0.7s linear infinite',
          }} />
          Processing…
        </>
      ) : (
        <>💳 Pay Now</>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  )
}
