export const revalidate = 300 // Portfolio data changes at most once per ML pipeline run

import { Suspense } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import { getPortfolioKPIs, getExposureByProduct, getExposureByRegion, getTopLoans } from '@/lib/queries'
import { getTotalECLProvisions } from '@/lib/eclProvisionService'
import type { ECLTotals } from '@/lib/eclProvisionService'
import { KPI } from '@/lib/config'
import { fmt } from '@/lib/formatters'
import SectionHeader from '@/components/SectionHeader'
import lazy from 'next/dynamic'
const _skel = () => <div style={{ height: 220, borderRadius: 8, background: '#F8FAFC', animation: 'pulse 1.5s ease-in-out infinite' }} />
const ProductExposureChart = lazy(() => import('./PortfolioCharts').then(m => ({ default: m.ProductExposureChart })), { loading:_skel })

/* ─── Geographic & loan data streams in after KPIs ───────────────────────── */
async function PortfolioDetail() {
  const [regions, loans] = await Promise.all([getExposureByRegion(), getTopLoans()])
  const PRODUCT_COLORS: Record<string, string> = {
    'Consumer': 'var(--navy)', 'Mortgage': '#378ADD',
    'Overdraft': 'var(--amber)', 'Card': 'var(--green)', 'Micro': 'var(--red)',
  }
  function dpdColor(days: number) {
    if (days >= KPI.DPD_RED) return 'var(--red)'
    if (days > 0)            return 'var(--amber)'
    return 'var(--green)'
  }
  return (
    <>
      <SectionHeader title="Geographic & Obligor Risk" sub="delinquency by region + top exposures" />
      <div className="row2">
        <div className="panel">
          <div className="ph">
            <span className="pt">Exposure by region</span>
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{regions.length} regions</span>
          </div>
          <div className="tbl-wrap"><table className="tbl tbl-alt">
            <thead><tr><th>Region</th><th>Clients</th><th>Exposure</th><th>Delinquency</th></tr></thead>
            <tbody>
              {regions.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{r.region}</td>
                  <td className="mono">{r.clients}</td>
                  <td className="mono">{fmt(r.exposure)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ flex: 1, height: '4px', background: '#EEF2F7', borderRadius: '2px', overflow: 'hidden', minWidth: '40px' }}>
                        <div style={{ height: '100%', width: `${Math.min(r.delinquency_pct * 5, 100)}%`, background: r.delinquency_pct > 20 ? 'var(--red)' : r.delinquency_pct > 10 ? 'var(--amber)' : 'var(--green)', borderRadius: '2px' }} />
                      </div>
                      <span className="mono" style={{ fontSize: '10px', color: r.delinquency_pct > 20 ? 'var(--red)' : r.delinquency_pct > 10 ? 'var(--amber)' : 'var(--green)', fontWeight: 600, minWidth: '28px' }}>{r.delinquency_pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="ph">
            <span className="pt">Top loans by exposure</span>
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{loans.length} accounts</span>
          </div>
          <div className="tbl-wrap"><table className="tbl tbl-alt">
            <thead><tr><th>#</th><th>Client</th><th>Product</th><th>Exposure</th><th>DPD</th></tr></thead>
            <tbody>
              {loans.map((l, i) => (
                <tr key={i}>
                  <td><span className="rank">{i + 1}</span></td>
                  <td><Link href={`/clients/${l.personal_id}`} className="mono" style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}>{l.personal_id} ↗</Link></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '2px', background: PRODUCT_COLORS[l.product_type] ?? 'var(--navy)', flexShrink: 0 }} />
                      <span style={{ color: 'var(--muted)', fontSize: '11px' }}>{l.product_type}</span>
                    </div>
                  </td>
                  <td className="mono" style={{ fontWeight: 600 }}>{fmt(l.exposure)}</td>
                  <td className="mono" style={{ color: dpdColor(l.due_days), fontWeight: l.due_days >= 30 ? 700 : 400 }}>{l.due_days > 0 ? `${l.due_days}d` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </>
  )
}

const PRODUCT_COLORS: Record<string, string> = {
  'Consumer': 'var(--navy)',
  'Mortgage': '#378ADD',
  'Overdraft': 'var(--amber)',
  'Card': 'var(--green)',
  'Micro': 'var(--red)',
}


function delinqColor(pct: number) {
  if (pct >= KPI.DELINQUENCY_SEGMENT_RED)   return 'var(--red)'
  if (pct >= KPI.DELINQUENCY_SEGMENT_AMBER) return 'var(--amber)'
  return 'var(--green)'
}

function dpdColor(days: number) {
  if (days >= KPI.DPD_RED) return 'var(--red)'
  if (days > 0)            return 'var(--amber)'
  return 'var(--green)'
}


export default async function Portfolio() {
  let kpis, products
  let eclTotals: ECLTotals | null = null
  try {
    ;[kpis, products, eclTotals] = await Promise.all([
      getPortfolioKPIs(),
      getExposureByProduct(),
      getTotalECLProvisions().catch((): ECLTotals | null => null),
    ])
  } catch {
    return (
      <>
        <Topbar title="Portfolio" sub="Exposure Overview" />
        <div className="content">
          <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
            Database not connected — fill in <code>.env</code> with SSMS credentials.
          </div>
        </div>
      </>
    )
  }

  // stage1_pct, health_score, health_label come pre-computed from SQL (getPortfolioKPIs CTE)
  const stageRows = [
    { label: 'Stage 1', desc: 'Performing — 12M ECL',   pct: kpis.stage1_pct,  color: 'var(--green)', lightBg: '#EAF9F2', border: '#A7F3D0' },
    { label: 'Stage 2', desc: 'SICR — Lifetime ECL',    pct: kpis.stage2_pct,  color: 'var(--amber)', lightBg: '#FFFBEB', border: '#FDE68A' },
    { label: 'Stage 3', desc: 'Credit Impaired — NPL',  pct: kpis.stage3_pct,  color: 'var(--red)',   lightBg: '#FEF2F2', border: '#FECACA' },
  ]

  // healthColor maps DB label to CSS variable (display-only, not a business value)
  const healthColor = kpis.health_label === 'Healthy' ? 'var(--green)'
    : kpis.health_label === 'Watch'    ? 'var(--amber)'
    : 'var(--red)'

  return (
    <>
      <Topbar title="Portfolio" sub="Exposure Overview" />
      <div className="content">

        <SectionHeader title="Stage Composition" sub="IFRS 9 classification" />
        <div style={{
          background: 'var(--navy)', borderRadius: '12px', padding: '20px 24px',
          color: 'white', display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap',
        }}>
          <div style={{ flex: '0 0 auto' }}>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Total Exposure</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'white', lineHeight: 1 }}>
              <span style={{ color: 'var(--gold)', fontSize: '18px' }}>€</span>
              {(kpis.total_exposure / 1_000_000).toFixed(1)}M
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', marginTop: '4px', fontFamily: 'var(--mono)' }}>
              Health: <span style={{ color: healthColor, fontWeight: 700 }}>{kpis.health_label}</span> ({kpis.health_score}/100)
            </div>
          </div>

          {/* Stacked proportion bar */}
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', marginBottom: '8px' }}>
              {stageRows.map(s => (
                <div key={s.label} style={{ flex: s.pct, textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.pct.toFixed(1)}%</div>
                  <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ height: '10px', borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
              {stageRows.map(s => (
                <div key={s.label} style={{ flex: s.pct, background: s.color, opacity: 0.85 }} />
              ))}
            </div>
          </div>

          {/* Stage pills */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {stageRows.map(s => (
              <div key={s.label} style={{
                background: 'rgba(255,255,255,0.07)', border: `1px solid ${s.color}40`,
                borderRadius: '8px', padding: '10px 14px', minWidth: '105px',
              }}>
                <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>{s.desc}</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: s.color }}>{s.pct.toFixed(1)}%</div>
                <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--mono)', marginTop: '2px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <SectionHeader title="Key Performance Indicators" sub="health & risk metrics" />
        <div className="row4">
          {[
            {
              label: 'NPL Ratio', sub: 'Stage 3 exposure / total (IFRS 9)',
              val: `${kpis.npl_ratio_pct ?? kpis.stage3_pct}%`,
              color: (kpis.npl_ratio_pct ?? kpis.stage3_pct) > KPI.NPL_RED ? 'var(--red)' : (kpis.npl_ratio_pct ?? kpis.stage3_pct) > KPI.NPL_AMBER ? 'var(--amber)' : 'var(--green)',
              badge: (kpis.npl_ratio_pct ?? kpis.stage3_pct) > KPI.NPL_RED ? 'br' : (kpis.npl_ratio_pct ?? kpis.stage3_pct) > KPI.NPL_AMBER ? 'ba' : 'bg',
              badgeLabel: (kpis.npl_ratio_pct ?? kpis.stage3_pct) > KPI.NPL_RED ? '▲ High' : (kpis.npl_ratio_pct ?? kpis.stage3_pct) > KPI.NPL_AMBER ? '~ Watch' : '✓ Low',
            },
            {
              label: 'SICR Rate', sub: 'Stage 2 migration',
              val: `${kpis.stage2_pct}%`,
              color: kpis.stage2_pct > KPI.STAGE2_RED ? 'var(--red)' : kpis.stage2_pct > KPI.STAGE2_AMBER ? 'var(--amber)' : 'var(--green)',
              badge: kpis.stage2_pct > KPI.STAGE2_RED ? 'br' : kpis.stage2_pct > KPI.STAGE2_AMBER ? 'ba' : 'bg',
              badgeLabel: kpis.stage2_pct > KPI.STAGE2_RED ? 'Elevated' : kpis.stage2_pct > KPI.STAGE2_AMBER ? 'Watch' : 'Normal',
            },
            {
              label: 'Products', sub: 'Active product portfolios',
              val: `${products.length}`,
              color: 'var(--navy)', badge: 'bb', badgeLabel: 'Live',
            },
            {
              label: 'Avg LTV', sub: 'Portfolio loan-to-value ratio',
              val: `${kpis.avg_ltv}%`,
              color: kpis.avg_ltv > 80 ? 'var(--red)' : kpis.avg_ltv > 60 ? 'var(--amber)' : 'var(--green)',
              badge: kpis.avg_ltv > 80 ? 'br' : kpis.avg_ltv > 60 ? 'ba' : 'bg',
              badgeLabel: kpis.avg_ltv > 80 ? '⚠ High' : kpis.avg_ltv > 60 ? 'Moderate' : '✓ Low',
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

        {/* ═══ IFRS 9 ECL PROVISIONS ═══ */}
        <SectionHeader title="IFRS 9 ECL Provisions" sub="SPECTRA-computed · updated on stage reclassification" />
        <div className="panel">
          <div className="ph">
            <span className="pt">Expected Credit Loss by stage</span>
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
              {eclTotals?.provision_count ?? 0} clients tracked
              {eclTotals?.last_calculated ? ` · last updated ${new Date(eclTotals.last_calculated).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : ''}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            {[
              {
                label: 'Total Provisions',
                sub: 'All stages combined',
                val: eclTotals ? (eclTotals.total_provision >= 1_000_000 ? '€' + (eclTotals.total_provision / 1_000_000).toFixed(2) + 'M' : eclTotals.total_provision >= 1_000 ? '€' + (eclTotals.total_provision / 1_000).toFixed(0) + 'K' : '€' + eclTotals.total_provision.toLocaleString()) : '—',
                color: 'var(--navy)',
                border: 'var(--navy)',
              },
              {
                label: 'Stage 1 — 12M ECL',
                sub: '1% of outstanding balance',
                val: eclTotals ? (eclTotals.stage1_provision >= 1_000_000 ? '€' + (eclTotals.stage1_provision / 1_000_000).toFixed(2) + 'M' : eclTotals.stage1_provision >= 1_000 ? '€' + (eclTotals.stage1_provision / 1_000).toFixed(0) + 'K' : '€' + eclTotals.stage1_provision.toLocaleString()) : '—',
                color: 'var(--green)',
                border: 'var(--green)',
              },
              {
                label: 'Stage 2 — Lifetime',
                sub: '5% of outstanding balance',
                val: eclTotals ? (eclTotals.stage2_provision >= 1_000_000 ? '€' + (eclTotals.stage2_provision / 1_000_000).toFixed(2) + 'M' : eclTotals.stage2_provision >= 1_000 ? '€' + (eclTotals.stage2_provision / 1_000).toFixed(0) + 'K' : '€' + eclTotals.stage2_provision.toLocaleString()) : '—',
                color: 'var(--amber)',
                border: 'var(--amber)',
              },
              {
                label: 'Stage 3 — Specific',
                sub: '20% of outstanding balance',
                val: eclTotals ? (eclTotals.stage3_provision >= 1_000_000 ? '€' + (eclTotals.stage3_provision / 1_000_000).toFixed(2) + 'M' : eclTotals.stage3_provision >= 1_000 ? '€' + (eclTotals.stage3_provision / 1_000).toFixed(0) + 'K' : '€' + eclTotals.stage3_provision.toLocaleString()) : '—',
                color: 'var(--red)',
                border: 'var(--red)',
              },
            ].map(c => (
              <div key={c.label} style={{
                padding: '12px 14px', borderRadius: '8px',
                background: `${c.color}08`,
                border: `1px solid ${c.border}30`,
                borderLeft: `3px solid ${c.border}`,
              }}>
                <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '4px' }}>{c.label}</div>
                <div className="mono" style={{ fontSize: '20px', fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.val}</div>
                <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '4px' }}>{c.sub}</div>
              </div>
            ))}
          </div>
          {(!eclTotals || eclTotals.provision_count === 0) && (
            <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '6px', background: '#F8FAFC', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--muted)' }}>
              No ECL provisions recorded yet. Provisions are auto-calculated when clients are reclassified between IFRS 9 stages by the Early Warning system.
            </div>
          )}
        </div>

        <SectionHeader title="Exposure Breakdown" sub="product distribution & IFRS stage split" />
        <div className="row2">
          <div className="panel">
            <div className="ph">
              <span className="pt">Exposure by product</span>
              <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{products.length} types</span>
            </div>
            <ProductExposureChart data={products} />
          </div>

          <div className="panel">
            <div className="ph"><span className="pt">IFRS 9 stage breakdown</span></div>
            {stageRows.map(s => (
              <div key={s.label} style={{
                padding: '12px 14px', borderRadius: '8px', marginBottom: '8px',
                background: s.lightBg, border: `1px solid ${s.border}`,
                display: 'flex', alignItems: 'center', gap: '14px',
              }}>
                <div style={{ flex: '0 0 60px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.pct.toFixed(1)}%</div>
                  <div style={{ fontSize: '8px', color: s.color, fontWeight: 700, marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '5px' }}>{s.desc}</div>
                  <div style={{ height: '7px', background: `${s.color}20`, borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, borderRadius: '4px' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Regions + loans stream in after KPIs and product chart */}
        <Suspense fallback={
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[0, 1].map(i => <div key={i} style={{ height: 260, borderRadius: 10, background: '#F8FAFC', animation: 'pulse 1.5s ease-in-out infinite', border: '1px solid var(--border)' }} />)}
          </div>
        }>
          <PortfolioDetail />
        </Suspense>

      </div>
    </>
  )
}
