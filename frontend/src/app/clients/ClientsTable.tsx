'use client'

import { useState, useEffect, useCallback, useTransition, useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import type { ClientTableRow } from '@/lib/queries'
import { fmt, fmtDate } from '@/lib/formatters'

const ch = createColumnHelper<ClientTableRow>()

function ResolvedBadge() {
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '5px',
      background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0',
      whiteSpace: 'nowrap',
    }}>
      ✓ Resolved
    </span>
  )
}

function StageBadge({ stage }: { stage: string }) {
  const s = stage === 'Stage 1' ? { bg: '#EAF9F2', color: '#1A9E60', border: '#A7F3D0' }
          : stage === 'Stage 2' ? { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' }
          : stage === 'N/A'     ? { bg: '#F1F5F9', color: '#94A3B8', border: '#E2E8F0' }
          :                       { bg: '#FEF2F2', color: '#C43A3A', border: '#FECACA' }
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 9px', borderRadius: '5px',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      {stage}
    </span>
  )
}

function Avatar({ row }: { row: ClientTableRow }) {
  const initials = row.name || row.surname
    ? [(row.name[0] ?? ''), (row.surname[0] ?? '')].join('').toUpperCase()
    : row.personal_id.slice(0, 2).toUpperCase()
  const hasDpd = row.current_dpd > 0
  const color = row.stage === 'Stage 1' ? '#2ECC8A' : row.stage === 'Stage 2' ? '#F0A04B' : '#E85757'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: hasDpd ? `${color}1A` : '#EEF2F7',
        border: `1.5px solid ${hasDpd ? `${color}55` : '#E2E8F0'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '10px', fontWeight: 700, color: hasDpd ? color : '#94A3B8',
        fontFamily: 'var(--mono)',
      }}>
        {initials}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="ct-name-cell" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
          {row.full_name}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
          {row.city}
        </div>
      </div>
    </div>
  )
}

const columns = [
  ch.display({
    id: 'client',
    header: 'Client',
    cell: ({ row }) => <Avatar row={row.original} />,
    size: 220,
  }),
  ch.accessor('personal_id', {
    header: 'Account ID',
    meta: { className: 'ct-col-hide' },
    cell: ({ getValue }) => (
      <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>
        {getValue()}
      </span>
    ),
    size: 120,
  }),
  ch.accessor('product_type', {
    header: 'Type',
    cell: ({ getValue }) => (
      <span style={{ fontSize: '12px', color: 'var(--text)' }}>{getValue() || '—'}</span>
    ),
    size: 130,
  }),
  ch.accessor('exposure', {
    header: 'Balance',
    cell: ({ getValue }) => (
      <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
        {fmt(getValue() ?? 0)}
      </span>
    ),
    size: 100,
  }),
  ch.accessor('stage', {
    header: 'Risk Status',
    cell: ({ getValue }) => <StageBadge stage={getValue()} />,
    size: 110,
  }),
  ch.display({
    id: 'resolved',
    header: '',
    cell: ({ row }) => row.original.is_resolved ? <ResolvedBadge /> : null,
    size: 90,
  }),
  ch.accessor('last_activity', {
    header: 'Last Activity',
    meta: { className: 'ct-col-hide' },
    cell: ({ getValue }) => (
      <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
        {fmtDate(getValue()) || '—'}
      </span>
    ),
    size: 110,
  }),
]

const STAGE_OPTIONS  = [['', 'All'], ['1', 'Stage 1'], ['2', 'Stage 2'], ['3', 'Stage 3'], ['NA', 'N/A']]
const DPD_OPTIONS    = [['', 'All'], ['0', 'No DPD'], ['1', '1–30d'], ['31', '31–90d'], ['90', '90d+']]
const STATUS_OPTIONS = ['', 'Active', 'Inactive', 'Suspended', 'Deceased']

interface Props {
  initialRows:    ClientTableRow[]
  initialTotal:   number
  initialQ:       string
  initialPage:    number
  initialStage:   string
  initialDpd:     string
  initialStatus:  string
  initialVintage?: string
}

const CURRENT_YEAR   = new Date().getFullYear()
const VINTAGE_OPTIONS = Array.from({ length: 6 }, (_, i) => String(CURRENT_YEAR - i))

export default function ClientsTable({
  initialRows, initialTotal, initialQ, initialPage,
  initialStage, initialDpd, initialStatus, initialVintage = '',
}: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [rows,     setRows]     = useState(initialRows)
  const [total,    setTotal]    = useState(initialTotal)
  const [q,        setQ]        = useState(initialQ)
  const [page,     setPage]     = useState(initialPage)
  const [loading,  setLoading]  = useState(false)
  const [stage,    setStage]    = useState(initialStage)
  const [dpd,      setDpd]      = useState(initialDpd)
  const [status,   setStatus]   = useState(initialStatus)
  const [vintage,  setVintage]  = useState(initialVintage)

  const mounted    = useRef(false)
  const filtersRef = useRef({ stage, dpd, status, vintage })
  useEffect(() => { filtersRef.current = { stage, dpd, status, vintage } }, [stage, dpd, status, vintage])

  const totalPages = Math.max(1, Math.ceil(total / 25))

  const pushParams = useCallback((newQ: string, newPage: number, newStage: string, newDpd: string, newStatus: string, newVintage: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (newQ)       params.set('q', newQ);               else params.delete('q')
    if (newPage>1)  params.set('page', String(newPage));  else params.delete('page')
    if (newStage)   params.set('stage', newStage);       else params.delete('stage')
    if (newDpd)     params.set('dpd', newDpd);           else params.delete('dpd')
    if (newStatus)  params.set('status', newStatus);     else params.delete('status')
    if (newVintage) params.set('vintage', newVintage);   else params.delete('vintage')
    startTransition(() => { router.push(`${pathname}?${params.toString()}`) })
  }, [router, pathname, searchParams])

  // Debounced search — reads latest filters from ref to avoid stale closure
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    setLoading(true)
    const { stage: s, dpd: d, status: st, vintage: v } = filtersRef.current
    const t = setTimeout(() => { pushParams(q.trim(), 1, s, d, st, v) }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  // Sync when server re-renders with new props
  useEffect(() => {
    setRows(initialRows)
    setTotal(initialTotal)
    setPage(initialPage)
    setStage(initialStage)
    setDpd(initialDpd)
    setStatus(initialStatus)
    setVintage(initialVintage)
    setLoading(false)
  }, [initialRows, initialTotal, initialPage, initialStage, initialDpd, initialStatus, initialVintage])

  function applyStage(v: string)   { setStage(v);   setPage(1); setLoading(true); pushParams(q.trim(), 1, v,     dpd,   status,  vintage) }
  function applyDpd(v: string)     { setDpd(v);     setPage(1); setLoading(true); pushParams(q.trim(), 1, stage, v,     status,  vintage) }
  function applyStatus(v: string)  { setStatus(v);  setPage(1); setLoading(true); pushParams(q.trim(), 1, stage, dpd,   v,       vintage) }
  function applyVintage(v: string) { setVintage(v); setPage(1); setLoading(true); pushParams(q.trim(), 1, stage, dpd,   status,  v)       }

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  })

  const activeFilters = [stage, dpd, status, vintage].filter(Boolean).length

  const paginationButtons = (
    <>
      <button
        className="ct-pg-btn"
        disabled={page <= 1 || loading}
        onClick={() => { setPage(p => p - 1); pushParams(q.trim(), page - 1, stage, dpd, status, vintage) }}
        aria-label="Previous page"
      >‹</button>
      {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
        let p: number
        if (totalPages <= 7)             { p = i + 1 }
        else if (page <= 4)              { p = i + 1 }
        else if (page >= totalPages - 3) { p = totalPages - 6 + i }
        else                             { p = page - 3 + i }
        return (
          <button
            key={p}
            className={`ct-pg-btn${p === page ? ' active' : ''}`}
            disabled={loading}
            onClick={() => { setPage(p); pushParams(q.trim(), p, stage, dpd, status, vintage) }}
          >{p}</button>
        )
      })}
      <button
        className="ct-pg-btn"
        disabled={page >= totalPages || loading}
        onClick={() => { setPage(p => p + 1); pushParams(q.trim(), page + 1, stage, dpd, status, vintage) }}
        aria-label="Next page"
      >›</button>
    </>
  )

  return (
    <>
      <style>{`
        .ct-search:focus { border-color:var(--navy)!important; box-shadow:0 0 0 3px rgba(29,43,78,0.08)!important; }
        .ct-row { cursor:pointer; transition:background 0.1s; }
        .ct-row:hover td { background:#F7F9FC; }
        .ct-row td { border-bottom:1px solid var(--border); }
        .ct-pg-btn {
          width:30px; height:30px; border-radius:6px; border:1px solid var(--border);
          background:white; cursor:pointer; font-size:12px; font-family:var(--mono);
          color:var(--text); display:flex; align-items:center; justify-content:center;
          transition:background 0.1s;
        }
        .ct-pg-btn:hover:not(:disabled) { background:#EEF2F7; }
        .ct-pg-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .ct-pg-btn.active { background:var(--navy); color:white; border-color:var(--navy); font-weight:700; }
        .ct-filter-btn {
          padding:4px 10px; border-radius:5px; border:1.5px solid var(--border);
          background:white; cursor:pointer; font-size:11px; font-weight:600;
          color:var(--muted); transition:all 0.1s; white-space:nowrap;
          font-family:var(--font); line-height:1.4;
        }
        .ct-filter-btn:hover { background:#EEF2F7; color:var(--text); border-color:#CBD5E1; }
        .ct-filter-btn.active { background:var(--navy); color:white; border-color:var(--navy); }
        .ct-filter-select {
          padding:4px 8px; border-radius:5px; border:1.5px solid var(--border);
          background:white; cursor:pointer; font-size:11px; font-weight:600;
          color:var(--muted); font-family:var(--font); outline:none; height:28px;
        }
        .ct-filter-select.active { border-color:var(--navy); color:var(--navy); background:#EEF6FF; }
        .ct-filter-label {
          font-size:10px; font-weight:700; color:var(--muted);
          letter-spacing:1px; text-transform:uppercase;
        }
        .ct-clear-btn {
          font-size:11px; font-weight:600; color:var(--muted); background:none;
          border:none; cursor:pointer; padding:0; text-decoration:underline;
        }
        .ct-clear-btn:hover { color:var(--text); }
        /* Responsive */
        .ct-filter-bar { display:flex; align-items:center; gap:20px; flex-wrap:wrap; }
        .ct-filter-group { display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
        .ct-stats-bar { display:flex; align-items:center; justify-content:space-between; }
        @media (max-width: 640px) {
          .ct-filter-bar { flex-direction:column; align-items:flex-start; gap:10px; }
          .ct-filter-group { gap:4px; }
          .ct-stats-bar { flex-direction:column; align-items:flex-start; gap:8px; }
          .ct-col-hide { display:none; }
          .ct-name-cell { max-width:120px !important; }
        }
        @media (max-width: 480px) {
          .ct-pg-btn { width:26px; height:26px; font-size:11px; }
        }
      `}</style>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none"
          style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}>
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2"/>
          <path d="M15 15l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <input
          className="ct-search"
          type="text" autoComplete="off"
          value={q}
          onChange={e => { setQ(e.target.value); setLoading(true) }}
          placeholder="Search by client ID or name…"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '11px 38px 11px 40px', fontSize: '14px',
            border: '1.5px solid var(--border)', borderRadius: '8px',
            outline: 'none', fontFamily: 'var(--font)',
            background: 'white', color: 'var(--text)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}
        />
        {q && (
          <button onClick={() => setQ('')} style={{
            position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', fontSize: '18px', padding: '2px 6px', lineHeight: 1,
          }}>×</button>
        )}
      </div>

      {/* Filter bar */}
      <div className="ct-filter-bar" style={{
        padding: '10px 14px', background: '#F8FAFC',
        border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '10px',
      }}>
        {/* Stage */}
        <div className="ct-filter-group">
          <span className="ct-filter-label" style={{ marginRight: '2px' }}>Stage</span>
          {STAGE_OPTIONS.map(([v, label]) => (
            <button key={v} className={`ct-filter-btn${stage === v ? ' active' : ''}`} onClick={() => applyStage(v)}>
              {label}
            </button>
          ))}
        </div>

        {/* DPD */}
        <div className="ct-filter-group">
          <span className="ct-filter-label" style={{ marginRight: '2px' }}>DPD</span>
          {DPD_OPTIONS.map(([v, label]) => (
            <button key={v} className={`ct-filter-btn${dpd === v ? ' active' : ''}`} onClick={() => applyDpd(v)}>
              {label}
            </button>
          ))}
        </div>

        {/* Status */}
        <div className="ct-filter-group">
          <span className="ct-filter-label">Status</span>
          <select
            className={`ct-filter-select${status ? ' active' : ''}`}
            value={status}
            onChange={e => applyStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map(v => (
              <option key={v} value={v}>{v || 'All'}</option>
            ))}
          </select>
        </div>

        {/* Vintage */}
        <div className="ct-filter-group">
          <span className="ct-filter-label">Vintage</span>
          <select
            className={`ct-filter-select${vintage ? ' active' : ''}`}
            value={vintage}
            onChange={e => applyVintage(e.target.value)}
          >
            <option value="">All years</option>
            {VINTAGE_OPTIONS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Clear all */}
        {activeFilters > 0 && (
          <button
            className="ct-clear-btn"
            onClick={() => {
              setStage(''); setDpd(''); setStatus(''); setVintage(''); setPage(1); setLoading(true)
              pushParams(q.trim(), 1, '', '', '', '')
            }}
          >
            Clear filters ({activeFilters})
          </button>
        )}
      </div>

      {/* Stats bar + top pagination */}
      <div className="ct-stats-bar" style={{ marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} client${total !== 1 ? 's' : ''}${q ? ` matching "${q}"` : ''}`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {paginationButtons}
        </div>
      </div>

      {/* Table */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(header => (
                    <th key={header.id}
                      className={(header.column.columnDef.meta as { className?: string } | undefined)?.className}
                      style={{
                        padding: '10px 14px', textAlign: 'left',
                        fontSize: '10px', fontWeight: 700,
                        color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase',
                        background: '#F8FAFC', borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        width: header.getSize(),
                      }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {columns.map((_, ci) => (
                        <td key={ci} style={{ padding: '12px 14px' }}>
                          <div style={{
                            height: 12, borderRadius: 3,
                            background: '#EEF2F7',
                            width: `${[140, 90, 100, 70, 60, 80][ci] ?? 80}px`,
                            animation: `pulse 1.4s ease-in-out ${i * 0.07}s infinite`,
                          }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : table.getRowModel().rows.length === 0
                  ? (
                    <tr>
                      <td colSpan={columns.length} style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                        No clients found.
                      </td>
                    </tr>
                  )
                  : table.getRowModel().rows.map(row => (
                    <tr
                      key={row.id}
                      className="ct-row"
                      onClick={() => router.push(`/clients/${row.original.personal_id}`)}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id}
                          className={(cell.column.columnDef.meta as { className?: string } | undefined)?.className}
                          style={{ padding: '11px 14px', verticalAlign: 'middle' }}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {/* Bottom pagination */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderTop: '1px solid var(--border)',
          background: '#FAFBFC',
        }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
            Page {page} of {totalPages}
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {paginationButtons}
          </div>
        </div>
      </div>

    </>
  )
}
