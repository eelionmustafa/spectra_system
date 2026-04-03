'use client'

import { useState } from 'react'

export default function SeedSalaryButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [seeded, setSeeded] = useState<string[]>([])

  async function handleSeed() {
    setState('loading')
    try {
      const res  = await fetch('/api/demo/salary-seed', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSeeded(data.seeded ?? [])
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <button onClick={handleSeed} disabled={state === 'loading' || state === 'done'} style={{
        background: state === 'done' ? 'rgba(16,185,129,0.15)' : 'rgba(201,168,76,0.1)',
        border: state === 'done' ? '1px solid #10b981' : '1px solid rgba(201,168,76,0.3)',
        color: state === 'done' ? '#10b981' : '#C9A84C',
        borderRadius: 10, padding: '8px 18px',
        fontSize: 12, fontWeight: 600, cursor: state === 'loading' || state === 'done' ? 'default' : 'pointer',
        transition: 'all 0.2s',
      }}>
        {state === 'loading' ? 'Scheduling…' : state === 'done' ? `✓ Salary seeded (${seeded.length} clients)` : state === 'error' ? '✗ Failed — retry' : '💰 Seed April 7 salaries'}
      </button>
      {state === 'done' && seeded.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 10, color: '#4A6A8A', fontFamily: 'monospace' }}>
          {seeded.join(' · ')}
        </div>
      )}
    </div>
  )
}
