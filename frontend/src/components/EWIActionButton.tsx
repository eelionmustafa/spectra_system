'use client'

import { useState } from 'react'

interface Props {
  recommendationId: string
  initialActioned?: boolean
}

export default function EWIActionButton({ recommendationId, initialActioned = false }: Props) {
  const [actioned, setActioned]   = useState(initialActioned)
  const [loading, setLoading]     = useState(false)

  if (actioned) {
    return (
      <span style={{
        fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '5px',
        background: 'rgba(20,83,45,0.25)', color: 'var(--green)', display: 'inline-flex',
        alignItems: 'center', gap: '4px',
      }}>
        ✓ Actioned
      </span>
    )
  }

  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true)
        try {
          const res = await fetch(`/api/ewi/recommendations/${recommendationId}`, {
            method: 'PATCH',
          })
          if (res.ok) setActioned(true)
        } catch { /* silent */ } finally {
          setLoading(false)
        }
      }}
      style={{
        fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '5px',
        border: '1px solid var(--border)', background: loading ? 'rgba(255,255,255,0.04)' : 'var(--card)',
        color: loading ? 'var(--muted)' : 'var(--text)', cursor: loading ? 'default' : 'pointer',
        fontFamily: 'var(--font)',
      }}
    >
      {loading ? 'Saving…' : 'Mark as Actioned'}
    </button>
  )
}
