'use client'

import { useState, useMemo, memo } from 'react'
import Link from 'next/link'

type LogEntry = {
  id: string
  clientId: string
  action: string
  actionedBy: string
  status: string
  notes: string | null
  createdAt: string
}

const ACTION_META: Record<string, { badge: string; color: string }> = {
  'Freeze Account':        { badge: 'br', color: '#D94040' },
  'Freeze account':        { badge: 'br', color: '#D94040' },
  'Unfreeze Account':      { badge: 'bg', color: '#1EA97C' },
  'Unfreeze account':      { badge: 'bg', color: '#1EA97C' },
  'Escalate Case':         { badge: 'br', color: '#D94040' },
  'Escalate case':         { badge: 'br', color: '#D94040' },
  'Add to Watchlist':      { badge: 'ba', color: '#D97706' },
  'Add to watchlist':      { badge: 'ba', color: '#D97706' },
  'Remove from Watchlist': { badge: 'bb', color: '#2563EB' },
  'Schedule Review':       { badge: 'bb', color: '#2563EB' },
  'Schedule review':       { badge: 'bb', color: '#2563EB' },
  'Contact Client':        { badge: 'bb', color: '#2563EB' },
  'Contact immediately':   { badge: 'br', color: '#D94040' },
  'Send Reminder':         { badge: 'bb', color: '#2563EB' },
  'Legal Review':          { badge: 'br', color: '#D94040' },
  'Legal review':          { badge: 'br', color: '#D94040' },
  'Monitor':               { badge: 'bg', color: '#1EA97C' },
}

function actionMeta(action: string) {
  return ACTION_META[action] ?? { badge: 'bb', color: '#6B7E95' }
}

function formatDate(s: string) {
  try {
    const d = new Date(s)
    return {
      date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    }
  } catch { return { date: s, time: '' } }
}

/* ─── memoized row ─────────────────────────────────────────────────────────── */
const AuditRow = memo(function AuditRow({ e }: { e: LogEntry }) {
  const meta = actionMeta(e.action)
  const { date, time } = formatDate(e.createdAt)
  return (
    <tr>
      <td>
        <div className="mono" style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)' }}>{time}</div>
        <div className="mono" style={{ fontSize: 9, color: 'var(--muted)' }}>{date}</div>
      </td>
      <td>
        <Link href={`/clients/${e.clientId}`} className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue)', textDecoration: 'none' }}>
          {e.clientId} ↗
        </Link>
      </td>
      <td><span className={`badge ${meta.badge}`}>{e.action}</span></td>
      <td className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{e.actionedBy}</td>
      <td><span className={`badge ${e.status === 'active' ? 'bg' : 'bb'}`}>{e.status}</span></td>
      <td style={{ fontSize: 10, color: 'var(--muted)', maxWidth: 200 }}>
        {e.notes ?? <span style={{ color: 'var(--border)' }}>—</span>}
      </td>
    </tr>
  )
})

export default function AuditTable({ log }: { log: LogEntry[] }) {
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('all')

  const uniqueActions = useMemo(() => {
    const seen = new Set<string>()
    for (const e of log) seen.add(e.action)
    return Array.from(seen).sort()
  }, [log])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return log.filter(e => {
      if (filterAction !== 'all' && e.action !== filterAction) return false
      if (q && !e.clientId.toLowerCase().includes(q) && !e.actionedBy.toLowerCase().includes(q)) return false
      return true
    })
  }, [log, search, filterAction])

  return (
    <>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search client ID or user…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '5px 10px', fontSize: 11, border: '1px solid var(--border)',
            borderRadius: 5, outline: 'none', fontFamily: 'var(--mono)',
            width: 200, color: 'var(--text)', background: 'white',
          }}
        />
        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          style={{
            padding: '5px 10px', fontSize: 11, border: '1px solid var(--border)',
            borderRadius: 5, outline: 'none', color: 'var(--text)', background: 'white',
          }}
        >
          <option value="all">All actions</option>
          {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
          {filtered.length} / {log.length} entries
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
          No entries match your filter
        </div>
      ) : (
        <div className="tbl-wrap" style={{ maxHeight: 'none' }}>
          <table className="tbl tbl-alt">
            <thead>
              <tr>
                <th>Time</th>
                <th>Client</th>
                <th>Action</th>
                <th>By</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => <AuditRow key={e.id} e={e} />)}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
