'use client'

import { useState, useEffect, useCallback, useTransition, useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  useReactTable, getCoreRowModel, flexRender, createColumnHelper,
} from '@tanstack/react-table'
import type { EWIPredictionRow } from '@/lib/ewiPredictionsService'
import { seedPredictions } from './actions'
import { fmtDate } from '@/lib/formatters'

const ch = createColumnHelper<EWIPredictionRow>()

const RISK_META: Record<string, { bg: string; color: string; border: string }> = {
  Critical: { bg: '#FEE2E2', color: '#DC2626', border: '#FCA5A5' },
  High:     { bg: '#FEF2F2', color: '#C43A3A', border: '#FECACA' },
  Medium:   { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' },
  Low:      { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
}

function RiskBadge({ r }: { r: string }) {
  const m = RISK_META[r] ?? { bg: '#F1F5F9', color: '#94A3B8', border: '#E2E8F0' }
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 9px', borderRadius: '5px',
      background: m.bg, color: m.color, border: `1px solid ${m.border}`, whiteSpace: 'nowrap' }}>
      {r}
    </span>
  )
}

function RiskScore({ score, risk }: { score: number; risk: string }) {
  const m = RISK_META[risk] ?? { bg: '#F1F5F9', color: '#94A3B8', border: '#E2E8F0' }
  const pct = Math.round(score * 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: '14px', fontWeight: 800, color: m.color }}>{pct}</span>
      <div style={{ width: '40px', height: '3px', background: '#EEF2F7', borderRadius: '2px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: m.color, borderRadius: '2px' }} />
      </div>
    </div>
  )
}

function SignalTags({ raw }: { raw: string | null }) {
  const signals: string[] = (() => { try { return JSON.parse(raw ?? '[]') } catch { return [] } })()
  if (!signals.length) return <span style={{ fontSize: '11px', color: 'var(--muted)' }}>—</span>
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {signals.slice(0, 3).map((s, i) => (
        <span key={i} style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(255,255,255,0.07)', color: 'var(--text)', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
          {s}
        </span>
      ))}
      {signals.length > 3 && <span style={{ fontSize: '9px', color: 'var(--muted)' }}>+{signals.length - 3}</span>}
    </div>
  )
}

const columns = [
  ch.accessor('client_id', {
    header: 'Client ID',
    cell: ({ getValue }) => (
      <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: 'var(--blue)' }}>{getValue()}</span>
    ),
    size: 130,
  }),
  ch.display({
    id: 'score',
    header: 'Score',
    cell: ({ row }) => <RiskScore score={row.original.risk_score} risk={row.original.deterioration_risk} />,
    size: 70,
  }),
  ch.accessor('deterioration_risk', {
    header: 'Risk Level',
    cell: ({ getValue }) => <RiskBadge r={getValue()} />,
    size: 100,
  }),
  ch.accessor('key_signals', {
    header: 'Signals',
    cell: ({ getValue }) => <SignalTags raw={getValue()} />,
    size: 220,
  }),
  ch.accessor('run_date', {
    header: 'Date',
    cell: ({ getValue }) => (
      <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
        {fmtDate(getValue()) || '—'}
      </span>
    ),
    size: 100,
  }),
]

