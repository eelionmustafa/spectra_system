'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

type Alert = {
  credit_id: string
  personal_id: string
  alert_type: string
  severity: string
  due_days: number
  stage: string
  exposure: number
}

function fmt(n: number) {
  if (n >= 1_000_000) return '\u20AC' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '\u20AC' + (n / 1_000).toFixed(0) + 'K'
  return '\u20AC' + n
}

function severityColor(s: string) {
  return s === 'critical' || s === 'high' ? '#EF4444' : '#F59E0B'
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fetchCount = useCallback(async () => {
    try {
      const r = await fetch('/api/alerts/count', { cache: 'no-store' })
      const d = await r.json()
      const nextCount = d.count ?? 0
      setCount(prev => {
        if (prev !== nextCount) setFetched(false)
        return nextCount
      })
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    void fetchCount()
    const id = window.setInterval(() => { void fetchCount() }, 60_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchCount()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchCount])

  const fetchAlerts = useCallback(async (force = false) => {
    if (!force && fetched) return

    setLoading(true)
    try {
      const r = await fetch('/api/alerts/list', { cache: 'no-store' })
      const d = await r.json()
      setAlerts(d.alerts ?? [])
      setTotal(d.total ?? 0)
      setCount(d.total ?? 0)
      setFetched(true)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [fetched])

  useEffect(() => {
    if (!open) return

    void fetchAlerts()
    const id = window.setInterval(() => { void fetchAlerts(true) }, 60_000)
    return () => window.clearInterval(id)
  }, [open, fetchAlerts])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="tb-btn"
        title={count > 0 ? `${count} active alerts` : 'Notifications'}
        style={{ background: open ? 'var(--white)' : undefined, position: 'relative' }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 1a4 4 0 0 1 4 4c0 2.5.8 3.5 1.5 4.5H1.5C2.2 8.5 3 7.5 3 5a4 4 0 0 1 4-4zM5.5 9.5a1.5 1.5 0 0 0 3 0"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {count > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 3,
              right: 3,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#EF4444',
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 2000,
            width: 320,
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 14px 10px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>Active Alerts</div>
              {total > 0 && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                  {total} clients with DPD &gt;= 30
                </div>
              )}
            </div>
            {total > 0 && (
              <span
                style={{
                  background: '#FEF2F2',
                  color: '#EF4444',
                  border: '1px solid #FECACA',
                  borderRadius: 5,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                }}
              >
                {total} open
              </span>
            )}
          </div>

          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: 11 }}>
                Loading...
              </div>
            ) : alerts.length === 0 ? (
              <div style={{ padding: '24px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>OK</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>No active alerts</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Portfolio is clear</div>
              </div>
            ) : (
              alerts.map((a, i) => {
                const color = severityColor(a.severity)
                const isCrit = a.severity === 'critical' || a.severity === 'high'

                return (
                  <Link
                    key={`${a.credit_id}-${i}`}
                    href={`/clients/${a.personal_id}`}
                    onClick={() => setOpen(false)}
                    style={{ textDecoration: 'none', display: 'block' }}
                  >
                    <div
                      style={{
                        padding: '9px 14px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        background: 'white',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#F8FAFC'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'white'
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: color,
                          flexShrink: 0,
                          boxShadow: isCrit ? `0 0 0 3px ${color}25` : 'none',
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', fontFamily: 'var(--mono)' }}>
                            {a.personal_id}
                          </span>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 3,
                              background: isCrit ? '#FEF2F2' : '#FFFBEB',
                              color,
                              border: `1px solid ${isCrit ? '#FECACA' : '#FDE68A'}`,
                            }}
                          >
                            {isCrit ? 'Critical' : 'Watch'}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {a.alert_type}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'var(--mono)' }}>
                          {a.due_days}d
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                          {fmt(a.exposure)}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px' }}>
            <Link
              href="/warnings"
              onClick={() => setOpen(false)}
              style={{
                display: 'block',
                textAlign: 'center',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--navy)',
                textDecoration: 'none',
                padding: '5px 0',
              }}
            >
              View all in Early Warnings -&gt;
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
