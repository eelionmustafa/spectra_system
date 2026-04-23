export const dynamic = 'force-dynamic'

import Topbar from '@/components/Topbar'
import Link from 'next/link'
import { getTopPredictions } from '@/lib/ewiPredictionsService'
import { STRESS, PD_LABELS, TIER } from '@/lib/config'
import { fmtPct } from '@/lib/formatters'
import SectionHeader from '@/components/SectionHeader'
import lazy from 'next/dynamic'
const _skel = () => <div style={{ height: 220, borderRadius: 8, background: '#F8FAFC', animation: 'pulse 1.5s ease-in-out infinite' }} />
const MigrationBarChart     = lazy(() => import('./MigrationBarChart'),     { loading: _skel })
const ShockSensitivityChart = lazy(() => import('./ShockSensitivityChart'), { loading: _skel })

const LGD = STRESS.LGD

const SCENARIOS = [
  { key: 'base',    name: 'Base',    tag: 'Current',  multiplier: 1.0,                       description: 'No shock applied — current risk scoring',            border: 'var(--blue)',  bg: 'rgba(55,138,221,0.06)', headerBg: 'rgba(55,138,221,0.12)', tagColor: 'var(--blue)',  tagBg: 'rgba(55,138,221,0.12)' },
  { key: 'adverse', name: 'Adverse', tag: '+50% PD',  multiplier: STRESS.ADVERSE_MULTIPLIER, description: 'Economic downturn — moderate credit deterioration', border: 'var(--amber)', bg: 'rgba(240,160,75,0.06)', headerBg: 'rgba(240,160,75,0.12)', tagColor: 'var(--amber)', tagBg: 'rgba(240,160,75,0.12)' },
  { key: 'severe',  name: 'Severe',  tag: '+150% PD', multiplier: STRESS.SEVERE_MULTIPLIER,  description: 'Systemic crisis — severe portfolio stress',         border: 'var(--red)',   bg: 'rgba(232,87,87,0.06)',  headerBg: 'rgba(232,87,87,0.12)',  tagColor: 'var(--red)',   tagBg: 'rgba(232,87,87,0.15)'  },
]

const LABEL_ORDER = ['Low', 'Medium', 'High', 'Critical', 'Default imminent']

const LABEL_COLORS: Record<string, string> = {
  'Low': 'var(--green)', 'Medium': 'var(--amber)', 'High': 'var(--red)',
  'Critical': '#C43A3A', 'Default imminent': '#7C1D1D',
}

const LABEL_BG: Record<string, string> = {
  'Low': 'rgba(46,204,138,0.12)', 'Medium': 'rgba(240,160,75,0.12)',
  'High': 'rgba(232,87,87,0.12)', 'Critical': 'rgba(196,58,58,0.15)',
  'Default imminent': 'rgba(124,29,29,0.18)',
}

function shockedLabel(pd: number): string {
  if (pd >= PD_LABELS.DEFAULT_IMMINENT) return 'Default imminent'
  if (pd >= PD_LABELS.CRITICAL)         return 'Critical'
  if (pd >= PD_LABELS.HIGH)             return 'High'
  if (pd >= PD_LABELS.MEDIUM)           return 'Medium'
  return 'Low'
}

function fmtDelta(delta: number): string { const sign = delta >= 0 ? '+' : ''; return sign + (delta * 100).toFixed(1) + 'pp' }

interface ScenarioStats { avgPD: number; elr: number; labelCounts: Record<string, number>; criticalCount: number }

function computeScenario(basePDs: number[], multiplier: number): ScenarioStats {
  const total = basePDs.length
  if (total === 0) return { avgPD: 0, elr: 0, labelCounts: {}, criticalCount: 0 }
  let sumPD = 0; const labelCounts: Record<string, number> = {}; let criticalCount = 0
  for (const pd of basePDs) {
    const shocked = Math.min(pd * multiplier, 1.0)
    sumPD += shocked
    const label = shockedLabel(shocked)
    labelCounts[label] = (labelCounts[label] ?? 0) + 1
    if (shocked >= TIER.CRITICAL_PD) criticalCount++
  }
  const avgPD = sumPD / total
  return { avgPD, elr: avgPD * LGD, labelCounts, criticalCount }
}

