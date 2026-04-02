'use client'

import { useState, useEffect, useCallback, useTransition, useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  useReactTable, getCoreRowModel, flexRender, createColumnHelper,
} from '@tanstack/react-table'
import type { AlertTableRow } from '@/lib/queries'
import { fmt, fmtDate } from '@/lib/formatters'

const ch = createColumnHelper<AlertTableRow>()

function SeverityBadge({ s }: { s: string }) {
  const c = s === 'critical'
    ? { bg: '#FEF2F2', color: '#C43A3A', border: '#FECACA', label: 'Critical' }
    : { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A', label: 'High' }
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 9px', borderRadius: '5px',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  )
}

function StageBadge({ stage }: { stage: string }) {
  const s = stage === 'Stage 1' ? { bg: '#EAF9F2', color: '#1A9E60', border: '#A7F3D0' }
          : stage === 'Stage 2' ? { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' }
          : stage === 'N/A'     ? { bg: '#F1F5F9', color: '#94A3B8', border: '#E2E8F0' }
          :                       { bg: '#FEF2F2', color: '#C43A3A', border: '#FECACA' }
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 9px', borderRadius: '5px',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {stage}
    </span>
  )
}

function AlertAvatar({ row }: { row: AlertTableRow }) {
  const initials = row.name || row.surname
    ? [((row.name ?? '')[0] ?? ''), ((row.surname ?? '')[0] ?? '')].join('').toUpperCase()
    : row.personal_id.slice(0, 2).toUpperCase()
  const color = row.severity === 'critical' ? '#E85757' : '#F0A04B'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: `${color}1A`, border: `1.5px solid ${color}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '10px', fontWeight: 700, color, fontFamily: 'var(--mono)',
      }}>{initials}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
          {row.full_name}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{row.city}</div>
      </div>
    </div>
  )
}

const columns = [
  ch.display({ id: 'client', header: 'Client', cell: ({ row }) => <AlertAvatar row={row.original} />, size: 200 }),
  ch.accessor('credit_id', {
    header: 'Account',
    cell: ({ getValue }) => <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>{getValue()}</span>,
    size: 110,
  }),
  ch.accessor('alert_type', {
    header: 'Alert',
    cell: ({ getValue }) => <span style={{ fontSize: '11px', color: 'var(--text)' }}>{getValue()}</span>,
    size: 160,
  }),
  ch.accessor('severity', {
    header: 'Severity',
    cell: ({ getValue }) => <SeverityBadge s={getValue()} />,
    size: 85,
  }),
  ch.accessor('due_days', {
    header: 'DPD',
    cell: ({ getValue }) => {
      const d = getValue(); const color = d >= 60 ? '#E85757' : '#F0A04B'
      return <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color }}>{d}d</span>
    },
    size: 65,
  }),
  ch.accessor('stage', {
    header: 'Stage',
    cell: ({ getValue }) => <StageBadge stage={getValue()} />,
    size: 90,
  }),
  ch.accessor('exposure', {
    header: 'Balance',
    cell: ({ getValue }) => (
      <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
        {fmt(getValue() ?? 0)}
      </span>
    ),
    size: 95,
  }),
  ch.accessor('triggered_date', {
    header: 'Triggered',
    cell: ({ getValue }) => (
      <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
        {fmtDate(getValue()) || '—'}
      </span>
    ),
    size: 100,
  }),
]

const SEV_OPTIONS = [['', 'All'], ['critical', 'Critical'], ['high', 'High']]
const STG_OPTIONS = [['', 'All'], ['1', 'Stage 1'], ['2', 'Stage 2'], ['3', 'Stage 3']]

interface Props {
  initialRows:  AlertTableRow[]
  initialTotal: number
  initialQ:     string
  initialPage:  number
  initialSev:   string
  initialStage: string
}

function AlertDrawer({ row, onClose }: { row: AlertTableRow; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const [flagState,    setFlagState]    = useState<'idle'|'done'|'error'>('idle')
  const [watchState,   setWatchState]   = useState<'idle'|'done'|'error'>('idle')
  const [freezeState,  setFreezeState]  = useState<'idle'|'confirming'|'done'|'error'>('idle')

  async function logQuickAction(action: string, setter: (s: 'idle'|'done'|'error') => void) {
    try {
      const res = await fetch('/api/actions/log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, clientId: row.personal_id }),
      })
      setter(res.ok ? 'done' : 'error')
    } catch { setter('error') }
  }

  async function doFreeze() {
    try {
      const res = await fetch(`/api/clients/${row.personal_id}/freeze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: `EWI alert: ${row.alert_type}` }),
      })
      setFreezeState(res.ok ? 'done' : 'error')
    } catch { setFreezeState('error') }
  }

  const initials = row.name || row.surname
    ? [((row.name ?? '')[0] ?? ''), ((row.surname ?? '')[0] ?? '')].join('').toUpperCase()
    : row.personal_id.slice(0, 2).toUpperCase()
  const color = row.severity === 'critical' ? '#E85757' : '#F0A04B'
  const bg    = row.severity === 'critical' ? 'rgba(232,87,87,0.10)' : 'rgba(240,160,75,0.10)'
  const border = row.severity === 'critical' ? 'rgba(232,87,87,0.25)' : 'rgba(240,160,75,0.25)'

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,27,42,0.45)', zIndex: 50, animation: 'ew-fade 0.15s ease' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px,100vw)',
        background: 'var(--card)', zIndex: 51, boxShadow: '-8px 0 32px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        animation: 'ew-slide 0.22s cubic-bezier(0.25,0.46,0.45,0.94)',
      }}>
        <style>{`
          @keyframes ew-fade  { from{opacity:0} to{opacity:1} }
          @keyframes ew-slide { from{transform:translateX(100%)} to{transform:translateX(0)} }
        `}</style>

        {/* Header */}
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
            background: bg, border: `2px solid ${border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '15px', fontWeight: 700, color, fontFamily: 'var(--mono)' }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '3px' }}>{row.full_name}</div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>{row.personal_id}</span>
              <StageBadge stage={row.stage} />
              <SeverityBadge s={row.severity} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '20px', padding: '0 4px' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: 'DPD',       value: `${row.due_days}d`,       bad: true },
              { label: 'Exposure',  value: fmt(row.exposure),         bad: false },
              { label: 'Triggered', value: fmtDate(row.triggered_date) || '—', bad: false },
            ].map(({ label, value, bad }) => (
              <div key={label} style={{ background: bad ? 'rgba(232,87,87,0.08)' : 'rgba(255,255,255,0.05)', borderRadius: '7px', padding: '10px 12px',
                border: `1px solid ${bad ? 'rgba(232,87,87,0.2)' : 'var(--border)'}` }}>
                <div style={{ fontSize: '9px', color: bad ? color : 'var(--muted)', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: bad ? color : 'var(--text)', fontFamily: 'var(--mono)' }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>Alert Details</div>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '7px', padding: '12px 14px', border: `1px solid ${border}`, marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color, marginBottom: '4px' }}>{row.alert_type}</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Credit Account: <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{row.credit_id}</span></div>
          </div>

          {/* Quick Actions */}
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>

            {/* Flag for Review */}
            {flagState === 'done'
              ? <div style={{ padding: '8px 12px', background: 'rgba(20,83,45,0.25)', borderRadius: '6px', border: '1px solid rgba(74,222,128,0.3)', fontSize: '11px', color: 'var(--green)', fontWeight: 600 }}>✓ Flagged for Review</div>
              : <button onClick={() => logQuickAction('Flag for Review', setFlagState)} disabled={flagState === 'error'} style={{
                  padding: '9px 14px', borderRadius: '6px', border: '1px solid #BFDBFE',
                  background: 'rgba(59,130,246,0.12)', color: 'var(--blue)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                }}>
                  Flag for Review — log this alert for follow-up
                </button>
            }

            {/* Add to Watchlist */}
            {watchState === 'done'
              ? <div style={{ padding: '8px 12px', background: 'rgba(20,83,45,0.25)', borderRadius: '6px', border: '1px solid rgba(74,222,128,0.3)', fontSize: '11px', color: 'var(--green)', fontWeight: 600 }}>✓ Added to Watchlist</div>
              : <button onClick={() => logQuickAction('Add to Watchlist', setWatchState)} disabled={watchState === 'error'} style={{
                  padding: '9px 14px', borderRadius: '6px', border: '1px solid #FDE68A',
                  background: 'rgba(245,158,11,0.12)', color: 'var(--amber)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                }}>
                  Add to Watchlist — place client under formal monitoring
                </button>
            }

            {/* Freeze Account */}
            {freezeState === 'done'
              ? <div style={{ padding: '8px 12px', background: 'rgba(20,83,45,0.25)', borderRadius: '6px', border: '1px solid rgba(74,222,128,0.3)', fontSize: '11px', color: 'var(--green)', fontWeight: 600 }}>✓ Credit Limit Frozen</div>
              : freezeState === 'confirming'
              ? <div style={{ padding: '10px 12px', background: 'rgba(127,29,29,0.2)', borderRadius: '6px', border: '1px solid rgba(252,165,165,0.3)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--red)', marginBottom: '8px', fontWeight: 600 }}>Confirm freeze? This will suspend the client&apos;s credit limit.</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={doFreeze} style={{ fontSize: '11px', padding: '5px 14px', borderRadius: '5px', background: '#C43A3A', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Confirm Freeze</button>
                    <button onClick={() => setFreezeState('idle')} style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '5px', background: 'rgba(255,255,255,0.07)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              : <button onClick={() => setFreezeState('confirming')} style={{
                  padding: '9px 14px', borderRadius: '6px', border: '1px solid #FECACA',
                  background: 'rgba(127,29,29,0.2)', color: 'var(--red)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                }}>
                  Freeze Account — suspend credit limit immediately
                </button>
            }
          </div>

          <a href={`/clients/${row.personal_id}`} style={{
            display: 'block', textAlign: 'center', padding: '10px',
            background: 'var(--navy)', color: 'white', borderRadius: '7px',
            fontSize: '12px', fontWeight: 600, textDecoration: 'none',
          }}>View Full Client Profile →</a>
        </div>
      </div>
    </>
  )
}

export default function AlertsTable({ initialRows, initialTotal, initialQ, initialPage, initialSev, initialStage }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [rows,     setRows]     = useState(initialRows)
  const [total,    setTotal]    = useState(initialTotal)
  const [q,        setQ]        = useState(initialQ)
  const [page,     setPage]     = useState(initialPage)
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState<AlertTableRow | null>(null)
  const [sev,      setSev]      = useState(initialSev)
  const [stage,    setStage]    = useState(initialStage)

  const mounted    = useRef(false)
  const filtersRef = useRef({ sev, stage })
  useEffect(() => { filtersRef.current = { sev, stage } }, [sev, stage])

  const totalPages = Math.max(1, Math.ceil(total / 25))

  const pushParams = useCallback((nq: string, np: number, ns: string, nst: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (nq)    p.set('aq', nq);            else p.delete('aq')
    if (np > 1) p.set('ap', String(np));   else p.delete('ap')
    if (ns)    p.set('asev', ns);          else p.delete('asev')
    if (nst)   p.set('ast', nst);          else p.delete('ast')
    startTransition(() => { router.push(`${pathname}?${p.toString()}`) })
  }, [router, pathname, searchParams])

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    setLoading(true)
    const { sev: s, stage: st } = filtersRef.current
    const t = setTimeout(() => { pushParams(q.trim(), 1, s, st) }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  useEffect(() => {
    setRows(initialRows); setTotal(initialTotal); setPage(initialPage)
    setSev(initialSev); setStage(initialStage); setLoading(false)
  }, [initialRows, initialTotal, initialPage, initialSev, initialStage])

  function applySev(v: string)   { setSev(v);   setPage(1); setLoading(true); pushParams(q.trim(), 1, v,   stage) }
  function applyStage(v: string) { setStage(v); setPage(1); setLoading(true); pushParams(q.trim(), 1, sev, v)     }

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), manualPagination: true, pageCount: totalPages })

  const activeFilters = [sev, stage].filter(Boolean).length

  function PgBtns() {
    return (
      <>
        <button className="ew-pg-btn" disabled={page <= 1 || loading}
          onClick={() => { setPage(p => p - 1); pushParams(q.trim(), page - 1, sev, stage) }}>‹</button>
        {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
          const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i
          return <button key={p} className={`ew-pg-btn${p === page ? ' active' : ''}`} disabled={loading}
            onClick={() => { setPage(p); pushParams(q.trim(), p, sev, stage) }}>{p}</button>
        })}
        <button className="ew-pg-btn" disabled={page >= totalPages || loading}
          onClick={() => { setPage(p => p + 1); pushParams(q.trim(), page + 1, sev, stage) }}>›</button>
      </>
    )
  }

  return (
    <>
      <style>{`
        .ew-search:focus{border-color:var(--navy)!important;box-shadow:0 0 0 3px rgba(29,43,78,0.08)!important;}
        .ew-row{cursor:pointer;transition:background 0.1s;} .ew-row:hover td{background:rgba(255,255,255,0.04) !important;}
        .ew-row td{border-bottom:1px solid var(--border);}
        .ew-pg-btn{width:30px;height:30px;border-radius:6px;border:1px solid var(--border);background:var(--card);cursor:pointer;font-size:12px;font-family:var(--mono);color:var(--text);display:flex;align-items:center;justify-content:center;transition:background 0.1s;}
        .ew-pg-btn:hover:not(:disabled){background:#EEF2F7;} .ew-pg-btn:disabled{opacity:0.4;cursor:not-allowed;}
        .ew-pg-btn.active{background:var(--navy);color:white;border-color:var(--navy);font-weight:700;}
        .ew-fb{padding:4px 10px;border-radius:5px;border:1.5px solid var(--border);background:var(--card);cursor:pointer;font-size:11px;font-weight:600;color:var(--muted);font-family:var(--font);white-space:nowrap;line-height:1.4;transition:all 0.1s;}
        .ew-fb:hover{background:#EEF2F7;color:var(--text);} .ew-fb.active{background:var(--navy);color:white;border-color:var(--navy);}
        .ew-flbl{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;}
      `}</style>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}>
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2"/>
          <path d="M15 15l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <input className="ew-search" type="text" autoComplete="off" value={q}
          onChange={e => { setQ(e.target.value); setLoading(true) }}
          placeholder="Search by client ID or name…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '11px 38px 11px 40px', fontSize: '14px',
            border: '1.5px solid var(--border)', borderRadius: '8px', outline: 'none', fontFamily: 'var(--font)',
            background: 'var(--card)', color: 'var(--text)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }} />
        {q && <button onClick={() => setQ('')} style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '18px', padding: '2px 6px' }}>×</button>}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span className="ew-flbl" style={{ marginRight: '2px' }}>Severity</span>
          {SEV_OPTIONS.map(([v, label]) => (
            <button key={v} className={`ew-fb${sev === v ? ' active' : ''}`} onClick={() => applySev(v)}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span className="ew-flbl" style={{ marginRight: '2px' }}>Stage</span>
          {STG_OPTIONS.map(([v, label]) => (
            <button key={v} className={`ew-fb${stage === v ? ' active' : ''}`} onClick={() => applyStage(v)}>{label}</button>
          ))}
        </div>
        {activeFilters > 0 && (
          <button style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => { setSev(''); setStage(''); setPage(1); setLoading(true); pushParams(q.trim(), 1, '', '') }}>
            Clear ({activeFilters})
          </button>
        )}
      </div>

      {/* Stats + top pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} alert${total !== 1 ? 's' : ''}${q ? ` matching "${q}"` : ''}`}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>{PgBtns()}</div>
      </div>

      {/* Table */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(h => (
                    <th key={h.id} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 700,
                      color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase',
                      background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', width: h.getSize() }}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>{columns.map((_, ci) => (
                      <td key={ci} style={{ padding: '12px 14px' }}>
                        <div style={{ height: 12, borderRadius: 3, background: '#EEF2F7',
                          width: `${[140,80,110,60,40,60,70,70][ci]??70}px`,
                          animation: `pulse 1.4s ease-in-out ${i*0.07}s infinite` }} />
                      </td>
                    ))}</tr>
                  ))
                : table.getRowModel().rows.length === 0
                  ? <tr><td colSpan={columns.length} style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>No alerts found.</td></tr>
                  : table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="ew-row" onClick={() => setSelected(row.original)}>
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} style={{ padding: '11px 14px', verticalAlign: 'middle' }}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Page {page} of {totalPages}</span>
          <div style={{ display: 'flex', gap: '4px' }}>{PgBtns()}</div>
        </div>
      </div>

      {selected && <AlertDrawer row={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
