'use client'

import { useState } from 'react'

export default function ResetButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')

  async function handleReset() {
    setState('loading')
    await fetch('/api/payment/demo-reset', { method: 'POST' })
    setState('done')
    setTimeout(() => setState('idle'), 3000)
  }

  return (
    <button onClick={handleReset} disabled={state === 'loading'} style={{
      background: state === 'done' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
      border: state === 'done' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
      color: state === 'done' ? '#10b981' : '#64748b',
      borderRadius: 10, padding: '8px 18px',
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
      transition: 'all 0.2s',
    }}>
      {state === 'loading' ? 'Resetting…' : state === 'done' ? '✓ Reset done' : '↺ Reset client assignments'}
    </button>
  )
}
