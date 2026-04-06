'use client'

import { useState } from 'react'

interface Props { personalId: string }

export default function PayButton({ personalId }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

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
      setState('done')
      // Reload after 2s so the server re-reads the updated DueDays → new risk score
      setTimeout(() => window.location.reload(), 2000)
    } catch (e) {
      setErrMsg((e as Error).message)
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #052e16 0%, #064e3b 100%)',
        border: '1px solid #10b981',
        borderRadius: 14,
        padding: '16px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, marginBottom: 4 }}>✓</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#6ee7b7' }}>Payment received!</div>
        <div style={{ fontSize: 11, color: '#34d399', marginTop: 3 }}>Risk score will update shortly</div>
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
