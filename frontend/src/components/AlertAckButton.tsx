'use client'
import { useState, useEffect } from 'react'

interface Props {
  creditId: string
  personalId: string
  initialAck?: { action: string; acknowledged_by: string; acknowledged_at: string } | null
}

const ACTION_LABELS: Record<string, string> = {
  reviewed:      '✓ Reviewed',
  actioned:      '⚡ Actioned',
  false_positive: '✗ False positive',
}

const ACTION_COLORS: Record<string, string> = {
  reviewed:      '#065F46',
  actioned:      '#1E40AF',
  false_positive: '#6B7280',
}

const ACTION_BG: Record<string, string> = {
  reviewed:      '#D1FAE5',
  actioned:      '#DBEAFE',
  false_positive: '#F3F4F6',
}

export default function AlertAckButton({ creditId, personalId, initialAck }: Props) {
  const [ack, setAck] = useState(initialAck ?? null)
  const [open, setOpen] = useState(false)

  // Sync when parent re-renders with a new initialAck (e.g. after page refresh or server re-render)
  useEffect(() => {
    setAck(initialAck ?? null)
  }, [initialAck])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(action: 'reviewed' | 'actioned' | 'false_positive') {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/alerts/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credit_id: creditId, personal_id: personalId, action }),
      })
      if (!res.ok) throw new Error('Server error')
      const data = await res.json() as { ack: { action: string; acknowledged_by: string; acknowledged_at: string } }
      setAck(data.ack)
      setOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (ack) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
        <span style={{
          fontSize: '9px', padding: '2px 8px', borderRadius: '10px',
          background: ACTION_BG[ack.action] ?? '#F3F4F6',
          color: ACTION_COLORS[ack.action] ?? '#6B7280',
          fontWeight: 600,
        }}>
          {ACTION_LABELS[ack.action] ?? ack.action}
        </span>
        <span style={{ fontSize: '9px', color: 'var(--muted)' }}>
          by {ack.acknowledged_by} · {new Date(ack.acknowledged_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
        </span>
        <button
          onClick={() => setAck(null)}
          style={{ fontSize: '9px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
          title="Clear acknowledgement"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', marginTop: '4px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={loading}
        style={{
          fontSize: '9px', padding: '2px 8px', borderRadius: '6px', cursor: 'pointer',
          border: '1px solid var(--border)', background: 'white', color: 'var(--muted)',
          fontWeight: 500,
        }}
      >
        {loading ? 'Saving…' : 'Mark as…'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '20px', left: 0, zIndex: 50,
          background: 'white', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: '140px',
        }}>
          {(['reviewed', 'actioned', 'false_positive'] as const).map(a => (
            <button
              key={a}
              onClick={() => submit(a)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                fontSize: '10px', padding: '5px 8px', borderRadius: '4px',
                border: 'none', cursor: 'pointer', background: 'transparent',
                color: ACTION_COLORS[a],
                fontWeight: 500,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = ACTION_BG[a])}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {ACTION_LABELS[a]}
            </button>
          ))}
          {error && <div style={{ fontSize: '9px', color: 'var(--red)', padding: '3px 8px' }}>{error}</div>}
        </div>
      )}
    </div>
  )
}
