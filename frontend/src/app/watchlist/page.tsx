export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import { getWatchlistClients } from '@/lib/queries'
import type { WatchlistClient } from '@/lib/queries'
import lazy from 'next/dynamic'
import { fmt } from '@/lib/formatters'
import { stageColor } from '@/lib/colors'
import SectionHeader from '@/components/SectionHeader'
import WatchlistTable from './WatchlistTable'
const _skel = () => <div style={{ height: 220, borderRadius: 8, background: '#F8FAFC', animation: 'pulse 1.5s ease-in-out infinite' }} />
const DPDBucketChart      = lazy(() => import('./DPDBucketChart'),      { loading: _skel })
const StageBreakdownDonut = lazy(() => import('./StageBreakdownDonut'), { loading: _skel })

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

async function WatchlistContent({ wq, wstage }: { wq: string; wstage: string }) {
  let clients: WatchlistClient[] = []
  let dbError = false
  try {
    clients = await getWatchlistClients()
  } catch {
    dbError = true
  }

  let totalExposure = 0, overdue = 0, reviewDue = 0, current = 0
  let stage1 = 0, stage2 = 0, stage3 = 0, dpdSum = 0
  let dpd0 = 0, dpd1_29 = 0, dpd30_89 = 0, dpd90p = 0
  for (const c of clients) {
    totalExposure += c.exposure
    dpdSum += c.current_due_days
    if (c.days_on_watch > 60) overdue++
    else if (c.days_on_watch > 30) reviewDue++
    else current++
    if (c.stage === 'Stage 1') stage1++
    else if (c.stage === 'Stage 2') stage2++
    else if (c.stage === 'Stage 3') stage3++
    const dpd = c.current_due_days
    if (dpd === 0) dpd0++
    else if (dpd < 30) dpd1_29++
    else if (dpd < 90) dpd30_89++
    else dpd90p++
  }
  const avgDPD = clients.length ? Math.round(dpdSum / clients.length) : 0

  const dpdBuckets = [
    { label: '0 DPD',  count: dpd0,     color: 'var(--green)' },
    { label: '1–29d',  count: dpd1_29,  color: 'var(--amber)' },
    { label: '30–89d', count: dpd30_89, color: '#E0883A' },
    { label: '90d+',   count: dpd90p,   color: 'var(--red)' },
  ]

  return (
    <div className="content">

        {dbError && (
          <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
            Database not connected — fill in <code>.env</code> with SSMS credentials.
          </div>
        )}

        {!dbError && clients.length === 0 && (
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

        {!dbError && clients.length > 0 && (
          <>
            <SectionHeader title="Portfolio at Risk" sub="watchlisted clients overview" />
            <div style={{
              background: 'var(--navy)', borderRadius: '12px', padding: '20px 24px',
              color: 'white', display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap',
            }}>
              <div style={{ flex: '0 0 auto' }}>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>
                  Watchlisted Clients
                </div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>
                  {clients.length}
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', marginTop: '4px', fontFamily: 'var(--mono)' }}>
                  At-risk exposure: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmt(totalExposure)}</span>
                </div>
              </div>

              {/* Review cadence bars */}
              <div style={{ flex: 1, minWidth: '200px' }}>
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
                      <div style={{ height: '100%', width: `${clients.length ? (r.count / clients.length) * 100 : 0}%`, background: r.color, borderRadius: '3px' }} />
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: r.color, minWidth: '16px', textAlign: 'right' }}>{r.count}</div>
                  </div>
                ))}
              </div>

              {/* Stage pills */}
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

            <SectionHeader title="Key Indicators" sub="review cadence & risk metrics" />
            <div className="row4">
              {[
                {
                  label: 'Overdue Reviews', sub: '>60 days without review',
                  val: String(overdue),
                  color: overdue > 0 ? 'var(--red)' : 'var(--green)',
                  badge: overdue > 0 ? 'br' : 'bg',
                  badgeLabel: overdue > 0 ? '⚠ Action needed' : '✓ None',
                },
                {
                  label: 'Total Exposure', sub: 'Watchlisted portfolio',
                  val: fmt(totalExposure),
                  color: 'var(--navy)', badge: 'bb', badgeLabel: 'At risk',
                },
                {
                  label: 'Avg DPD', sub: 'Days past due, watched clients',
                  val: `${avgDPD}d`,
                  color: avgDPD >= 30 ? 'var(--red)' : avgDPD > 0 ? 'var(--amber)' : 'var(--green)',
                  badge: avgDPD >= 30 ? 'br' : avgDPD > 0 ? 'ba' : 'bg',
                  badgeLabel: avgDPD >= 30 ? 'High' : avgDPD > 0 ? 'Watch' : 'Low',
                },
                {
                  label: 'Stage 3 Clients', sub: 'Credit-impaired on watchlist',
                  val: String(stage3),
                  color: stage3 > 0 ? 'var(--red)' : 'var(--green)',
                  badge: stage3 > 0 ? 'br' : 'bg',
                  badgeLabel: stage3 > 0 ? 'NPL' : '✓ None',
                },
              ].map(k => (
                <div key={k.label} className="kcard" style={{ borderLeft: `3px solid ${k.color}` }}>
                  <div className="kl">{k.label}</div>
                  <div className="kv" style={{ color: k.color }}>{k.val}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{k.sub}</div>
                    <span className={`badge ${k.badge}`}>{k.badgeLabel}</span>
                  </div>
                </div>
              ))}
            </div>

            <SectionHeader title="Risk Distribution" sub="DPD buckets & stage breakdown" />
            <div className="row2">
              <div className="panel">
                <div className="ph"><span className="pt">DPD bucket distribution</span><span className="pa">days past due</span></div>
                <DPDBucketChart data={dpdBuckets} />
              </div>
              <div className="panel">
                <div className="ph"><span className="pt">IFRS 9 stage breakdown</span><span className="pa">watchlisted clients</span></div>
                <StageBreakdownDonut
                  data={[
                    { label: 'Stage 1', count: stage1, color: '#10B981', desc: 'Performing — 12M ECL' },
                    { label: 'Stage 2', count: stage2, color: '#F59E0B', desc: 'SICR — Lifetime ECL' },
                    { label: 'Stage 3', count: stage3, color: '#EF4444', desc: 'Credit Impaired — NPL' },
                  ]}
                  total={clients.length}
                />
              </div>
            </div>

            <SectionHeader title="Active Monitoring" sub="search, filter, and review all watchlisted clients" />

            {overdue > 0 && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '4px solid var(--red)',
                borderRadius: '8px', padding: '10px 16px', marginBottom: '12px',
                display: 'flex', alignItems: 'center', gap: '12px',
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
              clients={clients}
              initialSearch={wq}
              initialStage={wstage}
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
  return (
    <>
      <Topbar title="Watchlist" sub="Active Monitoring" />
      <Suspense fallback={<div className="content"><WatchlistSkeleton /></div>}>
        <WatchlistContent wq={wq} wstage={wstage} />
      </Suspense>
    </>
  )
}
