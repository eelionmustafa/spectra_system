export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import Topbar from '@/components/Topbar'
import { getTopObligors, getConcentrationByProduct, getConcentrationByRegion, getProductHHI, getRegionHHI } from '@/lib/queries'
import { CONCENTRATION } from '@/lib/config'
import { fmt } from '@/lib/formatters'
import SectionHeader from '@/components/SectionHeader'
import lazy from 'next/dynamic'

const ExposureHBarChart = lazy(
  () => import('./ConcentrationCharts').then(m => ({ default: m.ExposureHBarChart })),
  { loading: () => <div style={{ height: 220, borderRadius: 8, background: '#F8FAFC', animation: 'pulse 1.5s ease-in-out infinite' }} /> }
)

const { TOP1_OBLIGOR_WARN, LARGE_EXPOSURE_MIN_PCT, LARGE_EXPOSURE_COUNT_WARN, TOP10_TOTAL_WARN, HHI_CONCENTRATED, HHI_HIGHLY_CONCENTRATED } = CONCENTRATION

function hhiColors(label: string): { color: string; bg: string } {
  if (label === 'Highly Concentrated')     return { color: '#C43A3A', bg: '#FEF2F2' }
  if (label === 'Moderately Concentrated') return { color: '#92400E', bg: '#FFFBEB' }
  return                                          { color: '#065F46', bg: '#ECFDF5' }
}

function PageSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[120, 180, 260, 300].map((h, i) => (
        <div key={i} style={{
          height: h, borderRadius: 10, border: '1px solid var(--border)',
          background: 'linear-gradient(90deg,#F8FAFC 25%,#F1F5F9 50%,#F8FAFC 75%)',
          backgroundSize: '200% 100%', animation: `pulse 1.4s ease-in-out ${i * 0.1}s infinite`,
        }} />
      ))}
    </div>
  )
}

// ─── All 5 queries in one Promise.all, one Suspense boundary ──────────────────