const RISK_OPTIONS = [['', 'All'], ['Critical', 'Critical'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']]

interface Props {
  initialRows:  EWIPredictionRow[]
  initialTotal: number
  initialQ:     string
  initialPage:  number
  initialRisk:  string
}

function PredictionDrawer({ row, onClose }: { row: EWIPredictionRow; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const m      = RISK_META[row.deterioration_risk] ?? RISK_META['Low']
  const pct    = Math.round(row.risk_score * 100)
  const signals: string[] = (() => { try { return JSON.parse(row.key_signals ?? '[]') } catch { return [] } })()

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,27,42,0.45)', zIndex: 50, animation: 'ew-fade 0.15s ease' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px,100vw)',
        background: 'var(--card)', zIndex: 51, boxShadow: '-8px 0 32px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        animation: 'ew-slide 0.22s cubic-bezier(0.25,0.46,0.45,0.94)' }}>
        <style>{`
          @keyframes ew-fade  { from{opacity:0} to{opacity:1} }
          @keyframes ew-slide { from{transform:translateX(100%)} to{transform:translateX(0)} }
        `}</style>

        {/* Header */}
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            background: m.bg, border: `2px solid ${m.color}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '16px', fontWeight: 900, color: m.color, fontFamily: 'var(--mono)', lineHeight: 1 }}>{pct}</span>
            <span style={{ fontSize: '8px', color: m.color, fontWeight: 600 }}>/ 100</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)', marginBottom: '4px' }}>{row.client_id}</div>
            <div style={{ display: 'flex', gap: '6px' }}><RiskBadge r={row.deterioration_risk} /></div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '20px', padding: '0 4px' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {signals.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>Key Signals</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {signals.map((s, i) => (
                  <span key={i} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '5px', background: 'rgba(255,255,255,0.07)', color: 'var(--text)', border: '1px solid var(--border)' }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {row.ai_reasoning && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>AI Analysis</div>
              <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '7px', borderLeft: `3px solid ${m.color}`, fontSize: '12px', color: 'var(--text)', lineHeight: '1.6' }}>
                {row.ai_reasoning}
              </div>
            </div>
          )}

          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: 'auto' }}>
            Run: <span style={{ fontFamily: 'var(--mono)' }}>{fmtDate(row.run_date) || row.run_date}</span>
          </div>

          <a href={`/clients/${row.client_id}`} style={{ display: 'block', textAlign: 'center', padding: '10px',
            background: 'var(--navy)', color: 'white', borderRadius: '7px', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>
            View Client Profile →
          </a>
        </div>
      </div>
    </>
  )
}

export default function PredictionsTable({ initialRows, initialTotal, initialQ, initialPage, initialRisk }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [seeding, startSeed] = useTransition()
  const [seedMsg, setSeedMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [rows,     setRows]     = useState(initialRows)
  const [total,    setTotal]    = useState(initialTotal)
  const [q,        setQ]        = useState(initialQ)
  const [page,     setPage]     = useState(initialPage)
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState<EWIPredictionRow | null>(null)
  const [risk,     setRisk]     = useState(initialRisk)

  const mounted   = useRef(false)
  const riskRef   = useRef(risk)
  useEffect(() => { riskRef.current = risk }, [risk])

  const totalPages = Math.max(1, Math.ceil(total / 25))

  const pushParams = useCallback((nq: string, np: number, nr: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (nq) p.set('pq', nq); else p.delete('pq')
    if (np > 1) p.set('pp', String(np)); else p.delete('pp')
    if (nr) p.set('prisk', nr); else p.delete('prisk')
    startTransition(() => { router.push(`${pathname}?${p.toString()}`) })
  }, [router, pathname, searchParams])

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    setLoading(true)
    const t = setTimeout(() => { pushParams(q.trim(), 1, riskRef.current) }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  useEffect(() => {
    setRows(initialRows); setTotal(initialTotal); setPage(initialPage); setRisk(initialRisk); setLoading(false)
  }, [initialRows, initialTotal, initialPage, initialRisk])

  function applyRisk(v: string) { setRisk(v); setPage(1); setLoading(true); pushParams(q.trim(), 1, v) }

  function handleSeed() {
    startSeed(async () => {
      setSeedMsg(null)
      const res = await seedPredictions()
      if (res.ok) {
        setSeedMsg({ ok: true, text: `Generated ${res.count.toLocaleString()} predictions from database.` })
        router.refresh()
      } else {
        setSeedMsg({ ok: false, text: res.error ?? 'Seed failed.' })
      }
    })
  }

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), manualPagination: true, pageCount: totalPages })

  function PgBtns() {
    return (
      <>
        <button className="ew-pg-btn" disabled={page <= 1 || loading}
          onClick={() => { setPage(p => p - 1); pushParams(q.trim(), page - 1, risk) }}>‹</button>
        {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
          const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i
          return <button key={p} className={`ew-pg-btn${p === page ? ' active' : ''}`} disabled={loading}
            onClick={() => { setPage(p); pushParams(q.trim(), p, risk) }}>{p}</button>
        })}
        <button className="ew-pg-btn" disabled={page >= totalPages || loading}
          onClick={() => { setPage(p => p + 1); pushParams(q.trim(), page + 1, risk) }}>›</button>
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
          placeholder="Search by client ID…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '11px 38px 11px 40px', fontSize: '14px',
            border: '1.5px solid var(--border)', borderRadius: '8px', outline: 'none', fontFamily: 'var(--font)',
            background: 'var(--card)', color: 'var(--text)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }} />
        {q && <button onClick={() => setQ('')} style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '18px', padding: '2px 6px' }}>×</button>}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span className="ew-flbl" style={{ marginRight: '2px' }}>Risk Level</span>
          {RISK_OPTIONS.map(([v, label]) => (
            <button key={v} className={`ew-fb${risk === v ? ' active' : ''}`} onClick={() => applyRisk(v)}>{label}</button>
          ))}
        </div>
        {risk && (
          <button style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => applyRisk('')}>Clear</button>
        )}
        <button
          onClick={handleSeed}
          disabled={seeding}
          style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: '5px', border: '1.5px solid var(--border)',
            background: seeding ? 'rgba(255,255,255,0.04)' : 'var(--card)', cursor: seeding ? 'not-allowed' : 'pointer',
            fontSize: '11px', fontWeight: 600, color: seeding ? 'var(--muted)' : 'var(--navy)', fontFamily: 'var(--font)' }}
        >
          {seeding ? 'Generating…' : '↻ Generate from DB'}
        </button>
      </div>

      {/* Seed result toast */}
      {seedMsg && (
        <div style={{ padding: '9px 14px', borderRadius: '7px', marginBottom: '10px', fontSize: '12px', fontWeight: 500,
          background: seedMsg.ok ? 'rgba(46,204,138,0.1)' : 'rgba(232,87,87,0.1)',
          color: seedMsg.ok ? '#1A9E60' : '#C43A3A',
          border: `1px solid ${seedMsg.ok ? 'rgba(46,204,138,0.3)' : 'rgba(232,87,87,0.3)'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{seedMsg.text}</span>
          <button onClick={() => setSeedMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '16px', padding: '0 4px' }}>×</button>
        </div>
      )}

      {/* Stats + top pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} prediction${total !== 1 ? 's' : ''}${q ? ` matching "${q}"` : ''}`}
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
                          width: `${[100,40,70,160,70][ci]??70}px`,
                          animation: `pulse 1.4s ease-in-out ${i*0.07}s infinite` }} />
                      </td>
                    ))}</tr>
                  ))
                : table.getRowModel().rows.length === 0
                  ? <tr><td colSpan={columns.length} style={{ padding: '48px', textAlign: 'center' }}>
                      <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>No predictions yet.</div>
                      <button onClick={handleSeed} disabled={seeding} style={{
                        padding: '10px 22px', borderRadius: '7px', border: 'none', cursor: seeding ? 'not-allowed' : 'pointer',
                        background: 'var(--navy)', color: 'white', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font)',
                        opacity: seeding ? 0.6 : 1,
                      }}>
                        {seeding ? 'Generating predictions…' : '↻ Generate from database'}
                      </button>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '8px' }}>
                        Scores all at-risk clients using IFRS 9 stage + DPD data
                      </div>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Page {page} of {totalPages}</span>
          <div style={{ display: 'flex', gap: '4px' }}>{PgBtns()}</div>
        </div>
      </div>

      {selected && <PredictionDrawer row={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
