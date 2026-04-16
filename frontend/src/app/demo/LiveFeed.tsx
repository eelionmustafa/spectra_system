'use client'

import { useEffect, useRef, useState } from 'react'

interface FeedEvent {
  id: number
  personalId: string
  previousDueDays: number | null
  previousRiskLabel: string | null
  newRiskLabel: string | null
  paidAt?: string
}

function labelColor(label: string | null | undefined) {
  if (label === 'Critical') return '#ef4444'
  if (label === 'High')     return '#f97316'
  if (label === 'Medium')   return '#eab308'
  return '#10b981'
}

export default function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const lastPollRef = useRef(Date.now())

  useEffect(() => {
    async function poll() {
      try {
        const sinceSeconds = Math.ceil((Date.now() - lastPollRef.current) / 1000) + 2
        lastPollRef.current = Date.now()
        const res  = await fetch(`/api/payment/recent?since=${sinceSeconds}`)
        const data = await res.json()
        if (data.events?.length) {
          const newEvts: FeedEvent[] = data.events.map((e: {
            id: number; personalId: string
            previous_due_days: number | null; previous_risk_label: string | null; new_risk_label: string | null
          }) => ({
            id: e.id, personalId: e.personalId,
            previousDueDays: e.previous_due_days,
            previousRiskLabel: e.previous_risk_label,
            newRiskLabel: e.new_risk_label,
            paidAt: new Date().toLocaleTimeString(),
          }))
          setEvents(prev => [...newEvts, ...prev].slice(0, 5))
        }
      } catch { /* silent */ }
    }

    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      padding: '16px 18px',
      width: 300,
      minHeight: 80,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: '#10b981', display: 'inline-block',
          boxShadow: '0 0 6px #10b981',
          animation: 'livePulse 2s ease-in-out infinite',
        }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#8FA3B8', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Live Payments
        </span>
      </div>

      {events.length === 0 ? (
        <div style={{ fontSize: 12, color: '#334155', textAlign: 'center', padding: '8px 0' }}>
          Waiting for audience payments…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map((e, i) => {
            const bClr = labelColor(e.previousRiskLabel)
            const aClr = labelColor(e.newRiskLabel)
            return (
              <div
                key={e.id}
                style={{
                  background: i === 0 ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${i === 0 ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 10,
                  padding: '9px 12px',
                  animation: i === 0 ? 'feedIn 0.4s cubic-bezier(0.34,1.2,0.64,1)' : undefined,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', fontFamily: 'monospace' }}>
                    {e.personalId}
                  </div>
                  {e.previousDueDays != null && (
                    <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                      DPD {e.previousDueDays} → 0
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: bClr }}>{e.previousRiskLabel}</span>
                  <span style={{ fontSize: 11, color: '#334155' }}>→</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: aClr }}>{e.newRiskLabel}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes feedIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
