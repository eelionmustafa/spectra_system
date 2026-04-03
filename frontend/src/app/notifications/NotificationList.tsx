'use client'

import { useState } from 'react'
import Link from 'next/link'

export type NotificationRow = {
  id:                string
  client_id:         string
  credit_id:         string | null
  notification_type: string
  priority:          string
  title:             string
  message:           string
  assigned_rm:       string | null
  created_at:        string
  read_at:           string | null
}

type PriorityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low' | 'payments'

const PRIORITY_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: '#991B1B', bg: '#FEF2F2', border: '#FECACA', label: 'Critical' },
  high:     { color: '#92400E', bg: '#FFF7ED', border: '#FED7AA', label: 'High' },
  medium:   { color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE', label: 'Medium' },
  low:      { color: '#166534', bg: '#F0FDF4', border: '#BBF7D0', label: 'Low' },
}

const TYPE_LABELS: Record<string, string> = {
  stage_change:      'Stage Change',
  ewi_alert:         'EWI Alert',
  risk_escalation:   'Risk Escalation',
  recovery_opened:   'Recovery Opened',
  committee_request: 'Committee Request',
  payment_received:  'Payment Received',
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso)
    const diffMins = Math.floor((Date.now() - d.getTime()) / 60000)
    if (diffMins < 1)   return 'Just now'
    if (diffMins < 60)  return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return iso }
}

