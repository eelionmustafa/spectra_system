export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Topbar from '@/components/Topbar'
import ActionChips from '@/components/ActionChips'
import Link from 'next/link'
import {
  getActiveAlerts,
  getClientSignalsBatch,
  getAlertsPaginated,
} from '@/lib/queries'
import type { ClientSignalSnapshot } from '@/lib/queries'
import { readPredictions, readShapExplanations } from '@/lib/predictions'
import fs from 'fs'
import path from 'path'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import type { Role } from '@/lib/users'
import { deriveTier, TIER_META, assess } from '@/lib/actionEngine'
import type { Tier } from '@/lib/actionEngine'
import { EWI } from '@/lib/config'
import { getPredictionsPaginated } from '@/lib/ewiPredictionsService'
import { getRecommendationsPaginated } from '@/lib/ewiRecommendationsService'
import { fmt } from '@/lib/formatters'
import SectionHeader from '@/components/SectionHeader'
import AlertsTable from './AlertsTable'
import PredictionsTable from './PredictionsTable'
import RecommendationsTable from './RecommendationsTable'

/* ─── helpers ─────────────────────────────────────────────────────────────── */

const FACTOR_LABELS: Record<string, [string, string, string]> = {
  max_dpd_6m:       ['Max DPD spiked (6M)',        'Max DPD improving (6M)',      'Max DPD (6M)'],
  dpd_trend:        ['DPD trending upward',         'DPD stabilising',             'DPD trend'],
  avg_dpd:          ['Average DPD rising',          'Average DPD falling',         'Avg DPD'],
  dpd_recent:       ['Recent DPD elevated',         'Recent DPD normal',           'Recent DPD'],
  missed_payments:  ['Missed payments increasing',  'Missed payments decreasing',  'Missed payments'],
  salary_months:    ['Salary inflow stopped',       'Salary inflow stable',        'Salary inflow'],
  salary_inflow:    ['Salary inflow stopped',       'Salary inflow stable',        'Salary inflow'],
  overdraft_months: ['Overdraft dependency growing','Overdraft reducing',          'Overdraft months'],
  card_utilization: ['Card utilization near limit', 'Card utilization normal',     'Card utilization'],
  card_util:        ['Card utilization elevated',   'Card utilization normal',     'Card util'],
  repayment_rate:      ['Repayment rate declining',    'Repayment rate improving',    'Repayment rate'],
  repayment_rate_pct:  ['Repayment rate declining',    'Repayment rate improving',    'Repayment rate'],
  cure_rate:           ['Repayment rate declining',    'Repayment rate improving',    'Repayment rate'],
  dti_ratio:        ['Debt-to-income elevated',     'Debt-to-income manageable',   'DTI ratio'],
  consec_lates:     ['Consecutive lates increasing','No consecutive lates',        'Consec lates'],
}

function driverBullet(factor: string, value: number): string {
  const entry = FACTOR_LABELS[factor]
  if (entry) return value >= 0 ? entry[0] : entry[1]
  const clean = factor.replace(/_/g, ' ')
  return clean.charAt(0).toUpperCase() + clean.slice(1) + (value >= 0 ? ' elevated' : ' reduced')
}

const TIER_ORDER: Tier[] = ['default-imminent', 'deteriorating', 'stable-watch']

const PD_FIELD: Record<string, 'pd_30d' | 'pd_60d' | 'pd_90d'> = {
  '30': 'pd_30d',
  '60': 'pd_60d',
  '90': 'pd_90d',
}

const PD_THRESHOLD = EWI.PD_THRESHOLD

const TIER_BADGE: Record<Tier, string> = {
  'default-imminent': 'br',
  'deteriorating':    'ba',
  'stable-watch':     'bb',
}

const VALID_SEV      = new Set(['critical', 'high'])
const VALID_STAGE    = new Set(['1', '2', '3', 'NA'])
const VALID_RISK     = new Set(['Critical', 'High', 'Medium', 'Low'])
const VALID_PRIORITY = new Set(['Urgent', 'High', 'Medium', 'Low'])

/* ─── skeleton ────────────────────────────────────────────────────────────── */

