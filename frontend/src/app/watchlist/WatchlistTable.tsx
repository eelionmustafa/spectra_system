'use client'

import {
  useReactTable, getCoreRowModel, createColumnHelper, flexRender,
} from '@tanstack/react-table'
import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import type { WatchlistClient } from '@/lib/queries'
import { fmt, fmtDate as formatDate } from '@/lib/formatters'
import { stageBadge, stageColor, dpdColor } from '@/lib/colors'
import DownloadCSV from '@/components/DownloadCSV'

const PAGE_SIZE = 25

function reviewStatus(days: number): { label: string; color: string; bg: string; border: string } {
  if (days > 60) return { label: 'Overdue Review', color: 'var(--red)',   bg: '#FEF2F2', border: '#FECACA' }
  if (days > 30) return { label: 'Review Due',     color: 'var(--amber)', bg: '#FFFBEB', border: '#FDE68A' }
  return           { label: 'Current',             color: 'var(--green)', bg: '#EAF9F2', border: '#A7F3D0' }
}

const ch = createColumnHelper<WatchlistClient>()

// ── Per-row action cell — has own state for freeze confirm/done ───────────────
function QuickActionsCell({ client }: { client: WatchlistClient }) {
  const [freeze, setFreeze] = useState<'idle' | 'confirming' | 'done' | 'error'>('idle')
  const isHighRisk = client.days_on_watch > 60 || client.stage === 'Stage 3' || client.stage === 'Stage 2'

  async function doFreeze() {
    try {
      const res = await fetch(`/api/clients/${client.personal_id}/freeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Watchlist review — credit limit freeze' }),
      })
      setFreeze(res.ok ? 'done' : 'error')
    } catch { setFreeze('error') }
  }

  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      <Link href={`/clients/${client.personal_id}`} style={{
        fontSize: '10px', fontWeight: 600, color: 'var(--blue)', textDecoration: 'none',
        padding: '3px 8px', borderRadius: '4px', background: '#EFF6FF', border: '1px solid #BFDBFE', whiteSpace: 'nowrap',
      }}>
        Review →
      </Link>
      {isHighRisk && (
        freeze === 'done'
          ? <span style={{ fontSize: '9px', color: 'var(--green)', fontWeight: 600, whiteSpace: 'nowrap' }}>✓ Frozen</span>
          : freeze === 'error'
          ? <span style={{ fontSize: '9px', color: 'var(--red)', fontWeight: 600 }}>Error</span>
          : freeze === 'confirming'
          ? <>
              <button onClick={doFreeze} style={{ fontSize: '9px', padding: '3px 7px', borderRadius: '4px', background: '#C43A3A', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Confirm</button>
              <button onClick={() => setFreeze('idle')} style={{ fontSize: '9px', padding: '3px 7px', borderRadius: '4px', background: 'white', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
            </>
          : <button onClick={() => setFreeze('confirming')} style={{
              fontSize: '9px', padding: '3px 8px', borderRadius: '4px',
              background: '#FEF2F2', color: '#C43A3A', border: '1px solid #FECACA',
              cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
            }}>
              Freeze
            </button>
      )}
    </div>
  )
}

const COLUMNS = [
  ch.accessor('full_name', {
    header: 'Client',
    cell: ({ row }) => {
      const c   = row.original
      const col = stageColor(c.stage)
      return (
        <Link href={`/clients/${c.personal_id}`} style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)', borderLeft: `2px solid ${col}`, paddingLeft: '8px' }}>
            {c.full_name}
          </div>
          <div className="mono" style={{ color: 'var(--muted)', fontSize: '10px', paddingLeft: '10px' }}>
            {c.personal_id} · {c.region}
          </div>
        </Link>
      )
    },
  }),
  ch.accessor('stage', {
    header: 'Stage',
    cell: ({ getValue }) => <span className={`badge ${stageBadge(getValue())}`}>{getValue()}</span>,
  }),
  ch.accessor('exposure', {
    header: 'Exposure',
    cell: ({ getValue }) => <span className="mono" style={{ fontWeight: 600 }}>{fmt(getValue())}</span>,
  }),
  ch.accessor('current_due_days', {
    header: 'DPD',
    cell: ({ getValue }) => {
      const v = getValue()
      return (
        <span className="mono" style={{ color: dpdColor(v), fontWeight: v >= 30 ? 700 : 400 }}>
          {v > 0 ? `${v}d` : '—'}
        </span>
      )
    },
  }),
  ch.accessor('days_on_watch', {
    header: 'On Watch',
    cell: ({ getValue }) => <span className="mono">{getValue()}d</span>,
  }),
  ch.display({
    id: 'review_status',
    header: 'Review Status',
    cell: ({ row }) => {
      const rev = reviewStatus(row.original.days_on_watch)
      return (
        <span style={{
          fontSize: '9px', padding: '2px 8px', borderRadius: '10px',
          background: rev.bg, color: rev.color, border: `1px solid ${rev.border}`,
          fontWeight: 600, fontFamily: 'var(--mono)', whiteSpace: 'nowrap',
        }}>
          {rev.label}
        </span>
      )
    },
  }),
  ch.accessor('added_at', {
    header: 'Added',
    cell: ({ getValue }) => <span className="mono" style={{ color: 'var(--muted)', fontSize: '10px' }}>{formatDate(getValue())}</span>,
  }),
  ch.accessor('added_by', {
    header: 'Added By',
    cell: ({ getValue }) => <span className="mono" style={{ color: 'var(--muted)', fontSize: '10px' }}>{getValue()}</span>,
  }),
  ch.display({
    id: 'quick_actions',
    header: '',
    cell: ({ row }) => <QuickActionsCell client={row.original} />,
  }),
]

interface Props {
  clients: WatchlistClient[]
  initialSearch: string
  initialStage: string
}

export default function WatchlistTable({ clients, initialSearch, initialStage }: Props) {
  const router     = useRouter()
  const pathname   = usePathname()
  const sp         = useSearchParams()
  const [, startT] = useTransition()
  const mountedRef = useRef(false)

  const [search, setSearch] = useState(initialSearch)
  const [stage,  setStage]  = useState(initialStage)
  const [page,   setPage]   = useState(1)

  const filtersRef = useRef({ stage })
  useEffect(() => { filtersRef.current = { stage } }, [stage])

  // Debounce search → reset to page 1
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    const t = setTimeout(() => {
      const params = new URLSearchParams(sp.toString())
      params.set('wq', search)
      params.set('wstage', filtersRef.current.stage)
      params.delete('wp')
      startT(() => router.replace(`${pathname}?${params}`, { scroll: false }))
    }, 280)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function pushStage(s: string) {
    setStage(s)
    filtersRef.current.stage = s
    const params = new URLSearchParams(sp.toString())
    params.set('wstage', s)
    params.delete('wp')
    startT(() => router.replace(`${pathname}?${params}`, { scroll: false }))
  }

  function pushPage(p: number) {
    setPage(p)
    const params = new URLSearchParams(sp.toString())
    params.set('wp', String(p))
    startT(() => router.replace(`${pathname}?${params}`, { scroll: false }))
  }

  // Client-side filter + paginate (full list fetched server-side already)
  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const matchQ     = !q || c.full_name.toLowerCase().includes(q) || c.personal_id.toLowerCase().includes(q) || c.region.toLowerCase().includes(q)
    const matchStage = !stage || c.stage === stage
    return matchQ && matchStage
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const table = useReactTable({
    data: paged,
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
  })

  const STAGES = ['Stage 1', 'Stage 2', 'Stage 3']

  function PaginationButtons() {
    if (totalPages <= 1) return null
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
        <button onClick={() => pushPage(1)} disabled={safePage === 1} className="pg-btn">«</button>
        <button onClick={() => pushPage(safePage - 1)} disabled={safePage === 1} className="pg-btn">‹</button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const start = Math.max(1, Math.min(safePage - 2, totalPages - 4))
          const p = start + i
          return p <= totalPages ? (
            <button key={p} onClick={() => pushPage(p)} className={`pg-btn${p === safePage ? ' active' : ''}`}>{p}</button>
          ) : null
        })}
        <button onClick={() => pushPage(safePage + 1)} disabled={safePage === totalPages} className="pg-btn">›</button>
        <button onClick={() => pushPage(totalPages)} disabled={safePage === totalPages} className="pg-btn">»</button>
        <span style={{ color: 'var(--muted)', marginLeft: '6px' }}>
          {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
        </span>
      </div>
    )
  }

  const overdueCount = filtered.filter(c => c.days_on_watch > 60).length

  return (
    <div className="panel">
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search by name, ID or region…"
          style={{
            flex: 1, minWidth: '200px', height: '32px', padding: '0 10px',
            border: '1px solid var(--border)', borderRadius: '7px',
            fontSize: '12px', fontFamily: 'var(--font)', color: 'var(--text)',
            background: '#F8FAFC', outline: 'none',
          }}
        />
        {/* Stage pills */}
        {['', ...STAGES].map(s => (
          <button
            key={s || 'all'}
            onClick={() => { pushStage(s); setPage(1) }}
            style={{
              padding: '4px 12px', borderRadius: '20px', border: '1px solid',
              fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              borderColor: stage === s ? 'var(--navy)' : 'var(--border)',
              background:   stage === s ? 'var(--navy)' : 'transparent',
              color:        stage === s ? 'white' : 'var(--muted)',
            }}
          >{s || 'All stages'}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {overdueCount > 0 && <span className="badge br">{overdueCount} overdue</span>}
          <DownloadCSV
            data={filtered as unknown as Record<string, unknown>[]}
            filename="spectra_watchlist"
            columns={[
              { key: 'personal_id',     label: 'Client ID' },
              { key: 'full_name',       label: 'Name' },
              { key: 'stage',           label: 'Stage' },
              { key: 'exposure',        label: 'Exposure (EUR)' },
              { key: 'current_due_days',label: 'DPD' },
              { key: 'region',          label: 'Region' },
              { key: 'days_on_watch',   label: 'Days on Watch' },
              { key: 'added_by',        label: 'Added By' },
              { key: 'added_at',        label: 'Added At' },
            ]}
          />
        </div>
      </div>

      {/* Top pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
          {filtered.length} client{filtered.length !== 1 ? 's' : ''} on watchlist
          {(search || stage) ? ` · filtered` : ''}
        </span>
        {PaginationButtons()}
      </div>

      {paged.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
          No clients match the current filters.
          {(search || stage) && (
            <button onClick={() => { setSearch(''); pushStage(''); setPage(1) }}
              style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--navy)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="tbl-wrap" style={{ maxHeight: 'none' }}>
          <table className="tbl tbl-alt">
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(h => (
                    <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom pagination */}
      {filtered.length > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
          {PaginationButtons()}
        </div>
      )}
    </div>
  )
}
