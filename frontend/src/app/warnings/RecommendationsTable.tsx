'use client'

import { useState, useEffect, useCallback, useTransition, useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  useReactTable, getCoreRowModel, flexRender, createColumnHelper,
} from '@tanstack/react-table'
import type { EWIRecommendationRow } from '@/lib/ewiRecommendationsService'
import EWIActionButton from '@/components/EWIActionButton'
import { fmtDate } from '@/lib/formatters'

const ch = createColumnHelper<EWIRecommendationRow>()

const PRI_META: Record<string, { bg: string; color: string; border: string }> = {
  Urgent: { bg: '#FEE2E2', color: '#DC2626', border: '#FCA5A5' },
  High:   { bg: '#FEF2F2', color: '#C43A3A', border: '#FECACA' },
  Medium: { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' },
  Low:    { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
}

function PriBadge({ p }: { p: string }) {
  const m = PRI_META[p] ?? PRI_META['Low']
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 9px', borderRadius: '5px',
      background: m.bg, color: m.color, border: `1px solid ${m.border}`, whiteSpace: 'nowrap' }}>
      {p}
    </span>
  )
}

function StatusBadge({ actioned }: { actioned: boolean }) {
  return actioned
    ? <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 9px', borderRadius: '5px',
        background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', whiteSpace: 'nowrap' }}>Done</span>
    : <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 9px', borderRadius: '5px',
        background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', whiteSpace: 'nowrap' }}>Open</span>
}

