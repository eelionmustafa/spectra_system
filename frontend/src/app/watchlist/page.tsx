export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import { getWatchlistClients, getWatchlistClientsPaginated } from '@/lib/queries'
import type { WatchlistClient } from '@/lib/queries'
import { fmt } from '@/lib/formatters'
import SectionHeader from '@/components/SectionHeader'
import WatchlistTable from './WatchlistTable'

function WatchlistSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ height: 100, borderRadius: 12, background: '#0D1B2A', opacity: 0.12, animation: 'pulse 1.4s ease-in-out infinite' }} />
      <div className="row4">
        {[0,1,2,3].map(i => (
          <div key={i} className="kcard" style={{ animation: `pulse 1.4s ease-in-out ${i*0.08}s infinite` }}>
            <div style={{ height: 11, width: '60%', borderRadius: 3, background: '#EEF2F7', marginBottom: 8 }} />
            <div style={{ height: 26, width: '45%', borderRadius: 4, background: '#EEF2F7', marginBottom: 8 }} />
            <div style={{ height: 11, width: '80%', borderRadius: 3, background: '#F1F5F9' }} />
          </div>
        ))}
      </div>
      <div style={{ height: 260, borderRadius: 10, border: '1px solid var(--border)', background: '#F8FAFC', animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
    </div>
  )
}

function reviewStatus(days: number): { label: string; color: string; bg: string; border: string } {
  if (days > 60) return { label: 'Overdue Review', color: 'var(--red)',   bg: '#FEF2F2', border: '#FECACA' }
  if (days > 30) return { label: 'Review Due',     color: 'var(--amber)', bg: '#FFFBEB', border: '#FDE68A' }
  return           { label: 'Current',             color: 'var(--green)', bg: '#EAF9F2', border: '#A7F3D0' }
}

async function WatchlistContent({
  wq, wstage, page,
}: {
  wq: string; wstage: string; page: number
}) {
  let allClients: WatchlistClient[] = []
  let rows: WatchlistClient[] = []
  let total = 0
  let dbError = false

  try {
    // Summary stats need all clients (tiny query, no enrichment needed for counts)
    // Paginated rows for the table
    const [summary, paged] = await Promise.all([
      getWatchlistClients(),
      getWatchlistClientsPaginated(wq, wstage, page),
    ])
    allClients = summary
    rows  = paged.rows
    total = paged.total
  } catch {
    dbError = true
  }

  let totalExposure = 0, overdue = 0, reviewDue = 0, current = 0
  let stage2 = 0, stage3 = 0
  for (const c of allClients) {
    totalExposure += c.exposure
    if (c.days_on_watch > 60) overdue++
    else if (c.days_on_watch > 30) reviewDue++
    else current++
    if (c.stage === 'Stage 2') stage2++
    else if (c.stage === 'Stage 3') stage3++
  }
  void reviewDue; void current

  return (
    <div className="content">

        {dbError && (
          <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
            Database not connected — fill in <code>.env</code> with SSMS credentials.
          </div>
        )}

        {!dbError && allClients.length === 0 && (
          <div className="panel" style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.4 }}>📋</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
              No clients on the watchlist
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', maxWidth: '320px', margin: '0 auto' }}>
              Use <strong>Add to Watchlist</strong> on any client profile to begin formal monitoring.
              Clients are reviewed on a 30-day cadence.
            </div>
            <Link href="/clients" style={{
              display: 'inline-block', marginTop: '16px', fontSize: '11px',
              color: 'var(--navy)', textDecoration: 'none', padding: '6px 14px',
              border: '1px solid var(--border)', borderRadius: '7px', background: '#F8FAFC',
            }}>
              Browse clients →
            </Link>
          </div>
        )}

        {!dbError && allClients.length > 0 && (
          <>
            <SectionHeader title="Portfolio at Risk" sub="watchlisted clients overview" />
            <div style={{
              background: 'var(--navy)', borderRadius: '12px', padding: '20px 24px',
              color: 'white', display: 'flex', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap',
            }}>
              <div style={{ flex: '0 0 auto' }}>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>
                  Watchlisted Clients
                </div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>
                  {allClients.length}
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', marginTop: '4px', fontFamily: 'var(--mono)' }}>
                  At-risk exposure: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmt(totalExposure)}</span>
                </div>
              </div>

              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Review cadence (30-day cycle)
                </div>
                {[
                  { label: 'Overdue (>60d)',  count: overdue,   color: 'var(--red)' },
                  { label: 'Due (31–60d)',     count: reviewDue, color: 'var(--amber)' },
                  { label: 'Current (≤30d)',   count: current,   color: 'var(--green)' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                    <div style={{ width: '80px', fontSize: '8px', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{r.label}</div>
                    <div style={{ flex: 1, height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${allClients.length ? (r.count / allClients.length) * 100 : 0}%`, background: r.color, borderRadius: '3px' }} />
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: r.color, minWidth: '16px', textAlign: 'right' }}>{r.count}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Stage 2', count: stage2, color: 'var(--amber)', desc: 'SICR Watch' },
                  { label: 'Stage 3', count: stage3, color: 'var(--red)',   desc: 'Impaired' },
                ].map(s => (
                  <div key={s.label} style={{
                    background: 'rgba(255,255,255,0.07)', border: `1px solid ${s.color}40`,
                    borderRadius: '8px', padding: '10px 16px', textAlign: 'center', minWidth: '80px',
                  }}>
                    <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.35)', marginBottom: '2px' }}>{s.desc}</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.count}</div>
                    <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <SectionHeader title="Active Monitoring" sub="search, filter, and review all watchlisted clients" />

            {overdue > 0 && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '4px solid var(--red)',
                borderRadius: '8px', padding: '10px 16px', marginBottom: '12px',
                display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: '20px', lineHeight: 1 }}>⚠</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--red)' }}>
                    {overdue} client{overdue > 1 ? 's' : ''} overdue for review (&gt;60 days)
                  </div>
                  <div style={{ fontSize: '10px', color: '#92140C', marginTop: '2px' }}>
                    Use <strong>Review →</strong> to open the client profile, or <strong>Freeze</strong> to immediately suspend credit limit
                  </div>
                </div>
              </div>
            )}

            <WatchlistTable
              initialRows={rows}
              total={total}
              initialSearch={wq}
              initialStage={wstage}
              initialPage={page}
              allClientsForCSV={allClients}
            />
          </>
        )}

    </div>
  )
}

export default async function Watchlist({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp     = await searchParams
  const wq     = (sp.wq     ?? '').trim()
  const wstage = (sp.wstage ?? '').trim()
  const page   = Math.max(1, parseInt(sp.wpage ?? '1', 10) || 1)
  return (
    <>
      <Topbar title="Watchlist" sub="Active Monitoring" />
      <Suspense fallback={<div className="content"><WatchlistSkeleton /></div>}>
        <WatchlistContent wq={wq} wstage={wstage} page={page} />
      </Suspense>
    </>
  )
}