function WarningSkeleton() {
  return (
    <div className="content">
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[80, 140, 150].map((w, i) => (
          <div key={i} style={{ height: 32, width: w, borderRadius: 4, background: '#F1F5F9', animation: `pulse 1.4s ease-in-out ${i * 0.08}s infinite` }} />
        ))}
      </div>
      <div style={{ height: 36, borderRadius: 6, background: '#F1F5F9', marginBottom: 10, animation: 'pulse 1.4s ease-in-out infinite' }} />
      <div style={{ height: 14, width: '28%', borderRadius: 4, background: '#F1F5F9', marginBottom: 8, animation: 'pulse 1.4s ease-in-out 0.1s infinite' }} />
      <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: 52, background: 'rgba(13,27,42,0.12)', animation: 'pulse 1.4s ease-in-out 0.12s infinite' }} />
        <div style={{ height: 160, background: '#F8FAFC', animation: 'pulse 1.4s ease-in-out 0.15s infinite' }} />
      </div>
      <div style={{ height: 14, width: '22%', borderRadius: 4, background: '#F1F5F9', marginBottom: 8, animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
      {[0, 1, 2].map(i => (
        <div key={i} style={{ height: 48, background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 4, animation: `pulse 1.4s ease-in-out ${0.08 * i}s infinite` }} />
      ))}
    </div>
  )
}

/* ─── content ─────────────────────────────────────────────────────────────── */