const columns = [
  ch.accessor('client_id', {
    header: 'Client ID',
    cell: ({ getValue }) => (
      <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: 'var(--blue)' }}>{getValue()}</span>
    ),
    size: 120,
  }),
  ch.accessor('priority', {
    header: 'Priority',
    cell: ({ getValue }) => <PriBadge p={getValue()} />,
    size: 85,
  }),
  ch.accessor('recommendation_type', {
    header: 'Action',
    cell: ({ getValue }) => <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 500 }}>{getValue()}</span>,
    size: 130,
  }),
  ch.accessor('description', {
    header: 'Description',
    cell: ({ getValue }) => {
      const v = getValue()
      return v
        ? <span style={{ fontSize: '11px', color: 'var(--muted)', overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{v}</span>
        : <span style={{ fontSize: '11px', color: 'var(--muted)' }}>—</span>
    },
    size: 200,
  }),
  ch.accessor('is_actioned', {
    header: 'Status',
    cell: ({ getValue }) => <StatusBadge actioned={!!getValue()} />,
    size: 75,
  }),
  ch.accessor('created_at', {
    header: 'Created',
    cell: ({ getValue }) => (
      <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{fmtDate(getValue()) || '—'}</span>
    ),
    size: 100,
  }),
]

const PRI_OPTIONS = [['', 'All'], ['Urgent', 'Urgent'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']]

interface Props {
  initialRows:    EWIRecommendationRow[]
  initialTotal:   number
  initialQ:       string
  initialPage:    number
  initialPriority: string
  initialShowAll: boolean
}

function RecDrawer({ row, onClose }: { row: EWIRecommendationRow; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const m = PRI_META[row.priority] ?? PRI_META['Low']

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,27,42,0.45)', zIndex: 50, animation: 'ew-fade 0.15s ease' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px,100vw)',
        background: 'white', zIndex: 51, boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        animation: 'ew-slide 0.22s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
        <style>{`
          @keyframes ew-fade  { from{opacity:0} to{opacity:1} }
          @keyframes ew-slide { from{transform:translateX(100%)} to{transform:translateX(0)} }
        `}</style>

        {/* Header */}
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '15px', fontWeight: 700, color: 'var(--blue)', marginBottom: '4px' }}>{row.client_id}</div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <PriBadge p={row.priority} />
              <StatusBadge actioned={!!row.is_actioned} />
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>{row.recommendation_type}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '20px', padding: '0 4px' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {row.description && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>Description</div>
              <div style={{ padding: '12px 14px', background: '#F8FAFC', borderRadius: '7px', borderLeft: `3px solid ${m.color}`, fontSize: '12px', color: 'var(--text)', lineHeight: '1.6' }}>
                {row.description}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {[
              { label: 'Created',  value: fmtDate(row.created_at)  || '—' },
              { label: 'Actioned', value: fmtDate(row.actioned_at) || '—' },
              { label: 'Credit ID', value: row.credit_id || '—' },
              { label: 'Actioned By', value: row.actioned_by || '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#F8FAFC', borderRadius: '6px', padding: '8px 10px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '9px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</div>
                <div style={{ fontSize: '11px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>{value}</div>
              </div>
            ))}
          </div>

          {!row.is_actioned && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>Action</div>
              <EWIActionButton recommendationId={row.id} initialActioned={row.is_actioned} />
            </div>
          )}

          <a href={`/clients/${row.client_id}`} style={{ display: 'block', textAlign: 'center', padding: '10px',
            background: 'var(--navy)', color: 'white', borderRadius: '7px', fontSize: '12px', fontWeight: 600, textDecoration: 'none', marginTop: 'auto' }}>
            View Client Profile →
          </a>
        </div>
      </div>
    </>
  )
}

export default function RecommendationsTable({ initialRows, initialTotal, initialQ, initialPage, initialPriority, initialShowAll }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [rows,     setRows]     = useState(initialRows)
  const [total,    setTotal]    = useState(initialTotal)
  const [q,        setQ]        = useState(initialQ)
  const [page,     setPage]     = useState(initialPage)
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState<EWIRecommendationRow | null>(null)
  const [priority, setPriority] = useState(initialPriority)
  const [showAll,  setShowAll]  = useState(initialShowAll)

  const mounted    = useRef(false)
  const filtersRef = useRef({ priority, showAll })
  useEffect(() => { filtersRef.current = { priority, showAll } }, [priority, showAll])

  const totalPages = Math.max(1, Math.ceil(total / 25))

  const pushParams = useCallback((nq: string, np: number, npr: string, nsa: boolean) => {
    const p = new URLSearchParams(searchParams.toString())
    if (nq)    p.set('rq', nq);              else p.delete('rq')
    if (np > 1) p.set('rp', String(np));     else p.delete('rp')
    if (npr)   p.set('rpri', npr);           else p.delete('rpri')
    if (nsa)   p.set('ract', 'all');         else p.delete('ract')
    startTransition(() => { router.push(`${pathname}?${p.toString()}`) })
  }, [router, pathname, searchParams])

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    setLoading(true)
    const { priority: pr, showAll: sa } = filtersRef.current
    const t = setTimeout(() => { pushParams(q.trim(), 1, pr, sa) }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  useEffect(() => {
    setRows(initialRows); setTotal(initialTotal); setPage(initialPage)
    setPriority(initialPriority); setShowAll(initialShowAll); setLoading(false)
  }, [initialRows, initialTotal, initialPage, initialPriority, initialShowAll])

  function applyPriority(v: string) { setPriority(v); setPage(1); setLoading(true); pushParams(q.trim(), 1, v, showAll) }
  function toggleShowAll()           { const v = !showAll; setShowAll(v); setPage(1); setLoading(true); pushParams(q.trim(), 1, priority, v) }

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), manualPagination: true, pageCount: totalPages })

  const activeFilters = [priority, showAll ? 'all' : ''].filter(Boolean).length

  function PgBtns() {
    return (
      <>
        <button className="ew-pg-btn" disabled={page <= 1 || loading}
          onClick={() => { setPage(p => p - 1); pushParams(q.trim(), page - 1, priority, showAll) }}>‹</button>
        {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
          let p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i
          return <button key={p} className={`ew-pg-btn${p === page ? ' active' : ''}`} disabled={loading}
            onClick={() => { setPage(p); pushParams(q.trim(), p, priority, showAll) }}>{p}</button>
        })}
        <button className="ew-pg-btn" disabled={page >= totalPages || loading}
          onClick={() => { setPage(p => p + 1); pushParams(q.trim(), page + 1, priority, showAll) }}>›</button>
      </>
    )
  }

  return (
    <>
      <style>{`
        .ew-search:focus{border-color:var(--navy)!important;box-shadow:0 0 0 3px rgba(29,43,78,0.08)!important;}
        .ew-row{cursor:pointer;transition:background 0.1s;} .ew-row:hover td{background:#F7F9FC;}
        .ew-row td{border-bottom:1px solid var(--border);}
        .ew-pg-btn{width:30px;height:30px;border-radius:6px;border:1px solid var(--border);background:white;cursor:pointer;font-size:12px;font-family:var(--mono);color:var(--text);display:flex;align-items:center;justify-content:center;transition:background 0.1s;}
        .ew-pg-btn:hover:not(:disabled){background:#EEF2F7;} .ew-pg-btn:disabled{opacity:0.4;cursor:not-allowed;}
        .ew-pg-btn.active{background:var(--navy);color:white;border-color:var(--navy);font-weight:700;}
        .ew-fb{padding:4px 10px;border-radius:5px;border:1.5px solid var(--border);background:white;cursor:pointer;font-size:11px;font-weight:600;color:var(--muted);font-family:var(--font);white-space:nowrap;line-height:1.4;transition:all 0.1s;}
        .ew-fb:hover{background:#EEF2F7;color:var(--text);} .ew-fb.active{background:var(--navy);color:white;border-color:var(--navy);}
        .ew-flbl{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;}
        .ew-toggle{display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;font-weight:600;color:var(--muted);}
        .ew-toggle input{cursor:pointer;}
      `}</style>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}>
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2"/>
          <path d="M15 15l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <input className="ew-search" type="text" autoComplete="off" value={q}
          onChange={e => { setQ(e.target.value); setLoading(true) }}
          placeholder="Search by client ID…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '11px 38px 11px 40px', fontSize: '14px',
            border: '1.5px solid var(--border)', borderRadius: '8px', outline: 'none', fontFamily: 'var(--font)',
            background: 'white', color: 'var(--text)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }} />
        {q && <button onClick={() => setQ('')} style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '18px', padding: '2px 6px' }}>×</button>}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', padding: '10px 14px', background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span className="ew-flbl" style={{ marginRight: '2px' }}>Priority</span>
          {PRI_OPTIONS.map(([v, label]) => (
            <button key={v} className={`ew-fb${priority === v ? ' active' : ''}`} onClick={() => applyPriority(v)}>{label}</button>
          ))}
        </div>
        <label className="ew-toggle">
          <input type="checkbox" checked={showAll} onChange={toggleShowAll} />
          Show actioned
        </label>
        {activeFilters > 0 && (
          <button style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => { setPriority(''); setShowAll(false); setPage(1); setLoading(true); pushParams(q.trim(), 1, '', false) }}>
            Clear ({activeFilters})
          </button>
        )}
      </div>

      {/* Stats + top pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} recommendation${total !== 1 ? 's' : ''}${showAll ? ' (incl. actioned)' : ' open'}${q ? ` matching "${q}"` : ''}`}
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
                      background: '#F8FAFC', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', width: h.getSize() }}>
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
                          width: `${[90,60,90,160,50,70][ci]??70}px`,
                          animation: `pulse 1.4s ease-in-out ${i*0.07}s infinite` }} />
                      </td>
                    ))}</tr>
                  ))
                : table.getRowModel().rows.length === 0
                  ? <tr><td colSpan={columns.length} style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                      No recommendations found.
                    </td></tr>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)', background: '#FAFBFC' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Page {page} of {totalPages}</span>
          <div style={{ display: 'flex', gap: '4px' }}>{PgBtns()}</div>
        </div>
      </div>

      {selected && <RecDrawer row={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
