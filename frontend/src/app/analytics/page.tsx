export const revalidate = 300 // re-compute at most every 5 minutes

import { Suspense } from 'react'
import Topbar from '@/components/Topbar'
import { KPI } from '@/lib/config'
import { fmt } from '@/lib/formatters'
import { stageBadge } from '@/lib/colors'
import SectionHeader from '@/components/SectionHeader'
import {
  getAnalyticsKPIs, getDelinquencyBySegment, getStageMigration, getProvisionByProduct,
  getNPLRatioTrend, getRollrateMatrix, getVintageAnalysis, getECLProvisionGap,
  getECLByStage, getRepaymentSummary, getInterestAtRisk, getPDByRating, getCoverageByStage,
} from '@/lib/queries'
import { getTotalECLProvisions } from '@/lib/eclProvisionService'
import type { ECLTotals } from '@/lib/eclProvisionService'
import lazy from 'next/dynamic'

const _skel = () => <div style={{ height: 220, borderRadius: 8, background: '#F8FAFC', animation: 'pulse 1.5s ease-in-out infinite' }} />
const NPLAreaChart    = lazy(() => import('./NPLAreaChart'),    { loading: _skel })
const SegmentBarChart = lazy(() => import('./SegmentBarChart'), { loading: _skel })
const VintagePanel    = lazy(() => import('./VintagePanel'),    { loading: _skel })
const RepaymentDonut  = lazy(() => import('./RepaymentDonut'),  { loading: _skel })
const ECLGroupedChart = lazy(() => import('./ECLGroupedChart'), { loading: _skel })
const PDRatingChart   = lazy(() => import('./PDRatingChart'),   { loading: _skel })

const SEGMENT_COLORS: Record<string, string> = {
  'Consumer': 'var(--navy)', 'Mortgage': '#378ADD',
  'Overdraft': 'var(--amber)', 'Card': 'var(--green)', 'Micro': 'var(--red)',
}

// ─── Skeleton fallback ─────────────────────────────────────────────────────

