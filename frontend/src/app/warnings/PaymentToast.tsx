'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Toast {
  id: number
  personalId: string
  previousDueDays: number | null
  previousRiskLabel: string | null
  newRiskLabel: string | null
}

function labelColor(label: string | null) {
  if (label === 'Critical') return '#ef4444'
  if (label === 'High')     return '#f97316'
  if (label === 'Medium')   return '#eab308'
  return '#10b981'
}

export default function PaymentToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const lastPollRef          = useRef(Date.now())
  const router               = useRouter()

  useEffect(() => {
    async function poll() {
      try {
        const sinceSeconds = Math.ceil((Date.now() - lastPollRef.current) / 1000) + 2
        lastPollRef.current = Date.now()
        const res  = await fetch(`/api/payment/recent?since=${sinceSeconds}`)
        const data = await res.json()
        if (data.events?.length) {
          const newToasts: Toast[] = data.events.map((e: {
            id: number
            personalId: string
            previous_due_days: number | null
            previous_risk_label: string | null
            new_risk_label: string | null
          }) => ({
            id:                e.id,
            personalId:        e.personalId,
            previousDueDays:   e.previous_due_days,
            previousRiskLabel: e.previous_risk_label,
            newRiskLabel:      e.new_risk_label,
          }))
          setToasts(prev => [...newToasts, ...prev].slice(0, 4))
          setTimeout(() => {
            setToasts(prev => prev.filter(t => !newToasts.find(n => n.id === t.id)))
          }, 8000)
        }
      } catch { /* silent */ }
    }

    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24,
      display: 'flex', flexDirection: 'column', gap: 10,
      zIndex: 9999,
    }}>
      {toasts.map(t => {
        const riskChanged = t.previousRiskLabel && t.newRiskLabel && t.previousRiskLabel !== t.newRiskLabel
        const dpdChanged  = t.previousDueDays != null && t.previousDueDays > 0

        return (
          <button
            key={t.id}
            onClick={() => {
              router.refresh()
              router.push(`/clients/${encodeURIComponent(t.personalId)}`)
            }}
            style={{
              background: 'linear-gradient(135deg, #052e16 0%, #065f46 100%)',
              border: '1px solid #10b981',
              borderLeft: '4px solid #10b981',
              borderRadius: 12,
              padding: '12px 16px',
              boxShadow: '0 4px 24px rgba(16,185,129,0.25), 0 2px 8px rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'flex-start', gap: 12,
              animation: 'toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
              minWidth: 280, maxWidth: 360,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {/* Icon */}
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(16,185,129,0.2)',
              border: '1px solid #10b98160',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, flexShrink: 0, marginTop: 2,
            }}>
              ✓
            </div>

            {/* Content */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6ee7b7', marginBottom: 3 }}>
                Payment received
              </div>
              <div style={{ fontSize: 11, color: '#34d399', marginBottom: 6 }}>
                Client <span style={{ fontFamily: 'monospace', color: '#a7f3d0', fontWeight: 700 }}>{t.personalId}</span>
              </div>

              {/* Change pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {dpdChanged && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                    background: 'rgba(16,185,129,0.15)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    borderRadius: 6, padding: '2px 7px', color: '#6ee7b7',
                  }}>
                    DPD {t.previousDueDays} → 0
                  </span>
                )}
                {riskChanged && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6, padding: '2px 7px',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <span style={{ color: labelColor(t.previousRiskLabel) }}>{t.previousRiskLabel}</span>
                    <span style={{ color: '#475569' }}>→</span>
                    <span style={{ color: labelColor(t.newRiskLabel) }}>{t.newRiskLabel}</span>
                  </span>
                )}
              </div>

              <div style={{ fontSize: 10, color: '#047857', marginTop: 6, fontWeight: 600 }}>
                Tap to view client →
              </div>
            </div>
          </button>
        )
      })}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(40px) scale(0.9); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