export default async function StressPage() {
  let predictions: Awaited<ReturnType<typeof getTopPredictions>> = []
  let dbError = false

  try {
    predictions = await getTopPredictions(9999)
  } catch {
    dbError = true
  }

  const total  = predictions.length
  const noData = !dbError && total === 0
  const runDate = predictions[0]?.run_date
    ? new Date(predictions[0].run_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : ''

  if (dbError) {
    return (
      <>
        <Topbar title="Stress Testing" sub="PD Shock Scenarios" />
        <div className="content">
          <div className="panel" style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>Database connection error</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Check your <code>.env</code> credentials and try again.</div>
          </div>
        </div>
      </>
    )
  }

  if (noData) {
    return (
      <>
        <Topbar title="Stress Testing" sub="PD Shock Scenarios" />
        <div className="content">
          <div className="panel" style={{ padding: '56px 48px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '14px', opacity: 0.3 }}>&#9651;</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
              No prediction data to stress-test
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', maxWidth: '360px', margin: '0 auto 20px' }}>
              Stress scenarios are computed from live EWI predictions. Generate predictions first from the
              Early Warnings page, then return here.
            </div>
            <Link href="/warnings?view=predictions" style={{
              display: 'inline-block', padding: '9px 20px', borderRadius: '7px',
              background: 'var(--navy)', color: 'white', fontSize: '12px',
              fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font)',
            }}>
              Go to Early Warnings →
            </Link>
          </div>
        </div>
      </>
    )
  }

  // Normalize: old snapshots stored risk_score as 0–100; current ML pipeline uses 0–1.
  // Guard: if any value exceeds 1 assume the whole batch is on the 0–100 scale.
  const rawScores = predictions.map(p => p.risk_score ?? 0)
  const needsNorm = rawScores.some(v => v > 1)
  const basePDs   = needsNorm ? rawScores.map(v => v / 100) : rawScores
  const scenarioStats = SCENARIOS.map(s => ({ ...s, stats: computeScenario(basePDs, s.multiplier) }))
  const baseStats     = scenarioStats[0].stats
  const maxAvgPD      = Math.max(...scenarioStats.map(s => s.stats.avgPD), 0.001)
  const maxLabelCount = Math.max(...scenarioStats.flatMap(s => Object.values(s.stats.labelCounts)), 1)

  return (
    <>
      <Topbar title="Stress Testing" sub="PD Shock Scenarios — IFRS 9 / Basel III" />
      <div className="content">

        <SectionHeader title="Scenario Overview" sub="PD shock parameters & at-risk portfolio summary" />
        <div style={{ background: 'var(--navy)', borderRadius: '12px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap', border: '1px solid rgba(201,168,76,0.12)' }}>
          <div style={{ flex: '0 0 auto' }}>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Scored Clients</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>{total.toLocaleString()}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '4px', fontFamily: 'var(--mono)' }}>
              {runDate ? `Run date: ${runDate}` : 'EWI predictions — at-risk segment'}
            </div>
          </div>
          <div style={{ width: '1px', height: '46px', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
          {scenarioStats.map(s => (
            <div key={s.key} style={{ flex: '0 0 auto', textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{s.name} Avg PD</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: s.border, lineHeight: 1 }}>{fmtPct(s.stats.avgPD)}</div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginTop: '4px', fontFamily: 'var(--mono)' }}>ELR {fmtPct(s.stats.elr, 2)}</div>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 14px', fontSize: '10px', color: 'rgba(255,255,255,0.4)', textAlign: 'right', fontFamily: 'var(--mono)' }}>
            <div>LGD = {(LGD * 100).toFixed(0)}% (Basel unsecured)</div>
            <div style={{ marginTop: '3px' }}>Source: SPECTRA EWI predictions</div>
          </div>
        </div>

        <SectionHeader title="Scenario Comparison" sub="base vs adverse vs severe — PD shock simulation" />
        <div className="row3">
          {scenarioStats.map((s, si) => {
            const pdDelta   = s.stats.avgPD - baseStats.avgPD
            const elrDelta  = s.stats.elr   - baseStats.elr
            const critDelta = s.stats.criticalCount - baseStats.criticalCount
            const isBase    = si === 0
            return (
              <div key={s.key} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ background: s.headerBg, padding: '12px 16px', borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{s.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{s.description}</div>
                  </div>
                  <div style={{ background: s.tagBg, color: s.tagColor, fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '10px', fontFamily: 'var(--mono)', flexShrink: 0 }}>{s.tag}</div>
                </div>

                <div style={{ padding: '14px 16px' }}>
                  {/* Avg PD */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '3px' }}>Portfolio Avg PD</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '26px', fontWeight: 800, color: s.border, fontFamily: 'var(--mono)', lineHeight: 1 }}>{fmtPct(s.stats.avgPD)}</span>
                      {!isBase && (<span style={{ fontSize: '11px', fontFamily: 'var(--mono)', fontWeight: 600, color: pdDelta > 0 ? 'var(--red)' : 'var(--green)' }}>{fmtDelta(pdDelta)} vs Base</span>)}
                    </div>
                    <div style={{ marginTop: '7px', height: '5px', background: 'rgba(0,0,0,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min((s.stats.avgPD / maxAvgPD) * 100, 100)}%`, background: s.border, borderRadius: '3px' }} />
                    </div>
                  </div>

                  {/* Expected Loss Rate */}
                  <div style={{ background: 'rgba(0,0,0,0.04)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Expected Loss Rate (PD × LGD)</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{fmtPct(s.stats.elr, 2)}</span>
                      {!isBase && (<span style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: elrDelta > 0 ? 'var(--red)' : 'var(--green)' }}>{fmtDelta(elrDelta)} vs Base</span>)}
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '2px' }}>{fmtPct(s.stats.avgPD)} avg PD × {(LGD * 100).toFixed(0)}% LGD</div>
                  </div>

                  {/* Critical count */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', padding: '9px 12px', background: 'rgba(196,58,58,0.06)', border: '1px solid rgba(196,58,58,0.15)', borderRadius: '7px' }}>
                    <div>
                      <div style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Critical Clients (PD ≥ {Math.round(TIER.CRITICAL_PD * 100)}%)</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: '#C43A3A', fontFamily: 'var(--mono)', marginTop: '1px' }}>{s.stats.criticalCount.toLocaleString()}</div>
                    </div>
                    {!isBase ? (
                      <div style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--mono)', color: critDelta > 0 ? 'var(--red)' : 'var(--green)', textAlign: 'right' }}>
                        {critDelta >= 0 ? '+' : ''}{critDelta.toLocaleString()}
                        <div style={{ fontSize: '9px', color: 'var(--muted)', fontWeight: 400, marginTop: '1px' }}>vs Base</div>
                      </div>
                    ) : (
                      <span className="badge bb">Baseline</span>
                    )}
                  </div>

                  {/* Risk label mini-bars */}
                  <div>
                    <div style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Risk Label Distribution</div>
                    {LABEL_ORDER.map(label => {
                      const count  = s.stats.labelCounts[label] ?? 0
                      const barPct = maxLabelCount > 0 ? (count / maxLabelCount) * 100 : 0
                      const pct    = total > 0 ? (count / total) * 100 : 0
                      const color  = LABEL_COLORS[label] ?? 'var(--muted)'
                      return (
                        <div key={label} style={{ marginBottom: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text)', fontWeight: 500 }}>{label}</span>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{pct.toFixed(1)}%</span>
                              <span style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)', minWidth: '36px', textAlign: 'right' }}>{count.toLocaleString()}</span>
                            </div>
                          </div>
                          <div style={{ height: '5px', background: '#EEF2F7', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.max(barPct, count > 0 ? 0.5 : 0)}%`, background: color, borderRadius: '3px' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Scenario Interpretation ────────────────────────────────── */}
        {(() => {
          const severeStats  = scenarioStats[2].stats
          const adverseStats = scenarioStats[1].stats
          const severeELR    = severeStats.elr
          const critDelta    = severeStats.criticalCount - baseStats.criticalCount
          const elrDelta     = severeStats.elr - baseStats.elr

          let level: 'resilient' | 'moderate' | 'severe'
          if (severeELR < 0.05)  level = 'resilient'
          else if (severeELR < 0.15) level = 'moderate'
          else level = 'severe'

          const META = {
            resilient: { color: '#065F46', bg: '#ECFDF5', border: '#6EE7B7', label: 'Portfolio Resilient', summary: 'The portfolio shows adequate resilience under both adverse and severe shock scenarios.' },
            moderate:  { color: '#92400E', bg: '#FFFBEB', border: '#FCD34D', label: 'Moderate Stress Exposure', summary: 'The severe scenario reveals material PD uplift. Capital buffers should be reviewed against ICAAP requirements.' },
            severe:    { color: '#C43A3A', bg: '#FEF2F2', border: '#FECACA', label: 'Significant Capital Risk', summary: 'Severe scenario indicates elevated expected loss rates. Immediate provisioning review and capital stress reporting is recommended.' },
          }
          const m = META[level]

          const steps: { label: string; href: string }[] = [
            { label: `Review Stage 3 clients (${severeStats.criticalCount} critical under severe)`, href: '/watchlist' },
            { label: 'Check concentration — verify spread of high-PD clients', href: '/concentration' },
            { label: `Validate IFRS 9 provisions — severe ELR at ${fmtPct(severeStats.elr, 2)}`, href: '/analytics' },
          ]
          if (critDelta > 5)
            steps.unshift({ label: `Flag ${critDelta} clients migrating to Critical under stress`, href: '/warnings' })

          return (
            <div style={{ background: m.bg, border: `1px solid ${m.border}`, borderLeft: `4px solid ${m.color}`, borderRadius: '8px', padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1.5px', color: m.color, fontWeight: 700 }}>Scenario Interpretation</span>
                <span style={{ fontSize: '10px', fontWeight: 700, background: m.color + '22', color: m.color, padding: '2px 8px', borderRadius: '5px' }}>{m.label}</span>
              </div>
              <div style={{ fontSize: '11px', color: m.color, marginBottom: '12px', lineHeight: 1.55 }}>{m.summary}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                {[
                  { label: 'Adverse ELR uplift', value: '+' + ((adverseStats.elr - baseStats.elr) * 100).toFixed(2) + 'pp' },
                  { label: 'Severe ELR uplift',  value: '+' + (elrDelta * 100).toFixed(2) + 'pp' },
                  { label: 'Critical delta (severe)', value: critDelta >= 0 ? '+' + critDelta : String(critDelta) },
                ].map(stat => (
                  <div key={stat.label} style={{ background: 'rgba(0,0,0,0.04)', borderRadius: '6px', padding: '8px 12px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>{stat.label}</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--mono)', color: m.color }}>{stat.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--muted)', fontWeight: 600, marginBottom: '8px' }}>Recommended Next Steps</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'white', borderRadius: '5px', padding: '7px 12px', border: `1px solid ${m.border}` }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, background: m.border, color: m.color, borderRadius: '3px', padding: '1px 5px', flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: '11px', fontWeight: 500, color: 'var(--text)' }}>{s.label}</div>
                    <Link href={s.href} style={{ fontSize: '10px', fontWeight: 600, color: m.color, textDecoration: 'none', padding: '3px 8px', borderRadius: '4px', background: m.bg, border: `1px solid ${m.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      Go →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        <SectionHeader title="Migration Analysis" sub="client count per risk bucket under each scenario" />
        <div className="panel">
          <div className="ph">
            <span className="pt">Migration Analysis</span>
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Client count per risk bucket under each scenario</span>
          </div>
          <MigrationBarChart data={LABEL_ORDER.map(label => ({
            label,
            Base:    scenarioStats[0].stats.labelCounts[label] ?? 0,
            Adverse: scenarioStats[1].stats.labelCounts[label] ?? 0,
            Severe:  scenarioStats[2].stats.labelCounts[label] ?? 0,
          }))} />
          <div className="tbl-wrap" style={{ maxHeight: 'none' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Risk Label</th>
                  {scenarioStats.map(s => (<th key={s.key} style={{ textAlign: 'right', color: s.tagColor }}>{s.name}</th>))}
                  <th style={{ textAlign: 'right', color: 'var(--amber)' }}>Adverse Delta</th>
                  <th style={{ textAlign: 'right', color: 'var(--red)' }}>Severe Delta</th>
                </tr>
              </thead>
              <tbody>
                {LABEL_ORDER.map(label => {
                  const base    = scenarioStats[0].stats.labelCounts[label] ?? 0
                  const adverse = scenarioStats[1].stats.labelCounts[label] ?? 0
                  const severe  = scenarioStats[2].stats.labelCounts[label] ?? 0
                  const dAdv    = adverse - base
                  const dSev    = severe  - base
                  const color   = LABEL_COLORS[label] ?? 'var(--muted)'
                  const bg      = LABEL_BG[label]    ?? 'transparent'
                  return (
                    <tr key={label}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 7px', borderRadius: '10px', background: bg, color, fontFamily: 'var(--mono)' }}>{label}</span>
                        </div>
                      </td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{base.toLocaleString()}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{adverse.toLocaleString()}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{severe.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="mono" style={{ color: dAdv > 0 ? 'var(--red)' : dAdv < 0 ? 'var(--green)' : 'var(--muted)', fontWeight: dAdv !== 0 ? 700 : 400 }}>{dAdv >= 0 ? '+' : ''}{dAdv.toLocaleString()}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="mono" style={{ color: dSev > 0 ? 'var(--red)' : dSev < 0 ? 'var(--green)' : 'var(--muted)', fontWeight: dSev !== 0 ? 700 : 400 }}>{dSev >= 0 ? '+' : ''}{dSev.toLocaleString()}</span>
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td style={{ fontWeight: 600, fontSize: '11px', color: 'var(--text)' }}>Total</td>
                  {scenarioStats.map(s => (<td key={s.key} className="mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{total.toLocaleString()}</td>))}
                  <td style={{ textAlign: 'right' }}><span className="mono" style={{ color: 'var(--muted)', fontSize: '10px' }}>—</span></td>
                  <td style={{ textAlign: 'right' }}><span className="mono" style={{ color: 'var(--muted)', fontSize: '10px' }}>—</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <SectionHeader title="Shock Sensitivity" sub="portfolio avg PD & expected loss rate per scenario" />
        <div className="panel">
          <div className="ph">
            <span className="pt">Shock Sensitivity</span>
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Portfolio average PD and expected loss rate under each scenario</span>
          </div>
          <ShockSensitivityChart data={scenarioStats.map(s => ({
            name:  s.name,
            avgPD: +(s.stats.avgPD * 100).toFixed(2),
            elr:   +(s.stats.elr   * 100).toFixed(2),
            color: s.border,
          }))} />
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: 'var(--muted)' }}>
            {scenarioStats.map(s => (
              <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.border }} />
                {s.name}: Avg PD {fmtPct(s.stats.avgPD)} · ELR {fmtPct(s.stats.elr, 2)}
              </span>
            ))}
          </div>
        </div>

        {/* Methodology Note */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 18px', borderLeft: '3px solid var(--muted)' }}>
          <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--muted)', marginBottom: '10px', fontWeight: 600 }}>Methodology &amp; Disclaimer</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 32px' }}>
            {[
              { label: 'PD Source',          value: 'SPECTRA EWI risk_score (0–1) derived from IFRS 9 stage classification and DPD delinquency data' },
              { label: 'Shock Mechanism',    value: 'Multiplicative: PD_shocked = min(PD_base × multiplier, 1.0) — applied per client' },
              { label: 'LGD Assumption',     value: `${(LGD * 100).toFixed(0)}% — Basel II/III standard for unsecured retail exposures` },
              { label: 'Expected Loss Rate', value: 'ELR = Avg PD (shocked) × LGD — portfolio loss rate proxy' },
              { label: 'Adverse Scenario',   value: '1.5× PD multiplier — calibrated to moderate economic stress (GDP contraction ~2%)' },
              { label: 'Severe Scenario',    value: '2.5× PD multiplier — calibrated to systemic crisis (GDP contraction ~5%+)' },
              { label: 'Risk Re-labeling',   value: 'Labels re-computed from shocked PD: Low <21%, Medium 21–41%, High 41–66%, Critical 66–86%, Default imminent 86%+' },
              { label: 'Population',         value: 'At-risk segment only (Medium+ EWI score). Stage 1 clients with 0 DPD excluded from EWI scoring.' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)', minWidth: '136px', flexShrink: 0, marginTop: '1px' }}>{item.label}</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.55 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  )
}