export default function NotificationList({ initialNotifications }: { initialNotifications: NotificationRow[] }) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [filter, setFilter]               = useState<PriorityFilter>('all')
  const [markingAll, setMarkingAll]       = useState(false)
  const [markingId, setMarkingId]         = useState<string | null>(null)

  async function markRead(id: string) {
    setMarkingId(id)
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    } finally {
      setMarkingId(null)
    }
  }

  async function markAllRead() {
    setMarkingAll(true)
    try {
      await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark-all-read' }) })
      const now = new Date().toISOString()
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? now })))
    } finally {
      setMarkingAll(false)
    }
  }

  const filtered = filter === 'all'
    ? notifications
    : filter === 'payments'
      ? notifications.filter(n => n.notification_type === 'payment_received')
      : notifications.filter(n => n.priority === filter && n.notification_type !== 'payment_received')
  const unread   = notifications.filter(n => !n.read_at)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{
        background: 'linear-gradient(135deg, var(--navy) 0%, #152638 100%)',
        padding: '16px 24px 14px', flexShrink: 0,
        borderBottom: '1px solid rgba(201,168,76,0.2)', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--gold) 0%, transparent 60%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: 3 }}>
              Notifications
              {unread.length > 0 && (
                <span style={{ marginLeft: 10, fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#EF4444', color: 'white' }}>
                  {unread.length} unread
                </span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
              System alerts, stage changes, and escalation notifications
            </div>
          </div>
          {unread.length > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              style={{
                padding: '8px 16px', borderRadius: 7, border: '1px solid rgba(201,168,76,0.35)',
                background: 'rgba(201,168,76,0.1)', color: 'var(--gold)', fontSize: '12px',
                fontWeight: 700, cursor: markingAll ? 'default' : 'pointer', fontFamily: 'var(--font)',
                opacity: markingAll ? 0.6 : 1,
              }}
            >
              {markingAll ? 'Marking…' : '✓ Mark all read'}
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 24px', background: '#F8FAFC',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        {(['all', 'critical', 'high', 'medium', 'low'] as PriorityFilter[]).map(f => {
          const count  = f === 'all'
            ? notifications.filter(n => n.notification_type !== 'payment_received').length
            : notifications.filter(n => n.priority === f && n.notification_type !== 'payment_received').length
          const active = filter === f
          const cfg    = f !== 'all' ? PRIORITY_CONFIG[f] : null
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '5px 12px', borderRadius: 6,
                border: `1px solid ${active ? (cfg?.border ?? 'var(--navy)') : 'var(--border)'}`,
                background: active ? (cfg?.bg ?? '#F0F4FF') : 'white',
                color: active ? (cfg?.color ?? 'var(--navy)') : 'var(--muted)',
                fontSize: '11px', fontWeight: active ? 700 : 500, cursor: 'pointer',
                fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {f === 'all' ? 'All' : PRIORITY_CONFIG[f].label}
              <span style={{
                fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: 10,
                background: active ? (cfg?.border ?? '#BFDBFE') : '#F1F5F9',
                color: active ? (cfg?.color ?? 'var(--navy)') : 'var(--muted)',
              }}>
                {count}
              </span>
            </button>
          )
        })}
        {/* Payments filter — separated from client notifications */}
        {(() => {
          const count  = notifications.filter(n => n.notification_type === 'payment_received').length
          const active = filter === 'payments'
          return (
            <button
              onClick={() => setFilter('payments')}
              style={{
                padding: '5px 12px', borderRadius: 6, marginLeft: 6,
                border: `1px solid ${active ? '#6EE7B7' : 'var(--border)'}`,
                background: active ? '#ECFDF5' : 'white',
                color: active ? '#065F46' : 'var(--muted)',
                fontSize: '11px', fontWeight: active ? 700 : 500, cursor: 'pointer',
                fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              💳 Payments
              <span style={{
                fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: 10,
                background: active ? '#BBF7D0' : '#F1F5F9',
                color: active ? '#065F46' : 'var(--muted)',
              }}>
                {count}
              </span>
            </button>
          )
        })()}
        <div style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--muted)' }}>
          {unread.length > 0 ? `${unread.length} unread` : 'All caught up'}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: 12, opacity: 0.35 }}>🔔</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              {filter === 'all' ? 'No notifications' : `No ${filter} notifications`}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
              Notifications are created automatically by the ML pipeline and classification engine.
            </div>
          </div>
        )}

        {filtered.map(n => {
          const cfg    = PRIORITY_CONFIG[n.priority] ?? PRIORITY_CONFIG.medium
          const isRead = !!n.read_at
          return (
            <div
              key={n.id}
              style={{
                borderRadius: 10, border: `1px solid ${isRead ? 'var(--border)' : cfg.border}`,
                background: isRead ? 'white' : cfg.bg, padding: '12px 16px',
                display: 'flex', gap: 14, opacity: isRead ? 0.75 : 1, transition: 'opacity 0.2s',
              }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                background: isRead ? '#CBD5E1' : cfg.color,
                boxShadow: !isRead ? `0 0 0 3px ${cfg.border}` : 'none',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '12px', fontWeight: isRead ? 500 : 700, color: isRead ? 'var(--muted)' : 'var(--text)' }}>
                      {n.title}
                    </span>
                    <span style={{
                      marginLeft: 8, fontSize: '9px', fontWeight: 700, padding: '1px 7px', borderRadius: 3,
                      background: isRead ? '#F1F5F9' : cfg.border, color: isRead ? 'var(--muted)' : cfg.color,
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>{cfg.label}</span>
                    {n.notification_type && (
                      <span style={{ marginLeft: 6, fontSize: '9px', fontWeight: 600, padding: '1px 7px', borderRadius: 3, background: '#F1F5F9', color: 'var(--muted)' }}>
                        {TYPE_LABELS[n.notification_type] ?? n.notification_type}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {fmtDateTime(n.created_at)}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: isRead ? 'var(--muted)' : 'var(--text)', margin: '0 0 8px', lineHeight: 1.5 }}>
                  {n.message}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Link href={`/clients/${n.client_id}`} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--navy)', textDecoration: 'none', fontFamily: 'var(--mono)' }}>
                    → {n.client_id}
                    {n.credit_id && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {n.credit_id}</span>}
                  </Link>
                  {n.assigned_rm && (
                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>for {n.assigned_rm}</span>
                  )}
                  {!isRead && (
                    <button
                      onClick={() => markRead(n.id)}
                      disabled={markingId === n.id}
                      style={{
                        marginLeft: 'auto', fontSize: '10px', fontWeight: 600, padding: '3px 10px',
                        borderRadius: 5, border: `1px solid ${cfg.border}`, background: 'white',
                        color: cfg.color, cursor: markingId === n.id ? 'default' : 'pointer',
                        fontFamily: 'var(--font)', opacity: markingId === n.id ? 0.6 : 1,
                      }}
                    >
                      {markingId === n.id ? 'Marking…' : '✓ Mark read'}
                    </button>
                  )}
                  {isRead && (
                    <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#94A3B8' }}>
                      ✓ Read {n.read_at ? fmtDateTime(n.read_at) : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