function SectionSkeleton({ panels = 2 }: { panels?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${panels}, 1fr)`, gap: '12px', marginBottom: '12px' }}>
      {Array.from({ length: panels }).map((_, i) => (
        <div key={i} style={{
          height: 240, borderRadius: 10, border: '1px solid var(--border)',
          background: 'linear-gradient(90deg, #F8FAFC 25%, #F1F5F9 50%, #F8FAFC 75%)',
          backgroundSize: '200% 100%',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}

// ─── Section 1: Portfolio Overview (KPIs + Delinquency + Migration) ────────

async function PortfolioOverview() {
  const [kpis, segments, migrations] = await Promise.all([
    getAnalyticsKPIs(),
    getDelinquencyBySegment(),
    getStageMigration(),
  ])

  return (
    <>
      <SectionHeader title="Portfolio Overview" sub="Key performance indicators" />
      <div className="row3">
        <div className="kcard">
          <div className="kl">Stage Migration Rate</div>
          <div className="kv">{kpis.stage_migration_rate}%</div>
          <span className="badge br">▲ MoM</span>
        </div>
        <div className="kcard">
          <div className="kl">Provision Coverage</div>
          <div className="kv">{kpis.provision_coverage}%</div>
          <span className={`badge ${kpis.provision_coverage < KPI.PROVISION_WARN ? 'br' : kpis.provision_coverage < KPI.PROVISION_ADEQUATE ? 'ba' : 'bg'}`}>
            {kpis.provision_coverage < KPI.PROVISION_WARN ? '▼ Under' : kpis.provision_coverage < KPI.PROVISION_ADEQUATE ? '~ Watch' : '✓ Adequate'}
          </span>
        </div>
        <div className="kcard">
          <div className="kl">Cure Rate (90d)</div>
          <div className="kv">{kpis.cure_rate_90d}%</div>
          <span className={`badge ${kpis.cure_rate_90d < KPI.CURE_RATE_WARN ? 'ba' : 'bg'}`}>
            {kpis.cure_rate_90d < KPI.CURE_RATE_WARN ? '↓ Low' : '↑ Good'}
          </span>
        </div>
      </div>
      <div className="row2">
        <div className="panel">
          <div className="ph">
            <span className="pt">Delinquency by segment</span>
            <span className="pa">% clients ≥ 30 DPD</span>
          </div>
          <SegmentBarChart data={segments} />
        </div>
        <div className="panel">
          <div className="ph"><span className="pt">Stage migration (MoM)</span><span className="pa">Current period</span></div>
          <div className="tbl-wrap"><table className="tbl tbl-alt">
            <thead><tr><th>From</th><th>To</th><th>Count</th><th>Exposure</th></tr></thead>
            <tbody>
              {migrations.map((m, i) => (
                <tr key={i}>
                  <td><span className={`badge ${stageBadge(m.from_stage)}`}>{m.from_stage}</span></td>
                  <td><span className={`badge ${stageBadge(m.to_stage)}`}>{m.to_stage}</span></td>
                  <td className="mono">{m.count}</td>
                  <td className="mono">{fmt(m.exposure)}</td>
                </tr>
              ))}
              {migrations.length === 0 && (
                <tr><td colSpan={4} style={{ color: 'var(--muted)', textAlign: 'center' }}>No migrations this period</td></tr>
              )}
            </tbody>
          </table></div>
        </div>
      </div>
    </>
  )
}

// ─── Section 2: IFRS 9 Compliance (ECL provisions + coverage) ──────────────

async function IFRS9Compliance() {
  const [provisions, ecl, eclGap, coverage, eclTotals] = await Promise.all([
    getProvisionByProduct(),
    getECLByStage(),
    getECLProvisionGap(),
    getCoverageByStage(),
    getTotalECLProvisions().catch((): ECLTotals | null => null),
  ])

  return (
    <>
      <SectionHeader title="IFRS 9 Compliance" sub="ECL provisioning & coverage" />
      <div className="row4" style={{ marginBottom: '10px' }}>
        {(
          [
            { label: 'Total ECL Provisions', sub: 'SPECTRA-computed · all stages', val: eclTotals?.total_provision ?? null, color: 'var(--navy)' },
            { label: 'Stage 1 — 12M ECL',   sub: '1% rate · performing',          val: eclTotals?.stage1_provision ?? null, color: 'var(--green)' },
            { label: 'Stage 2 — Lifetime',  sub: '5% rate · SICR',                val: eclTotals?.stage2_provision ?? null, color: 'var(--amber)' },
            { label: 'Stage 3 — Specific',  sub: '20% rate · NPL',                val: eclTotals?.stage3_provision ?? null, color: 'var(--red)' },
          ] as { label: string; sub: string; val: number | null; color: string }[]
        ).map(c => {
          const display = c.val == null ? '—'
            : c.val >= 1_000_000 ? '€' + (c.val / 1_000_000).toFixed(2) + 'M'
            : c.val >= 1_000     ? '€' + (c.val / 1_000).toFixed(0) + 'K'
            : '€' + c.val.toLocaleString()
          return (
            <div key={c.label} className="kcard" style={{ borderLeft: `3px solid ${c.color}` }}>
              <div className="kl">{c.label}</div>
              <div className="kv" style={{ color: c.color, fontSize: c.val != null && c.val >= 1_000_000 ? '20px' : undefined }}>{display}</div>
              <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '2px' }}>{c.sub}</div>
            </div>
          )
        })}
      </div>
      <div className="row2">
        <div className="panel">
          <div className="ph"><span className="pt">ECL provision gap</span><span className="pa">PD × LGD method</span></div>
          <ECLGroupedChart data={ecl} />
          <div style={{ display: 'flex', gap: 16, margin: '6px 0 10px', fontSize: 10, color: 'var(--muted)' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#1D2B4E30', border: '1px solid #1D2B4E', borderRadius: 2, marginRight: 4 }} />Exposure</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#378ADD', borderRadius: 2, marginRight: 4 }} />Bank Prov.</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#F59E0B', borderRadius: 2, marginRight: 4 }} />Calc. ECL</span>
          </div>
          <div className="tbl-wrap"><table className="tbl tbl-alt">
            <thead><tr><th>Stage</th><th>Exposure</th><th>Bank Prov.</th><th>Calc. ECL</th><th>Gap</th></tr></thead>
            <tbody>
              {ecl.map((r, i) => (
                <tr key={i}>
                  <td><span className={`badge ${r.stage === 1 ? 'bg' : r.stage === 2 ? 'ba' : 'br'}`}>{r.stage_descr}</span></td>
                  <td className="mono">{fmt(r.total_exposure)}</td>
                  <td className="mono">{fmt(r.bank_provision)}</td>
                  <td className="mono">{fmt(r.calculated_ecl)}</td>
                  <td className="mono" style={{ color: r.provision_gap >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                    {r.provision_gap >= 0 ? '▲ +' : '▼ '}{fmt(Math.abs(r.provision_gap))}
                  </td>
                </tr>
              ))}
              {ecl.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center' }}>No data</td></tr>}
            </tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="ph"><span className="pt">Coverage ratio MoM</span><span className="pa">IFRS 9 stage coverage change</span></div>
          <div className="tbl-wrap"><table className="tbl tbl-alt">
            <thead><tr><th>Stage</th><th>Prior</th><th>Current</th><th>Change</th></tr></thead>
            <tbody>
              {coverage.map(r => {
                const mom = r.mom_change_pct
                const declined = mom != null && mom < -2
                return (
                  <tr key={r.stage}>
                    <td><span className={`badge ${r.stage === 1 ? 'bg' : r.stage === 2 ? 'ba' : 'br'}`}>Stage {r.stage}</span></td>
                    <td className="mono">{r.prev_coverage_pct}%</td>
                    <td className="mono" style={{ fontWeight: 600 }}>{r.curr_coverage_pct}%</td>
                    <td className="mono" style={{ color: declined ? 'var(--red)' : mom != null && mom > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: 600 }}>
                      {mom == null ? 'N/A' : <>{mom > 0 ? '▲ ' : mom < 0 ? '▼ ' : ''}{Math.abs(mom)}pp</>}
                      {declined && <span style={{ marginLeft: 4, fontSize: 9, background: 'var(--red)', color: '#fff', borderRadius: 3, padding: '1px 4px' }}>FLAG</span>}
                    </td>
                  </tr>
                )
              })}
              {coverage.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--muted)', textAlign: 'center' }}>No coverage data</td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>
      <div className="row2">
        <div className="panel">
          <div className="ph"><span className="pt">Provision adequacy by product</span><span className="pa">Bank provision %</span></div>
          {provisions.map(r => (
            <div key={r.product_type} className="prog-row">
              <div className="prog-label" style={{ width: '70px' }}>{r.product_type}</div>
              <div className="prog-bar">
                <div className="prog-fill" style={{
                  width: `${Math.min(r.provision_pct, 100)}%`,
                  background: r.provision_pct < 60 ? 'var(--red)' : r.provision_pct < 80 ? 'var(--amber)' : SEGMENT_COLORS[r.product_type] ?? 'var(--navy)',
                }} />
              </div>
              <div className="prog-val">{r.provision_pct}%</div>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="ph"><span className="pt">ECL by IFRS 9 stage</span><span className="pa">Per-stage gap</span></div>
          <div className="tbl-wrap"><table className="tbl tbl-alt">
            <thead><tr><th>Stage</th><th>Exposure</th><th>ECL</th><th>Coverage</th><th>Gap</th></tr></thead>
            <tbody>
              {eclGap.map(r => {
                const under = r.provision_gap < 0
                return (
                  <tr key={r.stage}>
                    <td><span className={`badge ${r.stage === 1 ? 'bg' : r.stage === 2 ? 'ba' : 'br'}`}>Stage {r.stage}</span></td>
                    <td className="mono">€{(r.total_exposure / 1_000_000).toFixed(1)}M</td>
                    <td className="mono">€{(r.calculated_ecl / 1_000_000).toFixed(1)}M</td>
                    <td className="mono">{r.coverage_ratio_pct}%</td>
                    <td className="mono" style={{ color: under ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                      {under ? '▼ ' : '▲ '}€{(Math.abs(r.provision_gap) / 1_000_000).toFixed(1)}M
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </div>
      </div>
    </>
  )
}

// ─── Section 3: Behavioral Risk (rollrate + repayment + interest) ───────────

async function BehavioralRisk() {
  const BUCKETS = ['0 - Current', '1-29 DPD', '30-59 DPD', '60-89 DPD', '90+ DPD']

  const [rollrate, repayment, interest] = await Promise.all([
    getRollrateMatrix(),
    getRepaymentSummary(),
    getInterestAtRisk(),
  ])

  const rollrateMap: Record<string, Record<string, number>> = {}
  for (const cell of rollrate) {
    if (!rollrateMap[cell.from_bucket]) rollrateMap[cell.from_bucket] = {}
    rollrateMap[cell.from_bucket][cell.to_bucket] = cell.rate_pct
  }

  return (
    <>
      <SectionHeader title="Behavioral Risk" sub="Payment patterns & rollrate" />
      <div className="panel">
        <div className="ph"><span className="pt">Rollrate matrix</span><span className="pa">DPD bucket transitions — diagonal = stayed, right = deteriorated</span></div>
        <div className="tbl-wrap" style={{ overflowX: 'auto' }}>
          <table className="tbl tbl-alt" style={{ fontSize: 11, minWidth: '480px' }}>
            <thead>
              <tr>
                <th style={{ minWidth: '90px' }}>From ↓ / To →</th>
                {BUCKETS.map(b => <th key={b} style={{ textAlign: 'center', minWidth: '80px' }}>{b}</th>)}
              </tr>
            </thead>
            <tbody>
              {BUCKETS.map(from => (
                <tr key={from}>
                  <td style={{ color: 'var(--navy)', fontWeight: 600, fontSize: 10 }}>{from}</td>
                  {BUCKETS.map(to => {
                    const pct = rollrateMap[from]?.[to] ?? null
                    const isDiag  = from === to
                    const isWorse = BUCKETS.indexOf(to) > BUCKETS.indexOf(from)
                    const intensity = pct !== null ? Math.min(pct / 30, 1) : 0
                    const bg = pct === null ? 'transparent'
                      : isDiag  ? `rgba(46,204,138,${0.08 + intensity * 0.15})`
                      : isWorse && pct > 10 ? `rgba(232,87,87,${0.1 + intensity * 0.25})`
                      : isWorse ? `rgba(240,160,75,${0.08 + intensity * 0.15})`
                      : 'transparent'
                    return (
                      <td key={to} className="mono" style={{ background: bg, textAlign: 'center', fontWeight: isWorse && pct !== null && pct > 10 ? 600 : 400 }}>
                        {pct !== null ? `${pct}%` : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: 'var(--muted)' }}>
          <span style={{ color: 'var(--green)' }}>■</span> Staying (diagonal)
          <span style={{ color: 'var(--amber)' }}>■</span> Moderate roll
          <span style={{ color: 'var(--red)' }}>■</span> &gt;10% rollrate — elevated risk
        </div>
      </div>
      <div className="row2">
        <div className="panel">
          <div className="ph"><span className="pt">Repayment rate breakdown</span><span className="pa">AmortizationPlan</span></div>
          <RepaymentDonut data={repayment} />
          {repayment.critical_pct > 20 && (
            <div style={{ fontSize: 10, color: 'var(--red)', background: '#FEF0F0', borderRadius: 6, padding: '6px 10px', marginTop: 12 }}>
              ▲ {repayment.critical_pct}% of accounts are repaying at critical (&lt;50%) levels
            </div>
          )}
        </div>
        <div className="panel">
          <div className="ph"><span className="pt">Interest income at risk</span><span className="pa">Stage 2 &amp; 3</span></div>
          <div className="tbl-wrap"><table className="tbl tbl-alt">
            <thead><tr><th>Stage</th><th>Clients</th><th>At-Risk Exp.</th><th>Avg Rate</th><th>Income at Risk</th></tr></thead>
            <tbody>
              {interest.map((r, i) => (
                <tr key={i}>
                  <td><span className={`badge ${r.stage === 2 ? 'ba' : 'br'}`}>Stage {r.stage}</span></td>
                  <td className="mono">{r.client_count}</td>
                  <td className="mono">{fmt(r.at_risk_exposure)}</td>
                  <td className="mono">{r.avg_interest_rate}%</td>
                  <td className="mono" style={{ color: 'var(--red)', fontWeight: 600 }}>{fmt(r.interest_income_at_risk)}</td>
                </tr>
              ))}
              {interest.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center' }}>No at-risk exposure</td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>
    </>
  )
}

// ─── Section 4: Risk Signals (NPL trend + vintage + PD by rating) ───────────

async function RiskSignals() {
  const [nplTrend, vintage, pdRating] = await Promise.all([
    getNPLRatioTrend(),
    getVintageAnalysis(),
    getPDByRating(),
  ])

  return (
    <>
      <SectionHeader title="Risk Signals" sub="NPL, vintage & probability of default" />
      <div className="row2">
        <div className="panel">
          <div className="ph">
            <span className="pt">NPL ratio trend</span>
            <span className="pa">6M — Stage 3 / Total</span>
          </div>
          <NPLAreaChart data={nplTrend} />
          <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 10, color: 'var(--muted)' }}>
            <span style={{ color: 'var(--green)' }}>■</span> &lt;3%
            <span style={{ color: 'var(--amber)' }}>■</span> 3–5% watch
            <span style={{ color: 'var(--red)' }}>■</span> &gt;5% critical
          </div>
        </div>
        <VintagePanel data={vintage} warnThreshold={KPI.VINTAGE_DELINQUENCY_WARN} />
      </div>
      <div className="panel">
        <div className="ph"><span className="pt">PD by client rating</span><span className="pa">Stage 3 migration rate — higher PD % = elevated risk tier</span></div>
        <PDRatingChart data={pdRating} />
        {pdRating.length === 0 && <div style={{ color: 'var(--muted)', textAlign: 'center', fontSize: 12, padding: '12px 0' }}>No rating data</div>}
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: 'var(--muted)' }}>
          <span style={{ color: 'var(--green)' }}>■</span> Normal (&lt;5%)
          <span style={{ color: 'var(--amber)' }}>■</span> Watch (5–10%)
          <span style={{ color: 'var(--red)' }}>■</span> High (&gt;10%)
        </div>
      </div>
    </>
  )
}

// ─── Page shell — renders instantly, sections stream in ───────────────────

export default function Analytics() {
  return (
    <>
      <Topbar title="Analytics" sub="Risk Intelligence — streaming live data" />
      <div className="content">

        {/* Section 1 — loads first (fastest queries) */}
        <Suspense fallback={
          <><SectionSkeleton panels={3} /><SectionSkeleton panels={2} /></>
        }>
          <PortfolioOverview />
        </Suspense>

        {/* Section 2 — IFRS 9 compliance */}
        <Suspense fallback={
          <><SectionSkeleton panels={4} /><SectionSkeleton panels={2} /><SectionSkeleton panels={2} /></>
        }>
          <IFRS9Compliance />
        </Suspense>

        {/* Section 3 — Behavioral risk (rollrate can be slow) */}
        <Suspense fallback={
          <><SectionSkeleton panels={1} /><SectionSkeleton panels={2} /></>
        }>
          <BehavioralRisk />
        </Suspense>

        {/* Section 4 — Risk signals */}
        <Suspense fallback={
          <><SectionSkeleton panels={2} /><SectionSkeleton panels={1} /></>
        }>
          <RiskSignals />
        </Suspense>

      </div>
    </>
  )
}
