'use client'

import { useState } from 'react'

interface Props {
  personalId: string
}

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
    } catch (e) {
      setErrMsg((e as Error).message)
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div style={{
        background: '#065f46',
        border: '1px solid #10b981',
        borderRadius: 12,
        padding: '14px 20px',
        textAlign: 'center',
        fontSize: 18,
        fontWeight: 700,
        color: '#6ee7b7',
        letterSpacing: 0.5,
      }}>
        Payment received!
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#fca5a5', fontSize: 13, marginBottom: 8 }}>{errMsg}</div>
        <button
          onClick={() => setState('idle')}
          style={{
            background: '#374151',
            color: '#f1f5f9',
            border: 'none',
            borderRadius: 10,
            padding: '12px 28px',
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Retry
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
        background: state === 'loading' ? '#1d4ed8' : '#2563eb',
        color: '#fff',
        border: 'none',
        borderRadius: 12,
        padding: '16px 0',
        fontSize: 17,
        fontWeight: 700,
        cursor: state === 'loading' ? 'not-allowed' : 'pointer',
        letterSpacing: 0.3,
        transition: 'background 0.15s',
      }}
    >
      {state === 'loading' ? 'Processing...' : 'Pay Now'}
    </button>
  )
}
