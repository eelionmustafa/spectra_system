export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import { getDashboardKPIs, getStageDistribution, getRecentTransactions, getMonthlyExposureTrend, getHighestRiskClient } from '@/lib/queries'

import { KPI } from '@/lib/config'
import { fmt, fmtDate } from '@/lib/formatters'
import { stageBadge } from '@/lib/colors'
import lazy from 'next/dynamic'
const ExposureTrendChart = lazy(
  () => import('./DashboardCharts').then(m => ({ default: m.ExposureTrendChart })),
  { loading: () => <div style={{ height: 200, borderRadius: 8, background: '#F8FAFC', animation: 'pulse 1.5s ease-in-out infinite' }} /> }
)


/* ─── Deferred sections — don't block KPIs or stage distribution ──────────── */
async function TrendSection() {

  const trend = await getMonthlyExposureTrend().catch(() => [])
  return (
    <div className="panel">
      <div className="ph">
        <span className="pt">Monthly exposure trend</span>
        <span className="pa">12 months</span>
      </div>

      {trend.length > 0
        ? <ExposureTrendChart data={trend} />
        : <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 11 }}>
            Trend data unavailable
          </div>
      }

    </div>

  )
}


async function TransactionsSection() {

  const transactions = await getRecentTransactions().catch(() => [])
  return (
    <div className="panel">
      <div className="ph">
        <span className="pt">Recent transactions</span>
        <span className="pa">Last 30 days</span>
      </div>

      {transactions.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: 11 }}>
          Transaction data unavailable
        </div>

      ) : (
        <div className="tbl-wrap">
          <table className="tbl tbl-alt">
            <thead>
              <tr><th>Client</th><th>Type</th><th>Amount</th><th>Date</th><th>Stage</th></tr>
            </thead>

            <tbody>
              {transactions.map((t, i) => (
                <tr key={i}>
                  <td>
                    <Link href={`/clients/${t.personal_id}`} className="mono"
                      style={{ textDecoration: 'none', color: 'var(--blue)' }}>
                      {t.personal_id} ↗
                    </Link>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{t.product_type}</td>
                  <td className="mono" style={{
                    color: (t.amount ?? 0) > 50000 ? 'var(--navy)' : 'var(--text)',
                    fontWeight: (t.amount ?? 0) > 50000 ? 600 : 400,
                  }}>
                    {fmt(t.amount)}
                  </td>
                  <td className="mono" style={{ color: 'var(--muted)' }}>{t.date}</td>
                  <td><span className={`badge ${stageBadge(t.stage)}`}>{t.stage ?? 'N/A'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


/* ─── helpers ─────────────────────────────────────────────────────────────── */

const MM: Record<string, string> = {
  '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun',
  '07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec',
}



const STAGE_COLORS: Record<string, string> = {
  'Stage 1': '#2ECC8A',
  'Stage 2': '#F0A04B',
  'Stage 3': '#E85757',
}

// healthColor and healthBg map DB health_label to CSS colors (display-only, not business values)
function healthColorFromLabel(label: string): { color: string; bg: string } {
  if (label === 'Healthy')  return { color: '#2ECC8A', bg: 'rgba(46,204,138,0.12)' }
  if (label === 'Watch')    return { color: '#F0A04B', bg: 'rgba(240,160,75,0.12)' }
  if (label === 'Stressed') return { color: '#E85757', bg: 'rgba(232,87,87,0.12)' }
  return                           { color: '#7F1D1D', bg: 'rgba(127,29,29,0.15)' }
}

/* ─── page ────────────────────────────────────────────────────────────────── */
export default async function Dashboard() {
  const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  let kpis, stages
  let highestRiskId = ''
  try {
    ;[kpis, stages, highestRiskId] = await Promise.all([
      getDashboardKPIs(),
      getStageDistribution(),
      getHighestRiskClient().catch(() => ''),
    ])
  } catch {
    return (
      <>
        <Topbar title="Dashboard" sub={monthLabel} />
        <div className="content">
          <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
            Database not connected — fill in <code>.env</code> with SSMS credentials.
          </div>
        </div>
      </>
    )
  }

  // Trend query is deferred to the TrendSection Suspense boundary below — doesn't block this render

  // health_score and health_label come pre-computed from SQL (getDashboardKPIs CTE)
  const health = { score: kpis.health_score, label: kpis.health_label, ...healthColorFromLabel(kpis.health_label) }

  /* donut — r=46, circ≈289 */
  const r = 46, circ = 2 * Math.PI * r
  const total = stages.reduce((s, x) => s + x.count, 0)
  const segments = stages.reduce<Array<{ stage: string; count: number; exposure: number; dash: number; arcOffset: number; pct: string; color: string }>>((acc, row) => {
    const dash = total ? (row.count / total) * circ : 0
    const arcOffset= acc.length > 0 ? acc[acc.length - 1].arcOffset + acc[acc.length - 1].dash : 0
    acc.push({ stage: row.stage, count: row.count, exposure: row.exposure ?? 0, dash, arcOffset, pct: total ? ((row.count / total) * 100).toFixed(1) : '0', color: STAGE_COLORS[row.stage] ?? '#EEF2F7' })
    return acc
  }, [])


  const stage3 = stages.find(s => s.stage === 'Stage 3')
  const stage2 = stages.find(s => s.stage === 'Stage 2')

  // ── Priority Actions: derive contextual tasks from live data ──────────────
  type PA = { label: string; desc: string; href: string; color: string; bg: string; border: string }
  const priorityActions: PA[] = []
  if (kpis.npl_ratio_pct > KPI.NPL_RED)
    priorityActions.push({ label: 'NPL Ratio Elevated', desc: `Portfolio NPL at ${kpis.npl_ratio_pct}% — review flagged clients and check Stage 3 provisioning`, href: '/warnings', color: '#C43A3A', bg: '#FEF2F2', border: '#FECACA' })
  if ((stage3?.count ?? 0) > 0)
    priorityActions.push({ label: `${stage3!.count} Credit-Impaired Client${stage3!.count > 1 ? 's' : ''}`, desc: `Stage 3 accounts require active workout, restructuring review, or write-off assessment${highestRiskId ? ` — highest exposure: ${highestRiskId}` : ''}`, href: highestRiskId ? `/clients/${highestRiskId}` : '/watchlist', color: '#C43A3A', bg: '#FEF2F2', border: '#FECACA' })
  if (kpis.delinquency_rate_pct > KPI.DELINQUENCY_RED)
    priorityActions.push({ label: 'Delinquency Above Threshold', desc: `${kpis.delinquency_rate_pct}% of clients DPD ≥ 30 — check watchlist for clients with overdue reviews`, href: '/watchlist', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' })
  if (health.label === 'Stressed')
    priorityActions.push({ label: 'Portfolio Under Stress', desc: `Health score ${health.score}/100 — run PD shock scenarios to assess capital adequacy impact`, href: '/stress', color: '#C43A3A', bg: '#FEF2F2', border: '#FECACA' })

  return (
    <>
      <Topbar title="Dashboard" sub={monthLabel} />
      <div className="content">

        {/* ── Portfolio health banner ─────────────────────────────────── */}
        <div style={{
          background: 'var(--navy)', borderRadius: '12px', padding: '18px 22px',
          display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: '180px' }}>
            <div style={{ fontSize: '9px', color: 'var(--slate)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '5px' }}>
              Portfolio Health Score
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '9px' }}>
              <span style={{ fontSize: '36px', fontWeight: 700, color: health.color, fontFamily: 'var(--mono)', lineHeight: 1 }}>
                {health.score}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--slate)' }}>/100</span>
              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px',
                background: health.bg, color: health.color, marginLeft: '2px',
              }}>
                {health.label}
              </span>
            </div>
            <div style={{ width: '180px', height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px' }}>
              <div style={{ width: `${health.score}%`, height: '100%', background: health.color, borderRadius: '3px' }} />
            </div>
          </div>


          <div style={{ width: '1px', height: '54px', background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />

          {[
            { label: 'Total Exposure',  value: fmt(kpis.total_exposure), color: 'var(--gold)' },
            { label: 'NPL Ratio',       value: kpis.npl_ratio_pct + '%',  color: kpis.npl_ratio_pct > KPI.NPL_RED ? '#E85757' : '#F0A04B' },
            { label: 'Stage 3 Clients', value: String(stage3?.count ?? 0), color: '#E85757' },
            { label: 'Stage 2 Clients', value: String(stage2?.count ?? 0), color: '#F0A04B' },
            { label: 'Avg DPD',         value: kpis.avg_due_days + 'd',  color: 'var(--slate2)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ minWidth: '72px' }}>
              <div style={{ fontSize: '9px', color: 'var(--slate)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '4px' }}>
                {label}
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color, fontFamily: 'var(--mono)' }}>
                {value}
              </div>
            </div>
          ))}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexShrink: 0 }}>
            <Link href="/warnings" style={{
              padding: '8px 14px', borderRadius: '7px',
              background: 'rgba(232,87,87,0.15)', border: '1px solid rgba(232,87,87,0.3)',
              color: '#E85757', fontSize: '11px', fontWeight: 600, textDecoration: 'none',
            }}>
              ⚠ Warnings
            </Link>
            <Link href="/clients" style={{
              padding: '8px 14px', borderRadius: '7px',
              background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)',
              color: 'var(--gold)', fontSize: '11px', fontWeight: 600, textDecoration: 'none',
            }}>
              Client Search
            </Link>
          </div>
        </div>


        {/* ── Priority Actions ────────────────────────────────────────── */}
        {priorityActions.length > 0 && (
          <div style={{
            background: '#FFFBEB', border: '1px solid #FDE68A', borderLeft: '3px solid #D97706',
            borderRadius: '8px', padding: '12px 16px',
          }}>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#92400E', fontWeight: 700, marginBottom: '10px' }}>
              Today&apos;s Priorities — {priorityActions.length} action{priorityActions.length > 1 ? 's' : ''} required
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {priorityActions.map((a, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  background: 'white', borderRadius: '6px', padding: '8px 12px',
                  border: `1px solid ${a.border}`,
                }}>
                  <div style={{ width: '3px', height: '32px', background: a.color, borderRadius: '2px', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: a.color }}>{a.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)', lineHeight: 1.4 }}>{a.desc}</div>
                  </div>
                  <Link href={a.href} style={{
                    fontSize: '10px', fontWeight: 600, color: a.color, textDecoration: 'none',
                    padding: '4px 10px', borderRadius: '5px', background: a.bg,
                    border: `1px solid ${a.border}`, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    Review →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* ── KPI cards ─────────────────────────────────────────────── */}
        <div className="row4">
          <div className="kcard" style={{ background: 'var(--navy)', borderColor: 'rgba(201,168,76,0.2)', borderLeft: '3px solid var(--gold)' }}>
            <div className="kl" style={{ color: 'var(--slate)' }}>Total Exposure</div>
            <div className="kv" style={{ color: 'var(--gold)', marginBottom: '4px' }}>
              €{(kpis.total_exposure / 1_000_000).toFixed(1)}M
            </div>
            <div style={{ fontSize: '10px', color: 'var(--slate)', marginBottom: '6px' }}>Gross credit portfolio</div>
            <span className="badge" style={{ background: 'rgba(201,168,76,0.15)', color: 'var(--gold2)' }}>{kpis.total_clients} accounts</span>
          </div>


          <div className="kcard">
            <div className="kl">Total Clients</div>
            <div className="kv" style={{ color: 'var(--blue)', marginBottom: '4px' }}>{kpis.total_clients}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '6px' }}>In active portfolio</div>
            <span className="badge bb">Monitored</span>
          </div>


          <div className="kcard">
            <div className="kl">Delinquency Rate</div>
            <div className="kv" style={{ color: kpis.delinquency_rate_pct > KPI.DELINQUENCY_RED ? 'var(--red)' : 'var(--amber)', marginBottom: '4px' }}>
              {kpis.delinquency_rate_pct}%
            </div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '6px' }}>Clients with DPD ≥ 30</div>
            <span className={`badge ${kpis.delinquency_rate_pct > KPI.DELINQUENCY_RED ? 'br' : 'ba'}`}>
              {kpis.delinquency_rate_pct > KPI.DELINQUENCY_RED ? '⚠ High' : 'Moderate'}
            </span>
          </div>


          <div className="kcard">
            <div className="kl">NPL Ratio</div>
            <div className="kv" style={{ color: kpis.npl_ratio_pct > KPI.NPL_RED ? 'var(--red)' : 'var(--amber)', marginBottom: '4px' }}>
              {kpis.npl_ratio_pct}%
            </div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '6px' }}>Stage 3 exposure / total (IFRS 9)</div>
            <span className={`badge ${kpis.npl_ratio_pct > KPI.NPL_RED ? 'br' : 'bg'}`}>
              {kpis.npl_ratio_pct > KPI.NPL_RED ? `⚠ Above ${KPI.NPL_RED}%` : 'In range'}
            </span>
          </div>
        </div>


        {/* ── Charts ────────────────────────────────────────────────── */}
        <div className="row2">

          {/* Trend streams in independently — doesn't block KPIs or stage donut */}
          <Suspense fallback={
            <div className="panel">
              <div className="ph"><span className="pt">Monthly exposure trend</span><span className="pa">12 months</span></div>
              <div style={{ height: 200, borderRadius: 8, background: '#F8FAFC', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          }>
            <TrendSection />
          </Suspense>


          {/* Stage distribution */}
          <div className="panel">
            <div className="ph"><span className="pt">IFRS 9 stage distribution</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '8px' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
                <circle cx="60" cy="60" r={r} fill="none" stroke="#EEF2F7" strokeWidth="16" />
                {segments.map((s, i) => (
                  <circle key={i} cx="60" cy="60" r={r} fill="none"
                    stroke={s.color} strokeWidth="16"
                    strokeDasharray={`${s.dash} ${circ - s.dash}`}
                    strokeDashoffset={-s.arcOffset}
                    transform="rotate(-90 60 60)" />
                ))}
                <text x="60" y="55" textAnchor="middle" fontSize="20" fontWeight="700" fill="#0D1B2A" fontFamily="IBM Plex Mono, monospace">{total}</text>
                <text x="60" y="70" textAnchor="middle" fontSize="9" fill="#8FA3B8" fontFamily="Sora, sans-serif">clients</text>
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                {segments.map((s) => (
                  <div key={s.stage} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: s.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{s.stage}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{s.count} clients · {s.pct}%</div>
                    </div>
                    <div style={{
                      fontSize: '10px', fontFamily: 'var(--mono)',
                      padding: '2px 8px', borderRadius: '5px',
                      background: `${s.color}18`, color: s.color, fontWeight: 600,
                    }}>
                      {fmt(s.exposure ?? 0)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>


        {/* ── Transactions + nav cards ───────────────────────────── */}
        <div className="row2">

          <Suspense fallback={
            <div className="panel">
              <div className="ph"><span className="pt">Recent transactions</span><span className="pa">Last 30 days</span></div>
              <div style={{ height: 160, borderRadius: 8, background: '#F8FAFC', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          }>
            <TransactionsSection />
          </Suspense>


          <div className="panel">
            <div className="ph"><span className="pt">Navigate to</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { label: 'Early Warnings', desc: 'ML-flagged risk alerts with PD scores', href: '/warnings', color: '#C43A3A', bg: '#FEF0F0', border: '#F7C1C1' },
                { label: 'Client Search',  desc: 'Browse any client & their risk profile', href: '/clients',  color: '#185FA5', bg: '#E6F1FB', border: '#BDD9F5' },
                { label: 'Portfolio',      desc: 'Exposure by product, region & segment', href: '/portfolio', color: 'var(--navy)', bg: '#EEF2F7', border: 'var(--border)' },
                { label: 'Analytics',      desc: 'Rollrate, ECL gap, NPL & vintage',     href: '/analytics', color: '#1A9E60', bg: '#EAF9F2', border: '#A7F3D0' },
              ].map(({ label, desc, href, color, bg, border }) => (
                <Link key={href} href={href} className="nav-card" style={{ border: `1px solid ${border}`, background: bg }}>
                  <div style={{ color, marginBottom: '3px' }}>
                    {href === '/warnings' && (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 2L13.5 12.5H2.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        <path d="M8 6.5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="8" cy="11" r="0.8" fill="currentColor"/>
                      </svg>
                    )}
                    {href === '/clients' && (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M2 14c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    )}
                    {href === '/portfolio' && (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="1.5" y="7.5" width="3" height="6.5" rx="1" fill="currentColor" opacity="0.65"/>
                        <rect x="6.5" y="4"   width="3" height="10"  rx="1" fill="currentColor"/>
                        <rect x="11.5" y="1.5" width="3" height="12.5" rx="1" fill="currentColor" opacity="0.65"/>
                      </svg>
                    )}
                    {href === '/analytics' && (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <polyline points="1.5,12 5,7.5 8.5,10 13,3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="13" cy="3.5" r="1.5" fill="currentColor"/>
                      </svg>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color }}>{label}</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', lineHeight: 1.4 }}>{desc}</div>
                </Link>
              ))}
            </div>
          </div>


        </div>
      </div>
    </>
  )
}
