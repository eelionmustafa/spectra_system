'use client'

import { useEffect, useRef, useState } from 'react'

interface Toast { id: number; personalId: string }

export default function PaymentToast() {
  const [toasts, setToasts]   = useState<Toast[]>([])
  const lastSeenRef            = useRef(new Date().toISOString())

  useEffect(() => {
    async function poll() {
      try {
        const res  = await fetch(`/api/payment/recent?since=${encodeURIComponent(lastSeenRef.current)}`)
        const data = await res.json()
        if (data.events?.length) {
          lastSeenRef.current = data.events[0].paid_at
          const newToasts: Toast[] = data.events.map((e: { id: number; personalId: string }) => ({
            id: e.id,
            personalId: e.personalId,
          }))
          setToasts(prev => [...newToasts, ...prev].slice(0, 4))
          // Auto-dismiss after 6s
          setTimeout(() => {
            setToasts(prev => prev.filter(t => !newToasts.find(n => n.id === t.id)))
          }, 6000)
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
      zIndex: 9999, pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: 'linear-gradient(135deg, #052e16 0%, #065f46 100%)',
          border: '1px solid #10b981',
          borderLeft: '4px solid #10b981',
          borderRadius: 12,
          padding: '12px 18px',
          boxShadow: '0 4px 24px rgba(16,185,129,0.25), 0 2px 8px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 12,
          animation: 'toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
          minWidth: 260, maxWidth: 340,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(16,185,129,0.2)',
            border: '1px solid #10b98160',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0,
          }}>
            ✓
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6ee7b7' }}>Payment received</div>
            <div style={{ fontSize: 11, color: '#34d399', marginTop: 1 }}>
              Client <span style={{ fontFamily: 'monospace', color: '#a7f3d0', fontWeight: 700 }}>{t.personalId}</span> cleared their balance
            </div>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(40px) scale(0.9); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
