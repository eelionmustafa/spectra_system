'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function RefreshButton() {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function handleRefresh() {
    setState('loading')
    try {
      await fetch('/api/infra/cache-invalidate', { method: 'POST' })
      router.refresh()
      setState('done')
      setTimeout(() => setState('idle'), 4000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  const styleMap: Record<typeof state, React.CSSProperties> = {
    idle:    { background: '#F4F7FA', color: 'var(--navy)',  borderColor: 'var(--border)' },
    loading: { background: '#F4F7FA', color: 'var(--muted)', borderColor: 'var(--border)' },
    done:    { background: '#EAF9F2', color: 'var(--green)', borderColor: 'var(--border)' },
    error:   { background: '#FEF0F0', color: 'var(--red)',   borderColor: '#FECACA' },
  }

  const labelMap: Record<typeof state, string> = {
    idle:    '⟳ Refresh data',
    loading: '⟳ Refreshing…',
    done:    '✓ Refreshed',
    error:   '✕ Refresh failed',
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
      <button
        onClick={handleRefresh}
        disabled={state === 'loading'}
        title="Force-refresh all cached data from the database"
        style={{
          fontSize: '9px', padding: '3px 9px', borderRadius: '5px',
          border: `1px solid ${styleMap[state].borderColor}`,
          cursor: state === 'loading' ? 'default' : 'pointer',
          background: styleMap[state].background,
          color: styleMap[state].color,
          fontFamily: 'var(--font)', transition: 'all 0.15s',
        }}
      >
        {labelMap[state]}
      </button>
      {state === 'error' && (
        <span style={{ fontSize: '9px', color: 'var(--red)', fontFamily: 'var(--font)' }}>
          Could not reach server. Try again.
        </span>
      )}
    </div>
  )
}
