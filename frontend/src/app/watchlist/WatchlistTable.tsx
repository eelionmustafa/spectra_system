'use client'

import {
  useReactTable, getCoreRowModel, createColumnHelper, flexRender,
} from '@tanstack/react-table'
import { useState, useCallback, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
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

function QuickActionsCell({ client, onRemoved }: { client: WatchlistClient; onRemoved: (id: string) => void }) {
  const [freeze, setFreeze] = useState<'idle' | 'confirming' | 'done' | 'error'>('idle')
  const [remove, setRemove] = useState<'idle' | 'confirming' | 'loading' | 'error'>('idle')
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

  async function doRemove() {
    setRemove('loading')
    try {
      const res = await fetch(`/api/clients/${client.personal_id}/watchlist`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      onRemoved(client.personal_id)
    } catch { setRemove('error') }
  }

  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
      <Link href={`/clients/${client.personal_id}`} style={{
        fontSize: '10px', fontWeight: 600, color: 'var(--blue)', textDecoration: 'none',
        padding: '3px 8px', borderRadius: '4px', background: '#EFF6FF', border: '1px solid #BFDBFE', whiteSpace: 'nowrap',
      }}>
        Review →
      </Link>

      {remove === 'error'
        ? <span style={{ fontSize: '9px', color: 'var(--red)', fontWeight: 600 }}>Error</span>
        : remove === 'loading'
        ? <span style={{ fontSize: '9px', color: 'var(--muted)' }}>Removing…</span>
        : remove === 'confirming'
        ? <>
            <button onClick={doRemove} style={{ fontSize: '9px', padding: '3px 7px', borderRadius: '4px', background: '#C43A3A', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>Confirm remove</button>
            <button onClick={() => setRemove('idle')} style={{ fontSize: '9px', padding: '3px 7px', borderRadius: '4px', background: 'white', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
          </>
        : <button onClick={() => setRemove('confirming')} style={{
            fontSize: '9px', padding: '3px 8px', borderRadius: '4px',
            background: '#F8FAFC', color: 'var(--muted)', border: '1px solid var(--border)',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Remove</button>
      }

      {isHighRisk && (
        freeze === 'done'
          ? <span style={{ fontSize: '9px', color: 'var(--green)', fontWeight: 600, whiteSpace: 'nowrap' }}>✓ Frozen</span>
          : freeze === 'error'
          ? <span style={{ fontSize: '9px', color: 'var(--red)', fontWeight: 600 }}>Error</span>
          : freeze === 'confirming'
          ? <>
              <button onClick={doFreeze} style={{ fontSize: '9px', padding: '3px 7px', borderRadius: '4px', background: '#C43A3A', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Confirm freeze</button>
              <button onClick={() => setFreeze('idle')} style={{ fontSize: '9px', padding: '3px 7px', borderRadius: '4px', background: 'white', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
            </>
          : <button onClick={() => setFreeze('confirming')} style={{
              fontSize: '9px', padding: '3px 8px', borderRadius: '4px',
              background: '#FEF2F2', color: '#C43A3A', border: '1px solid #FECACA',
              cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
            }}>Freeze</button>
      )}
    </div>
  )
}

interface Props {
  initialRows:      WatchlistClient[]
  total:            number
  initialSearch:    string
  initialStage:     string
  initialPage:      number
  allClientsForCSV: WatchlistClient[]
}

const STAGES = ['Stage 1', 'Stage 2', 'Stage 3']

export default function WatchlistTable({
  initialRows, total, initialSearch, initialStage, initialPage, allClientsForCSV,
}: Props) {
  const router     = useRouter()
  const pathname   = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [rows,       setRows]       = useState(initialRows)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState('')
  const [bulking,    setBulking]    = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function navigate(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const handleSearch = useCallback((value: string) => {
    navigate({ wq: value, wpage: '' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pathname])

  function handleStage(value: string) { navigate({ wstage: value, wpage: '' }) }
  function handlePage(p: number)      { navigate({ wpage: p > 1 ? String(p) : '' }) }

  function handleRemoved(id: string) {
    setRows(prev => prev.filter(c => c.personal_id !== id))
    setCheckedIds(prev => { const next = new Set(prev); next.delete(id); return next })
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
        return <span className="mono" style={{ color: dpdColor(v), fontWeight: v >= 30 ? 700 : 400 }}>{v > 0 ? `${v}d` : '—'}</span>
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
          }}>{rev.label}</span>
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
      cell: ({ row }) => <QuickActionsCell client={row.original} onRemoved={handleRemoved} />,
    }),
  ]

  const table = useReactTable({
    data: rows,
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  })

  const overdueCount = initialRows.filter(c => c.days_on_watch > 60).length

  async function applyBulk() {
    if (!bulkAction || checkedIds.size === 0) return
    setBulking(true); setBulkResult(null)
    try {
      const res = await fetch('/api/actions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientIds: [...checkedIds], action: bulkAction }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setBulkResult(`Done — ${data.count} client${data.count !== 1 ? 's' : ''} updated${data.failed?.length ? `, ${data.failed.length} failed` : ''}`)
      if (bulkAction === 'Remove from Watchlist') {
        const removed = new Set(checkedIds)
        setRows(prev => prev.filter(c => !removed.has(c.personal_id)))
      }
      setCheckedIds(new Set())
      setBulkAction('')
    } catch (e) { setBulkResult(`Error: ${(e as Error).message}`) }
    finally { setBulking(false) }
  }

  function PaginationButtons() {
    if (totalPages <= 1) return null
    const p = initialPage
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button onClick={() => handlePage(1)} disabled={p === 1} className="wl-pg-btn">«</button>
        <button onClick={() => handlePage(p - 1)} disabled={p === 1} className="wl-pg-btn">‹</button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const start = Math.max(1, Math.min(p - 2, totalPages - 4))
          const pg = start + i
          return pg <= totalPages ? (
            <button key={pg} onClick={() => handlePage(pg)} className={`wl-pg-btn${pg === p ? ' active' : ''}`}>{pg}</button>
          ) : null
        })}
        <button onClick={() => handlePage(p + 1)} disabled={p === totalPages} className="wl-pg-btn">›</button>
        <button onClick={() => handlePage(totalPages)} disabled={p === totalPages} className="wl-pg-btn">»</button>
        <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px', whiteSpace: 'nowrap' }}>
          {((p - 1) * PAGE_SIZE) + 1}–{Math.min(p * PAGE_SIZE, total)} of {total}
        </span>
      </div>
    )
  }

  return (
    <div className="panel" style={{ padding: 0, opacity: isPending ? 0.6 : 1, transition: 'opacity 0.15s' }}>
      <style>{`
        .wl-pg-btn {
          width: 30px; height: 30px; border-radius: 6px;
          border: 1px solid var(--border); background: white;
          cursor: pointer; font-size: 12px; font-family: var(--mono);
          color: var(--text); display: inline-flex; align-items: center;
          justify-content: center; transition: background 0.1s; flex-shrink: 0;
        }
        .wl-pg-btn:hover:not(:disabled) { background: #EEF2F7; }
        .wl-pg-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .wl-pg-btn.active { background: var(--navy); color: white; border-color: var(--navy); font-weight: 700; }
        .wl-stage-pill {
          padding: 5px 12px; border-radius: 20px; border: 1px solid var(--border);
          font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;
          background: transparent; color: var(--muted); font-family: var(--font);
          transition: background 0.1s, color 0.1s, border-color 0.1s;
        }
        .wl-stage-pill:hover { background: #EEF2F7; color: var(--text-2); border-color: var(--border2); }
        .wl-stage-pill.active { background: var(--navy); color: white; border-color: var(--navy); }
        .wl-filter-bar { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
        .wl-filter-row1 { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .wl-filter-row2 { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
        .wl-stats-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
        .wl-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        @media (max-width: 640px) { .wl-pg-btn { width: 26px; height: 26px; font-size: 11px; } }
      `}</style>

      <div className="wl-filter-bar">
        <div className="wl-filter-row1">
          <div style={{ position: 'relative', flex: '1 1 160px' }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}>
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2"/>
              <path d="M15 15l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              defaultValue={initialSearch}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search name, ID or region…"
              style={{
                width: '100%', height: '32px', padding: '0 10px 0 30px',
                border: '1px solid var(--border)', borderRadius: '7px',
                fontSize: '12px', fontFamily: 'var(--font)', color: 'var(--text)',
                background: '#F8FAFC', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div className="wl-filter-row2">
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {['', ...STAGES].map(s => (
              <button
                key={s || 'all'}
                onClick={() => handleStage(s)}
                className={`wl-stage-pill${initialStage === s ? ' active' : ''}`}
              >{s || 'All'}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            {overdueCount > 0 && <span className="badge br">{overdueCount} overdue</span>}
            <DownloadCSV
              data={allClientsForCSV as unknown as Record<string, unknown>[]}
              filename="spectra_watchlist"
              columns={[
                { key: 'personal_id',      label: 'Client ID' },
                { key: 'full_name',        label: 'Name' },
                { key: 'stage',            label: 'Stage' },
                { key: 'exposure',         label: 'Exposure (EUR)' },
                { key: 'current_due_days', label: 'DPD' },
                { key: 'region',           label: 'Region' },
                { key: 'days_on_watch',    label: 'Days on Watch' },
                { key: 'added_by',         label: 'Added By' },
                { key: 'added_at',         label: 'Added At' },
              ]}
            />
          </div>
        </div>
      </div>

      {checkedIds.size > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 14px', background: '#EFF6FF', borderBottom: '1px solid #BFDBFE', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1D4ED8' }}>{checkedIds.size} selected</span>
          <select value={bulkAction} onChange={e => setBulkAction(e.target.value)}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 5, border: '1px solid #BFDBFE', background: 'white', color: 'var(--text)', fontFamily: 'var(--font)' }}>
            <option value="">Choose action…</option>
            <option value="Flag for Review">Flag for Review</option>
            <option value="Request Documents">Request Documents</option>
            <option value="Remove from Watchlist">Remove from Watchlist</option>
          </select>
          <button onClick={applyBulk} disabled={!bulkAction || bulking}
            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 5, border: 'none', background: '#1D4ED8', color: 'white', cursor: 'pointer', fontWeight: 600, opacity: (!bulkAction || bulking) ? 0.5 : 1 }}>
            {bulking ? 'Applying…' : 'Apply'}
          </button>
          <button onClick={() => { setCheckedIds(new Set()); setBulkAction(''); setBulkResult(null) }}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, border: '1px solid #BFDBFE', background: 'transparent', cursor: 'pointer', color: '#1D4ED8', marginLeft: 'auto' }}>
            × Clear
          </button>
          {bulkResult && <span style={{ fontSize: 11, color: bulkResult.startsWith('Done') ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{bulkResult}</span>}
        </div>
      )}

      <div className="wl-stats-bar">
        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
          {total} client{total !== 1 ? 's' : ''} on watchlist
          {(initialSearch || initialStage) ? ' · filtered' : ''}
          {isPending && <span style={{ marginLeft: 8, color: 'var(--blue)' }}>Loading…</span>}
        </span>
        <PaginationButtons />
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
          No clients match the current filters.
          {(initialSearch || initialStage) && (
            <button onClick={() => navigate({ wq: '', wstage: '', wpage: '' })}
              style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--navy)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="wl-scroll">
          <table className="tbl tbl-alt" style={{ minWidth: '700px' }}>
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  <th style={{ width: 40, padding: '9px 8px 9px 14px' }}>
                    <input type="checkbox"
                      checked={rows.length > 0 && rows.every(c => checkedIds.has(c.personal_id))}
                      onChange={e => setCheckedIds(e.target.checked ? new Set(rows.map(c => c.personal_id)) : new Set())}
                      style={{ cursor: 'pointer' }} />
                  </th>
                  {hg.headers.map(h => (
                    <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  <td style={{ padding: '9px 8px 9px 14px' }}>
                    <input type="checkbox"
                      checked={checkedIds.has(row.original.personal_id)}
                      onChange={e => setCheckedIds(prev => {
                        const next = new Set(prev)
                        e.target.checked ? next.add(row.original.personal_id) : next.delete(row.original.personal_id)
                        return next
                      })}
                      style={{ cursor: 'pointer' }} />
                  </td>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '10px 14px', borderTop: '1px solid var(--border)', background: '#FAFBFC' }}>
          <PaginationButtons />
        </div>
      )}
    </div>
  )
}