async function WarningsContent({
  filterTier, filterWindow, caseIndex, activeView,
  aq, alertPage, alertSev, alertStage,
  pq, predPage, predRisk,
  rq, recPage, recPri, recShowAll,
  userRole,
}: {
  filterTier: string; filterWindow: string; caseIndex: number; activeView: string
  aq: string; alertPage: number; alertSev: string; alertStage: string
  pq: string; predPage: number; predRisk: string
  rq: string; recPage: number; recPri: string; recShowAll: boolean
  userRole: Role
}) {
  let alerts:    Awaited<ReturnType<typeof getActiveAlerts>>,
      signalsMap: Record<string, ClientSignalSnapshot>

  try {
    ;[alerts, signalsMap] = await Promise.all([
      getActiveAlerts(),
      getClientSignalsBatch(),
    ])
  } catch {
    return (
      <div className="content">
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
          Database not connected &mdash; fill in <code>.env</code> with SSMS credentials.
        </div>
      </div>
    )
  }

  const allPredictions = readPredictions()
  const allShap = readShapExplanations()

  // ── Paginated table data + tab counts — all parallel ──
  let alertRows:  Awaited<ReturnType<typeof getAlertsPaginated>>['rows']          = []
  let alertTotal  = 0
  let predRows:   Awaited<ReturnType<typeof getPredictionsPaginated>>['rows']     = []
  let predTotal   = 0
  let recRows:    Awaited<ReturnType<typeof getRecommendationsPaginated>>['rows'] = []
  let recTotal    = 0

  // Fetch active tab data and both inactive-tab counts in one parallel batch
  const [paginatedResult, predCountResult, recCountResult] = await Promise.all([
    activeView === 'monitor'
      ? getAlertsPaginated(aq, alertPage, { severity: alertSev, stage: alertStage })
          .then(r => ({ rows: r.rows as unknown[], total: r.total }))
          .catch(() => ({ rows: [] as unknown[], total: 0 }))
      : activeView === 'predictions'
      ? getPredictionsPaginated(pq, predPage, predRisk)
          .then(r => ({ rows: r.rows as unknown[], total: r.total }))
          .catch(() => ({ rows: [] as unknown[], total: 0 }))
      : getRecommendationsPaginated(rq, recPage, recPri, recShowAll)
          .then(r => ({ rows: r.rows as unknown[], total: r.total }))
          .catch(() => ({ rows: [] as unknown[], total: 0 })),
    activeView !== 'predictions'
      ? getPredictionsPaginated('', 1, '').then(r => r.total).catch(() => 0)
      : Promise.resolve(0),
    activeView !== 'recommended'
      ? getRecommendationsPaginated('', 1, '', false).then(r => r.total).catch(() => 0)
      : Promise.resolve(0),
  ])

  if (activeView === 'monitor') {
    alertRows  = paginatedResult.rows as typeof alertRows
    alertTotal = paginatedResult.total
  } else if (activeView === 'predictions') {
    predRows  = paginatedResult.rows as typeof predRows
    predTotal = paginatedResult.total
  } else {
    recRows  = paginatedResult.rows as typeof recRows
    recTotal = paginatedResult.total
  }

  const predCount = activeView === 'predictions' ? predTotal : predCountResult
  const recCount  = activeView === 'recommended'  ? recTotal  : recCountResult

  const pdField = PD_FIELD[filterWindow] ?? 'pd_90d'

  const exposureMap: Record<string, number> = {}
  for (const a of alerts) {
    exposureMap[a.personal_id] = (exposureMap[a.personal_id] ?? 0) + (a.exposure ?? 0)
  }

  type AnnotatedRow = ReturnType<typeof readPredictions>[number] & {
    tier: Tier; exposure: number; windowPD: number
  }
  const deduped = Array.from(
    new Map(allPredictions.map(p => [p.clientID, p])).values()
  )
  const annotated: AnnotatedRow[] = deduped
    .filter(p => p[pdField] >= PD_THRESHOLD)
    .map(p => ({
      ...p,
      windowPD: p[pdField],
      tier: deriveTier('', p[pdField]),
      exposure: exposureMap[p.clientID] ?? 0,
    }))
    .sort((a, b) => b.windowPD - a.windowPD)

  const visible = filterTier === 'all' ? annotated : annotated.filter(p => p.tier === filterTier)

  const acksFile = path.join(process.cwd(), '..', 'data', 'processed', 'alert_acks.json')
  type AckEntry = { credit_id: string; action: string; acknowledged_by: string; acknowledged_at: string }
  let acksMap: Record<string, AckEntry> = {}
  try {
    if (fs.existsSync(acksFile)) {
      const raw: AckEntry[] = JSON.parse(fs.readFileSync(acksFile, 'utf-8'))
      acksMap = Object.fromEntries(raw.map(a => [a.credit_id, a]))
    }
  } catch { /* ignore */ }

  // ── Case Review ──
  const safeIndex  = Math.min(caseIndex, visible.length - 1)
  const caseRow    = visible.length > 0 ? visible[safeIndex] : null
  const caseTm     = caseRow ? TIER_META[caseRow.tier] : null
  const casePdPct  = caseRow ? Math.round(caseRow.windowPD * 100) : 0
  const caseShap   = caseRow ? allShap[caseRow.clientID] : null
  const caseSig    = caseRow ? signalsMap[caseRow.clientID] : null
  const caseDrivers = caseShap ? [
    caseShap.top_factor_1 ? { label: driverBullet(caseShap.top_factor_1, caseShap.shap_1), shap: Math.abs(caseShap.shap_1), neg: caseShap.shap_1 < 0 } : null,
    caseShap.top_factor_2 ? { label: driverBullet(caseShap.top_factor_2, caseShap.shap_2), shap: Math.abs(caseShap.shap_2), neg: caseShap.shap_2 < 0 } : null,
  ].filter(Boolean) as { label: string; shap: number; neg: boolean }[] : []
  const caseMaxShap   = Math.max(...caseDrivers.map(d => d.shap), 0.01)
  const caseActions   = caseRow ? assess({
    pdScore: caseRow.windowPD, riskLabel: caseRow.risk_label,
    ifrsStage: caseSig?.ifrs_stage ?? 1, currentDPD: caseSig?.current_dpd ?? 0,
    maxDPD12m: caseSig?.max_dpd_12m ?? 0, missedPayments: caseSig?.missed_payments ?? 0,
    totalPayments: caseSig?.total_payments ?? 12, dtiRatio: 0,
    cureRate: caseSig?.repayment_rate ?? 50, salaryInflow: caseSig?.salary_inflow ?? 'Normal',
    overdraft: caseSig?.overdraft ?? 'None', cardUsage: caseSig?.card_usage ?? 'Normal',
    consecLates: caseSig?.consec_lates ?? '0 months', productType: caseSig?.product_type ?? 'Consumer',
    stageMigrationProb: caseRow.stage_migration_prob, dpdEscalationProb: caseRow.dpd_escalation_prob,
    exposure: caseRow.exposure, activeActions: [], topShapFactor: caseShap?.top_factor_1 ?? '',
  }).actions : []
  const casePrevHref  = safeIndex > 0 ? `?tier=${filterTier}&window=${filterWindow}&case=${safeIndex - 1}#case-review` : null
  const caseNextHref  = caseRow && safeIndex < visible.length - 1 ? `?tier=${filterTier}&window=${filterWindow}&case=${safeIndex + 1}#case-review` : null
  const caseBorderColor  = caseRow?.tier === 'default-imminent' ? '#DC2626' : caseRow?.tier === 'deteriorating' ? '#D97706' : '#1D4ED8'
  const caseAccentBg     = caseRow?.tier === 'default-imminent' ? '#FEF2F2' : caseRow?.tier === 'deteriorating' ? '#FFFBEB' : '#EFF6FF'
  const caseAccentBorder = caseRow?.tier === 'default-imminent' ? '#FECACA' : caseRow?.tier === 'deteriorating' ? '#FCD34D' : '#BFDBFE'
  const caseProgressPct  = visible.length > 1 ? (safeIndex / (visible.length - 1)) * 100 : 100

  void acksMap // used in future ack UI

  return (
    <div className="content">

      {/* ── View tab bar ──────────────────────────────────────────────────── */}
      <div className="tabs" style={{ marginBottom: '10px' }}>
        {([
          { id: 'monitor',     label: 'EWI Monitor' },
          { id: 'predictions', label: 'Predicted Deterioration', count: predCount || undefined },
          { id: 'recommended', label: 'Recommended Actions',     count: recCount  || undefined },
        ] as { id: string; label: string; count?: number }[]).map(t => (
          <a
            key={t.id}
            href={`?view=${t.id}&tier=${filterTier}&window=${filterWindow}`}
            className={`tab${activeView === t.id ? ' active' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            {t.label}
            {t.count != null && <span className="tab-count">{t.count}</span>}
          </a>
        ))}
      </div>

      {/* ── Predicted Deterioration tab ───────────────────────────────────── */}
      {activeView === 'predictions' && (
        <PredictionsTable
          initialRows={predRows}
          initialTotal={predTotal}
          initialQ={pq}
          initialPage={predPage}
          initialRisk={predRisk}
        />
      )}

      {/* ── Recommended Actions tab ───────────────────────────────────────── */}
      {activeView === 'recommended' && (
        <RecommendationsTable
          initialRows={recRows}
          initialTotal={recTotal}
          initialQ={rq}
          initialPage={recPage}
          initialPriority={recPri}
          initialShowAll={recShowAll}
        />
      )}

      {/* ── EWI Monitor (existing content) ───────────────────────────────── */}
      {activeView === 'monitor' && <>

      {/* Filter bar — at top so Case Review is immediately below */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <span style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tier:</span>
        {(['all', ...TIER_ORDER] as const).map(t => {
          const isAll = t === 'all'
          const active = filterTier === t
          const tm2 = !isAll ? TIER_META[t] : null
          return (
            <a key={t} href={`?tier=${t}&window=${filterWindow}#case-review-top`} style={{
              fontSize: '10px', padding: '4px 10px', borderRadius: '4px', textDecoration: 'none',
              border: `1px solid ${active ? (tm2 ? tm2.border : 'var(--navy)') : 'var(--border)'}`,
              background: active ? (tm2 ? tm2.color : 'var(--navy)') : 'white',
              color: active ? 'white' : 'var(--muted)',
              fontWeight: active ? 600 : 400,
            }}>
              {isAll ? 'All' : tm2!.label}
            </a>
          )
        })}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '4px' }}>Window:</span>
          {['30', '60', '90'].map(w => {
            const active = filterWindow === w
            return (
              <a key={w} href={`?tier=${filterTier}&window=${w}#case-review-top`} style={{
                fontSize: '10px', padding: '4px 10px', borderRadius: '4px', textDecoration: 'none',
                border: `1px solid ${active ? 'var(--navy)' : 'var(--border)'}`,
                background: active ? 'var(--navy)' : 'white',
                color: active ? 'white' : 'var(--muted)',
                fontWeight: active ? 600 : 400, fontFamily: 'var(--mono)',
              }}>
                {w}d
              </a>
            )
          })}
        </div>
      </div>

      <div id="case-review-top" />
      <SectionHeader title="Case Review" sub={`${visible.length} clients · ${filterWindow}d window · reviewing one at a time`} />

      {allPredictions.length === 0 ? (
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
          No prediction data &mdash; run <code>python scripts/predict.py</code> first.
        </div>
      ) : visible.length === 0 ? (
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--green)', fontSize: '12px' }}>
          No clients above threshold in selected window
        </div>
      ) : caseRow && (
        <div id="case-review" style={{ borderRadius: '6px', border: `1px solid ${caseAccentBorder}`, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>

          {/* ── single header row: nav + identity + PD ── */}
          <div style={{ background: 'var(--navy)', padding: '0 16px', display: 'flex', alignItems: 'stretch', gap: '0', minHeight: '52px' }}>

            {/* prev */}
            <div style={{ display: 'flex', alignItems: 'center', paddingRight: '12px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
              {casePrevHref
                ? <a href={casePrevHref} style={{ fontSize: '10px', padding: '5px 10px', borderRadius: '3px', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>← Prev</a>
                : <span style={{ fontSize: '10px', padding: '5px 10px', color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap' }}>← Prev</span>
              }
            </div>

            {/* progress + case label */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 14px', minWidth: '120px' }}>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '5px' }}>
                Case {safeIndex + 1} / {visible.length}
              </span>
              <div style={{ height: '3px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px', width: '90px' }}>
                <div style={{ height: '100%', width: `${caseProgressPct}%`, background: caseProgressPct === 100 ? '#4ADE80' : caseBorderColor, borderRadius: '2px' }} />
              </div>
            </div>

            {/* rank bubble + client id + badges */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', padding: '0 8px', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: caseBorderColor, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '9px', fontWeight: 800, color: 'white', fontFamily: 'var(--mono)' }}>#{safeIndex + 1}</span>
              </div>
              <div>
                <Link href={`/clients/${caseRow.clientID}`} className="mono" style={{ fontSize: '14px', fontWeight: 800, color: 'white', textDecoration: 'none', display: 'block', lineHeight: 1.2 }}>
                  {caseRow.clientID} <span style={{ fontSize: '10px', opacity: 0.5 }}>↗</span>
                </Link>
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                  {caseTm && <span className={`badge ${TIER_BADGE[caseRow.tier]}`}>{caseTm.label}</span>}
                  {caseSig?.ifrs_stage != null && <span className={`badge ${caseSig.ifrs_stage === 3 ? 'br' : caseSig.ifrs_stage === 2 ? 'ba' : 'bg'}`}>Stage {caseSig.ifrs_stage}</span>}
                  {caseSig?.product_type && <span className="badge bb">{caseSig.product_type}</span>}
                </div>
              </div>
            </div>

            {/* PD score */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', padding: '0 14px', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1px' }}>PD Score</div>
              <div className="mono" style={{ fontSize: '28px', fontWeight: 900, color: caseBorderColor, lineHeight: 1 }}>{casePdPct}<span style={{ fontSize: '13px' }}>%</span></div>
              <div style={{ width: '70px', height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '4px' }}>
                <div style={{ height: '100%', width: `${casePdPct}%`, background: caseBorderColor, borderRadius: '2px' }} />
              </div>
            </div>

            {/* next */}
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
              {caseNextHref
                ? <a href={caseNextHref} style={{ fontSize: '10px', padding: '5px 10px', borderRadius: '3px', background: caseBorderColor, color: 'white', textDecoration: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}>Next →</a>
                : <span style={{ fontSize: '10px', padding: '5px 10px', borderRadius: '3px', background: '#16A34A', color: 'white', fontWeight: 700, whiteSpace: 'nowrap' }}>Done ✓</span>
              }
            </div>

          </div>

          {/* ── body: two columns ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', background: 'white' }}>

            {/* left — signals + drivers */}
            <div style={{ padding: '14px 16px', borderRight: `1px solid var(--border)`, display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* signals 3×2 */}
              <div>
                <div style={{ fontSize: '8px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px', fontWeight: 600 }}>Client Signals</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
                  {([
                    { label: 'Exposure',    value: caseRow.exposure > 0 ? fmt(caseRow.exposure) : '—', bad: false },
                    { label: 'Current DPD', value: caseSig?.current_dpd != null ? `${caseSig.current_dpd}d` : '—', bad: (caseSig?.current_dpd ?? 0) > 30 },
                    { label: 'Max DPD 12M', value: caseSig?.max_dpd_12m != null ? `${caseSig.max_dpd_12m}d` : '—', bad: (caseSig?.max_dpd_12m ?? 0) > 60 },
                    { label: 'Missed pmts', value: caseSig?.missed_payments != null ? String(caseSig.missed_payments) : '—', bad: (caseSig?.missed_payments ?? 0) >= 3 },
                    { label: 'Salary',      value: caseSig?.salary_inflow ?? '—', bad: caseSig?.salary_inflow === 'Stopped' },
                    { label: 'Repayment',   value: caseSig?.repayment_rate != null ? `${caseSig.repayment_rate}%` : '—', bad: (caseSig?.repayment_rate ?? 100) < 60 },
                  ]).map(({ label, value, bad }) => (
                    <div key={label} style={{ padding: '6px 8px', background: bad ? '#FFF8F8' : '#F8FAFC', border: `1px solid ${bad ? '#FECACA' : 'var(--border)'}`, borderRadius: '4px' }}>
                      <div style={{ fontSize: '7px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>{label}</div>
                      <div className="mono" style={{ fontSize: '12px', fontWeight: 700, color: bad ? 'var(--red)' : 'var(--text)' }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SHAP drivers */}
              <div>
                <div style={{ fontSize: '8px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px', fontWeight: 600 }}>
                  Risk Drivers {caseShap ? '— SHAP' : '— run explain.py'}
                </div>
                {caseDrivers.length > 0 ? caseDrivers.map((d, di) => (
                  <div key={di} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
                    <div style={{ width: '18px', height: '18px', borderRadius: '3px', flexShrink: 0, background: d.neg ? '#DCFCE7' : '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: d.neg ? '#16A34A' : '#DC2626' }}>{d.neg ? '↓' : '↑'}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '10px', color: 'var(--text)', fontWeight: 500, marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</div>
                      <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px' }}>
                        <div style={{ height: '100%', width: `${(d.shap / caseMaxShap) * 100}%`, background: d.neg ? '#16A34A' : caseBorderColor, borderRadius: '2px' }} />
                      </div>
                    </div>
                  </div>
                )) : (
                  <span style={{ fontSize: '10px', color: 'var(--muted)', fontStyle: 'italic' }}>No SHAP data available</span>
                )}
              </div>

              <Link href={`/clients/${caseRow.clientID}`} style={{ fontSize: '10px', color: 'var(--blue)', textDecoration: 'none', fontWeight: 500, marginTop: 'auto' }}>
                Open full client profile →
              </Link>

            </div>

            {/* right — actions */}
            <div style={{ padding: '14px 14px', background: '#FAFBFD' }}>
              <div style={{ fontSize: '8px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '10px', fontWeight: 600 }}>Recommended Actions</div>
              <ActionChips mode="structured" actions={caseActions} clientId={caseRow.clientID} userRole={userRole} />
            </div>

          </div>
        </div>
      )}

      <SectionHeader title="Active Alerts" sub="real-time delinquency tracking" />
      <AlertsTable
        initialRows={alertRows}
        initialTotal={alertTotal}
        initialQ={aq}
        initialPage={alertPage}
        initialSev={alertSev}
        initialStage={alertStage}
      />

      </>} {/* end EWI Monitor */}

    </div>
  )
}

/* ─── page shell ──────────────────────────────────────────────────────────── */

export default async function Warnings({
  searchParams,
}: {
  searchParams: Promise<{
    tier?: string; window?: string; case?: string; view?: string
    aq?: string; ap?: string; asev?: string; ast?: string
    pq?: string; pp?: string; prisk?: string
    rq?: string; rp?: string; rpri?: string; ract?: string
  }>
}) {
  const {
    tier: filterTier = 'all', window: filterWindow = '90',
    case: caseParam = '0', view: activeView = 'monitor',
    aq = '', ap = '1', asev = '', ast = '',
    pq = '', pp = '1', prisk = '',
    rq = '', rp = '1', rpri = '', ract = '',
  } = await searchParams

  const caseIndex  = Math.max(0, parseInt(caseParam) || 0)
  const alertSev   = VALID_SEV.has(asev)      ? asev  : ''
  const alertStage = VALID_STAGE.has(ast)      ? ast   : ''
  const predRisk   = VALID_RISK.has(prisk)     ? prisk : ''
  const recPri     = VALID_PRIORITY.has(rpri)  ? rpri  : ''
  const recShowAll = ract === 'all'
  const alertPage  = Math.max(1, parseInt(ap, 10) || 1)
  const predPage   = Math.max(1, parseInt(pp, 10) || 1)
  const recPage    = Math.max(1, parseInt(rp, 10) || 1)

  let userRole: Role = 'analyst'
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (token) userRole = (await verifyToken(token)).role
  } catch { /* keep default */ }

  return (
    <>
      <Topbar title="Early Warnings" sub="EWI Monitor" />
      <Suspense fallback={<WarningSkeleton />}>
        <WarningsContent
          filterTier={filterTier} filterWindow={filterWindow}
          caseIndex={caseIndex} activeView={activeView}
          aq={aq.trim()} alertPage={alertPage} alertSev={alertSev} alertStage={alertStage}
          pq={pq.trim()} predPage={predPage} predRisk={predRisk}
          rq={rq.trim()} recPage={recPage} recPri={recPri} recShowAll={recShowAll}
          userRole={userRole}
        />
      </Suspense>
    </>
  )
}