async function ConcentrationContent() {
  let obligors:  Awaited<ReturnType<typeof getTopObligors>>,
      products:  Awaited<ReturnType<typeof getConcentrationByProduct>>,
      regions:   Awaited<ReturnType<typeof getConcentrationByRegion>>,
      hhiProd:   Awaited<ReturnType<typeof getProductHHI>>,
      hhiReg:    Awaited<ReturnType<typeof getRegionHHI>>

  try {
    ;[obligors, products, regions, hhiProd, hhiReg] = await Promise.all([
      getTopObligors(),
      getConcentrationByProduct(),
      getConcentrationByRegion(),
      getProductHHI(),
      getRegionHHI(),
    ])
  } catch {
    return (
      <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
        Database not connected — fill in <code>.env</code> with SSMS credentials.
      </div>
    )
  }

  const top1Pct            = obligors[0]?.pct_of_portfolio ?? 0
  const top10Pct           = Math.min(100, Math.round(obligors.slice(0, 10).reduce((s, o) => s + o.pct_of_portfolio, 0) * 10) / 10)
  const largeExposureCount = obligors.filter(o => o.pct_of_portfolio >= CONCENTRATION.LARGE_EXPOSURE_MIN_PCT).length
  const hhiProduct         = hhiProd.hhi
  const hhiRegion          = hhiReg.hhi
  const hhiP               = { label: hhiProd.hhi_label, ...hhiColors(hhiProd.hhi_label) }
  const hhiR               = { label: hhiReg.hhi_label,  ...hhiColors(hhiReg.hhi_label)  }

  const sortedObl   = [...obligors].sort((a, b) => b.exposure - a.exposure)
  const totalOblExp = sortedObl.reduce((s, o) => s + o.exposure, 0)
  const lorenz = sortedObl.reduce<{ x: number; y: number }[]>((acc, o, i) => {
    const cumExp = (acc.length > 0 ? acc[acc.length - 1].y : 0) + (o.exposure / totalOblExp) * 100
    acc.push({ x: Math.round(((i + 1) / sortedObl.length) * 100), y: Math.round(cumExp) })
    return acc
  }, [])

  const breaches: { label: string; why: string; href: string; btnLabel: string }[] = []
  if (top1Pct >= TOP1_OBLIGOR_WARN)
    breaches.push({ label: `Single obligor at ${top1Pct}% — exceeds EBA large exposure threshold (${TOP1_OBLIGOR_WARN}%)`, why: `Basel III Art. 395: maximum 25% of Tier 1 capital. Exposure reduction or additional collateral required.`, href: `/clients/${obligors[0]?.clientID ?? ''}`, btnLabel: 'Open Obligor Profile' })
  if (largeExposureCount > LARGE_EXPOSURE_COUNT_WARN)
    breaches.push({ label: `${largeExposureCount} obligors exceed ${LARGE_EXPOSURE_MIN_PCT}% portfolio threshold`, why: `EBA recommends internal limit of ${LARGE_EXPOSURE_MIN_PCT}%. Each flagged obligor is highlighted in the table below.`, href: '/stress', btnLabel: 'Run Stress Test' })
  if (hhiProduct >= HHI_HIGHLY_CONCENTRATED || hhiRegion >= HHI_HIGHLY_CONCENTRATED)
    breaches.push({ label: `HHI ${Math.max(hhiProduct, hhiRegion).toLocaleString()} — high concentration (threshold: ${HHI_HIGHLY_CONCENTRATED})`, why: `EBA/GL/2018/06 mandates stress testing when HHI exceeds ${HHI_HIGHLY_CONCENTRATED}. Capital impact must be quantified.`, href: '/stress', btnLabel: 'Run Stress Test' })

  return (
    <>
      {/* Summary */}
      <SectionHeader title="Concentration Summary" sub="Basel III / EBA regulatory metrics" />
      <div style={{ background: 'var(--navy)', borderRadius: '12px', padding: '20px 24px', color: 'white', display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 auto' }}>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Concentration Summary</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '6px', lineHeight: 1.6 }}>
            Basel III large exposure limit: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>25% of Tier 1 capital</span><br />
            EBA watchlist threshold: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>10% of portfolio</span>
          </div>
        </div>
        {[
          { label: 'Largest obligor',                           value: top1Pct + '%',           flag: top1Pct >= TOP1_OBLIGOR_WARN },
          { label: 'Top 10 concentration',                      value: top10Pct + '%',           flag: top10Pct >= TOP10_TOTAL_WARN },
          { label: `Large exposures (≥${LARGE_EXPOSURE_MIN_PCT}%)`, value: String(largeExposureCount), flag: largeExposureCount > LARGE_EXPOSURE_COUNT_WARN },
          { label: 'HHI Product',                               value: String(hhiProduct),       flag: hhiProduct >= HHI_CONCENTRATED },
          { label: 'HHI Region',                                value: String(hhiRegion),        flag: hhiRegion  >= HHI_CONCENTRATED },
        ].map(({ label, value, flag }) => (
          <div key={label} style={{ background: flag ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.07)', border: '1px solid ' + (flag ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.12)'), borderRadius: '10px', padding: '12px 18px', minWidth: '110px', textAlign: 'center' }}>
            <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: flag ? '#FCA5A5' : 'white', fontFamily: 'var(--mono)' }}>{value}</div>
            {flag && <div style={{ fontSize: '8px', color: '#FCA5A5', marginTop: '2px' }}>Watch</div>}
          </div>
        ))}
      </div>

      {/* Breach actions */}
      {breaches.length > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '4px solid #C43A3A', borderRadius: '8px', padding: '14px 18px', marginBottom: '4px' }}>
          <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#C43A3A', fontWeight: 700, marginBottom: '10px' }}>
            Regulatory Action Required — {breaches.length} breach{breaches.length > 1 ? 'es' : ''} detected
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {breaches.map((b, i) => (
              <div key={i} style={{ background: 'white', borderRadius: '6px', padding: '10px 14px', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#C43A3A', marginBottom: '2px' }}>{b.label}</div>
                  <div style={{ fontSize: '10px', color: '#92140C', lineHeight: 1.5 }}>{b.why}</div>
                </div>
                <Link href={b.href} style={{ fontSize: '10px', fontWeight: 600, color: '#C43A3A', textDecoration: 'none', padding: '6px 12px', borderRadius: '5px', background: '#FEF2F2', border: '1px solid #FECACA', whiteSpace: 'nowrap', flexShrink: 0 }}>{b.btnLabel} →</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HHI */}
      <SectionHeader title="HHI Index" sub="Herfindahl-Hirschman — 0 = dispersed · 10000 = monopoly" />
      <div className="row2">
        {[
          { label: 'HHI — Product Type',      hhi: hhiProduct, info: hhiP },
          { label: 'HHI — Geographic Region', hhi: hhiRegion,  info: hhiR },
        ].map(({ label, hhi, info }) => {
          const pct = Math.min(100, (hhi / 10000) * 100)
          return (
            <div key={label} className="panel" style={{ background: info.bg, border: '1px solid ' + info.color + '30' }}>
              <div className="ph" style={{ marginBottom: '12px' }}>
                <span className="pt" style={{ color: info.color }}>{label}</span>
                <span style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '10px', background: info.color + '20', color: info.color, fontWeight: 600 }}>{info.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div className="mono" style={{ fontSize: '40px', fontWeight: 800, color: info.color, lineHeight: 1 }}>{hhi.toLocaleString()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ height: '12px', background: '#E8EDF2', borderRadius: '6px', overflow: 'hidden', marginBottom: '6px' }}>
                    <div style={{ height: '100%', borderRadius: '6px', width: pct + '%', background: hhi >= HHI_HIGHLY_CONCENTRATED ? '#C43A3A' : hhi >= HHI_CONCENTRATED ? '#D97706' : '#065F46', transition: 'width 0.5s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    <span>0</span><span style={{ color: '#065F46' }}>{HHI_CONCENTRATED} Unconcentrated</span><span style={{ color: '#D97706' }}>{HHI_HIGHLY_CONCENTRATED} High</span><span>10000</span>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '8px' }}>
                HHI = Σ(share²) · Threshold: &lt;{HHI_CONCENTRATED} = OK · {HHI_CONCENTRATED}–{HHI_HIGHLY_CONCENTRATED} = Monitor · &gt;{HHI_HIGHLY_CONCENTRATED} = Regulatory concern
              </div>
            </div>
          )
        })}
      </div>

      {/* Obligors table */}
      <SectionHeader title="Single-Name Concentration" sub="top obligors — EBA large exposure threshold" />
      <div className="panel">
        <div className="ph" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="pt">Top {Math.min(obligors.length, 25)} obligors by portfolio share</span>
            {top1Pct >= TOP1_OBLIGOR_WARN && (
              <span style={{ fontSize: '9px', background: '#FEF2F2', color: '#C43A3A', padding: '2px 8px', borderRadius: '10px', border: '1px solid #FECACA', fontWeight: 600 }}>Large exposure detected</span>
            )}
          </div>
          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>EBA: single obligor &gt;{TOP1_OBLIGOR_WARN}% = large exposure</span>
        </div>

        {lorenz.length >= 2 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '9px', color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Concentration curve — % clients vs % exposure (perfect equality = diagonal)</div>
            <svg width="100%" viewBox="0 0 300 120" style={{ maxHeight: '120px', display: 'block' }}>
              <line x1="20" y1="100" x2="290" y2="10" stroke="#E8EDF2" strokeWidth="1" strokeDasharray="3,3" />
              <polyline points={['20,100', ...lorenz.map(p => (20 + (p.x / 100) * 270).toFixed(1) + ',' + (100 - (p.y / 100) * 90).toFixed(1))].join(' ')} fill="none" stroke="var(--navy)" strokeWidth="2" />
              <polygon points={['20,100', ...lorenz.map(p => (20 + (p.x / 100) * 270).toFixed(1) + ',' + (100 - (p.y / 100) * 90).toFixed(1)), '290,10', '20,100'].join(' ')} fill="rgba(13,27,42,0.06)" />
              <text x="20" y="112" fontSize="7" fill="#8FA3B8">0%</text>
              <text x="280" y="112" fontSize="7" fill="#8FA3B8">100%</text>
              <text x="2" y="104" fontSize="7" fill="#8FA3B8">0</text>
              <text x="2" y="15" fontSize="7" fill="#8FA3B8">100%</text>
            </svg>
          </div>
        )}

        <div className="tbl-wrap"><table className="tbl tbl-alt">
          <thead><tr><th>#</th><th>Client ID</th><th>Exposure</th><th>% Portfolio</th><th>Stage</th><th>Status</th></tr></thead>
          <tbody>
            {obligors.slice(0, 25).map((o, i) => {
              const isLarge = o.pct_of_portfolio >= TOP1_OBLIGOR_WARN
              const isWatch = o.pct_of_portfolio >= LARGE_EXPOSURE_MIN_PCT
              return (
                <tr key={o.clientID} style={{ background: isLarge ? '#FEF2F2' : isWatch ? '#FFFBEB' : 'white' }}>
                  <td className="mono" style={{ color: 'var(--muted)' }}>{i + 1}</td>
                  <td><Link href={'/clients/' + o.clientID} className="mono" style={{ textDecoration: 'none', color: 'var(--blue)', fontWeight: 600 }}>{o.clientID} →</Link></td>
                  <td className="mono" style={{ fontWeight: 600 }}>{fmt(o.exposure)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ height: '6px', background: '#E8EDF2', borderRadius: '3px', width: '80px' }}>
                        <div style={{ height: '100%', borderRadius: '3px', width: Math.min(o.pct_of_portfolio / (TOP1_OBLIGOR_WARN * 1.5) * 100, 100) + '%', background: isLarge ? '#C43A3A' : isWatch ? '#D97706' : 'var(--navy)' }} />
                      </div>
                      <span className="mono" style={{ fontWeight: isLarge ? 700 : 400, color: isLarge ? '#C43A3A' : isWatch ? '#D97706' : 'var(--text)' }}>{o.pct_of_portfolio}%</span>
                    </div>
                  </td>
                  <td><span className={'badge ' + (o.stage === 1 ? 'bg' : o.stage === 2 ? 'ba' : 'br')}>Stage {o.stage}</span></td>
                  <td>
                    {isLarge ? <span style={{ fontSize: '9px', background: '#FEF2F2', color: '#C43A3A', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, border: '1px solid #FECACA' }}>Large Exposure</span>
                    : isWatch ? <span style={{ fontSize: '9px', background: '#FFFBEB', color: '#92400E', padding: '2px 6px', borderRadius: '4px', border: '1px solid #FDE68A' }}>Monitor</span>
                    : <span style={{ fontSize: '9px', color: 'var(--muted)' }}>Normal</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
        {obligors.length > 25 && (
          <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--muted)', textAlign: 'right' }}>Showing top 25 of {obligors.length} obligors</div>
        )}
      </div>

      {/* Segment breakdown */}
      <SectionHeader title="Segment Breakdown" sub="exposure by product type & geographic region" />
      <div className="row2">
        <div className="panel">
          <div className="ph" style={{ marginBottom: '14px' }}>
            <span className="pt">Exposure by product type</span>
            <span style={{ fontSize: '9px', background: hhiProduct >= HHI_CONCENTRATED ? '#FFFBEB' : '#EAF9F2', color: hhiProduct >= HHI_CONCENTRATED ? '#92400E' : '#065F46', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>HHI {hhiProduct.toLocaleString()}</span>
          </div>
          <ExposureHBarChart data={products} colorByProduct />
        </div>
        <div className="panel">
          <div className="ph" style={{ marginBottom: '14px' }}>
            <span className="pt">Exposure by region</span>
            <span style={{ fontSize: '9px', background: hhiRegion >= HHI_CONCENTRATED ? '#FFFBEB' : '#EAF9F2', color: hhiRegion >= HHI_CONCENTRATED ? '#92400E' : '#065F46', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>HHI {hhiRegion.toLocaleString()}</span>
          </div>
          {regions.length === 0
            ? <div style={{ fontSize: '11px', color: 'var(--muted)' }}>No region data in RiskPortfolio</div>
            : <ExposureHBarChart data={regions.slice(0, 8)} colorByProduct={false} />
          }
        </div>
      </div>

      <div style={{ background: '#F8FAFF', border: '1px solid #DBEAFE', borderRadius: '10px', padding: '14px 18px', fontSize: '10px', color: '#1E40AF', lineHeight: 1.7 }}>
        <strong>Regulatory context:</strong> Under Basel III Art. 395, a single large exposure may not exceed 25% of Tier 1 capital.
        The EBA recommends internal monitoring at 10%. HHI &gt; 2500 indicates high concentration requiring stress testing under EBA/GL/2018/06.
        Lorenz curve area above the diagonal represents the Gini coefficient — higher = more concentrated.
      </div>
    </>
  )
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function Concentration() {
  return (
    <>
      <Topbar title="Concentration Risk" sub="Portfolio Concentration — Basel III / EBA" />
      <div className="content">
        <Suspense fallback={<PageSkeleton />}>
          <ConcentrationContent />
        </Suspense>
      </div>
    </>
  )
}
