export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Topbar from '@/components/Topbar'
import ActionChips from '@/components/ActionChips'
import Link from 'next/link'
import {
  getActiveAlerts,
  getClientSignalsBatch,
  getAlertsPaginated,
  getClientActiveActions,
} from '@/lib/queries'
import type { ClientSignalSnapshot } from '@/lib/queries'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import type { Role } from '@/lib/users'
import { deriveTier, TIER_META, assess } from '@/lib/actionEngine'
import type { Tier } from '@/lib/actionEngine'
import { EWI } from '@/lib/config'
import { getLatestPredictionSnapshots, getPredictionsPaginated } from '@/lib/ewiPredictionsService'
import { getRecommendationsPaginated } from '@/lib/ewiRecommendationsService'
import { fmt } from '@/lib/formatters'
import type { PredictionRow } from '@/lib/predictions'
import SectionHeader from '@/components/SectionHeader'
import AlertsTable from './AlertsTable'
import CaseReviewDisclosure from './CaseReviewDisclosure'
import PredictionsTable from './PredictionsTable'
import RecommendationsTable from './RecommendationsTable'
import ReloadButton from './ReloadButton'
import LiveRefreshBanner from './LiveRefreshBanner'
import PaymentToast from './PaymentToast'

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
const VALID_TIER     = new Set(['all', ...TIER_ORDER])
const VALID_WINDOW   = new Set(['30', '60', '90'])
const VALID_VIEW     = new Set(['monitor', 'predictions', 'recommended'])

/* ─── skeleton ────────────────────────────────────────────────────────────── */

function WarningSkeleton() {
  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[80, 140, 150].map((w, i) => (
          <div key={i} style={{ height: 32, width: w, borderRadius: 4, background: 'rgba(255,255,255,0.06)', animation: `pulse 1.4s ease-in-out ${i * 0.08}s infinite` }} />
        ))}
      </div>
      <div style={{ height: 36, borderRadius: 6, background: 'rgba(255,255,255,0.06)', marginBottom: 10, animation: 'pulse 1.4s ease-in-out infinite' }} />
      <div style={{ height: 14, width: '28%', borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginBottom: 8, animation: 'pulse 1.4s ease-in-out 0.1s infinite' }} />
      <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: 52, background: 'rgba(13,27,42,0.12)', animation: 'pulse 1.4s ease-in-out 0.12s infinite' }} />
        <div style={{ height: 160, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.4s ease-in-out 0.15s infinite' }} />
      </div>
      <div style={{ height: 14, width: '22%', borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginBottom: 8, animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
      {[0, 1, 2].map(i => (
        <div key={i} style={{ height: 48, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 4, animation: `pulse 1.4s ease-in-out ${0.08 * i}s infinite` }} />
      ))}
    </>
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
  const [alertsResult, signalsResult, predictionsResult] = await Promise.allSettled([
    getActiveAlerts(),
    getClientSignalsBatch(),
    getLatestPredictionSnapshots(),
  ])
  const alerts = alertsResult.status === 'fulfilled' ? alertsResult.value : []
  const signalsMap: Record<string, ClientSignalSnapshot> =
    signalsResult.status === 'fulfilled' ? signalsResult.value : {}
  const alertsUnavailable = alertsResult.status === 'rejected'
  const signalsUnavailable = signalsResult.status === 'rejected'
  const predictionSnapshots = predictionsResult.status === 'fulfilled' ? predictionsResult.value : []
  const predictionsUnavailable = predictionsResult.status === 'rejected'
  const allPredictions = predictionSnapshots.map(s => s.prediction)
  const allShap = Object.fromEntries(
    predictionSnapshots
      .filter(s => s.shap)
      .map(s => [s.prediction.clientID, s.shap!])
  )

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

  type AnnotatedRow = PredictionRow & {
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
      tier: deriveTier(p.risk_label, p[pdField]),
      exposure: p.totalExposure ?? p.exposure ?? exposureMap[p.clientID] ?? 0,
    }))
    .sort((a, b) => b.windowPD - a.windowPD)

  const visible = filterTier === 'all' ? annotated : annotated.filter(p => p.tier === filterTier)



  // ── Case Review ──
  const safeIndex  = Math.min(caseIndex, visible.length - 1)
  const caseRow    = visible.length > 0 ? visible[safeIndex] : null
  const caseTm     = caseRow ? TIER_META[caseRow.tier] : null
  const casePdPct  = caseRow ? Math.round(caseRow.windowPD * 100) : 0
  const caseShap   = caseRow ? allShap[caseRow.clientID] : null
  const caseSig    = caseRow ? signalsMap[caseRow.clientID] : null
  const caseActiveActions = caseRow ? await getClientActiveActions(caseRow.clientID) : []
  const caseDrivers = caseShap ? [
    caseShap.top_factor_1 ? { label: driverBullet(caseShap.top_factor_1, caseShap.shap_1), shap: Math.abs(caseShap.shap_1), neg: caseShap.shap_1 < 0 } : null,
    caseShap.top_factor_2 ? { label: driverBullet(caseShap.top_factor_2, caseShap.shap_2), shap: Math.abs(caseShap.shap_2), neg: caseShap.shap_2 < 0 } : null,
  ].filter(Boolean) as { label: string; shap: number; neg: boolean }[] : []
  const caseMaxShap   = Math.max(...caseDrivers.map(d => d.shap), 0.01)
  const caseActions   = caseRow && !signalsUnavailable ? assess({
    pdScore: caseRow.windowPD, riskLabel: caseRow.risk_label,
    ifrsStage: caseSig?.ifrs_stage ?? 1, currentDPD: caseSig?.current_dpd ?? 0,
    maxDPD12m: caseSig?.max_dpd_12m ?? 0, missedPayments: caseSig?.missed_payments ?? 0,
    totalPayments: caseSig?.total_payments ?? 12, dtiRatio: 0,
    cureRate: caseSig?.repayment_rate ?? 50, salaryInflow: caseSig?.salary_inflow ?? 'Normal',
    overdraft: caseSig?.overdraft ?? 'None', cardUsage: caseSig?.card_usage ?? 'Normal',
    consecLates: caseSig?.consec_lates ?? '0 months', productType: caseSig?.product_type ?? 'Consumer',
    stageMigrationProb: caseRow.stage_migration_prob, dpdEscalationProb: caseRow.dpd_escalation_prob,
    exposure: caseRow.exposure, activeActions: caseActiveActions.map(a => a.action), topShapFactor: caseShap?.top_factor_1 ?? '',
  }).actions : []
  const caseSignalItems = caseRow ? [
    { label: 'Exposure',    value: caseRow.exposure > 0 ? fmt(caseRow.exposure) : 'N/A', bad: false },
    { label: 'Current DPD', value: caseSig?.current_dpd != null ? `${caseSig.current_dpd}d` : 'N/A', bad: (caseSig?.current_dpd ?? 0) > 30 },
    { label: 'Max DPD 12M', value: caseSig?.max_dpd_12m != null ? `${caseSig.max_dpd_12m}d` : 'N/A', bad: (caseSig?.max_dpd_12m ?? 0) > 60 },
    { label: 'Missed pmts', value: caseSig?.missed_payments != null ? String(caseSig.missed_payments) : 'N/A', bad: (caseSig?.missed_payments ?? 0) >= 3 },
    { label: 'Salary',      value: caseSig?.salary_inflow ?? 'N/A', bad: caseSig?.salary_inflow === 'Stopped' },
    { label: 'Repayment',   value: caseSig?.repayment_rate != null ? `${caseSig.repayment_rate}%` : 'N/A', bad: (caseSig?.repayment_rate ?? 100) < 60 },
  ] : []
  const caseSignalSummary = caseSignalItems.map(item => `${item.label}: ${item.value}`).join(' · ')
  const casePrevHref  = safeIndex > 0 ? `?view=monitor&tier=${filterTier}&window=${filterWindow}&case=${safeIndex - 1}#case-review` : null
  const caseNextHref  = caseRow && safeIndex < visible.length - 1 ? `?view=monitor&tier=${filterTier}&window=${filterWindow}&case=${safeIndex + 1}#case-review` : null
  const caseBorderColor  = caseRow?.tier === 'default-imminent' ? '#DC2626' : caseRow?.tier === 'deteriorating' ? '#D97706' : '#1D4ED8'
  const caseAccentBorder = caseRow?.tier === 'default-imminent' ? '#FECACA' : caseRow?.tier === 'deteriorating' ? '#FCD34D' : '#BFDBFE'
  const caseProgressPct  = visible.length > 1 ? (safeIndex / (visible.length - 1)) * 100 : 100
  const shouldOpenCaseReview = alertsUnavailable || alertTotal === 0


  return (
    <>

      {/* ── View tab bar ──────────────────────────────────────────────────── */}
      <div className="tabs" style={{ marginBottom: '10px' }}>
        {([
          { id: 'monitor',     label: 'EWI Monitor' },
          { id: 'predictions', label: 'Predicted Deterioration', count: predCount || undefined },
          { id: 'recommended', label: 'Recommended Actions',     count: recCount  || undefined },
        ] as { id: string; label: string; count?: number }[]).map(t => (
          <a
            key={t.id}
            href={(() => {
              const p = new URLSearchParams()
              p.set('view', t.id)
              p.set('tier', filterTier)
              p.set('window', filterWindow)
              if (aq)         { p.set('aq',   aq) }
              if (alertPage > 1)  { p.set('ap',   String(alertPage)) }
              if (alertSev)   { p.set('asev', alertSev) }
              if (alertStage) { p.set('ast',  alertStage) }
              if (pq)         { p.set('pq',   pq) }
              if (predPage > 1)   { p.set('pp',   String(predPage)) }
              if (predRisk)   { p.set('prisk',predRisk) }
              if (rq)         { p.set('rq',   rq) }
              if (recPage > 1)    { p.set('rp',   String(recPage)) }
              if (recPri)     { p.set('rpri', recPri) }
              if (recShowAll) { p.set('ract', 'all') }
              return `?${p.toString()}`
            })()}
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

      <SectionHeader title="Active Alerts" sub="real-time delinquency tracking" />
      <div className="panel" style={{ padding: '10px 14px', marginBottom: '10px', background: 'linear-gradient(180deg, #FBFCFE 0%, #F4F7FB 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
              Active Queue
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
              {alertsUnavailable ? 'Live alerts are temporarily unavailable.' : `${alertTotal.toLocaleString()} clients currently require active follow-up.`}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.5 }}>
            Client details stay visible while you scroll. Click any row to open the action drawer.
          </div>
        </div>
      </div>
      {alertsUnavailable ? (
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
          Active alerts are unavailable because the live database connection failed.
        </div>
      ) : (
        <AlertsTable
          initialRows={alertRows}
          initialTotal={alertTotal}
          initialQ={aq}
          initialPage={alertPage}
          initialSev={alertSev}
          initialStage={alertStage}
        />
      )}

      <CaseReviewDisclosure
        autoOpen={shouldOpenCaseReview}
        summary={(
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
              Case Review
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
              {visible.length} clients in review queue · {filterWindow}d window
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
            {shouldOpenCaseReview ? 'Case review is expanded.' : 'Expand only when you need a detailed review.'}
          </div>
        </div>
        )}
      >
      {/* Filter bar — kept with Case Review controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <span style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tier:</span>
        {(['all', ...TIER_ORDER] as const).map(t => {
          const isAll = t === 'all'
          const active = filterTier === t
          const tm2 = !isAll ? TIER_META[t] : null
          return (
            <a key={t} href={`?view=monitor&tier=${t}&window=${filterWindow}#case-review-top`} style={{
              fontSize: '10px', padding: '4px 10px', borderRadius: '4px', textDecoration: 'none',
              border: `1px solid ${active ? (tm2 ? tm2.border : 'var(--navy)') : 'var(--border)'}`,
              background: active ? (tm2 ? tm2.color : 'var(--navy)') : 'rgba(255,255,255,0.05)',
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
              <a key={w} href={`?view=monitor&tier=${filterTier}&window=${w}#case-review-top`} style={{
                fontSize: '10px', padding: '4px 10px', borderRadius: '4px', textDecoration: 'none',
                border: `1px solid ${active ? 'var(--navy)' : 'var(--border)'}`,
                background: active ? 'var(--navy)' : 'rgba(255,255,255,0.05)',
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

      {signalsUnavailable && (
        <div className="panel" style={{ padding: '12px 14px', marginBottom: '10px', color: 'var(--muted)', fontSize: '11px', lineHeight: 1.5 }}>
          Live client signals are temporarily unavailable. Case Review is still available using the latest published prediction snapshot from SQL.
        </div>
      )}

      {allPredictions.length === 0 ? (
        <div className="panel" style={{ padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
            {predictionsUnavailable ? 'Predictions Unavailable' : 'No Published Predictions'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
            {predictionsUnavailable
              ? 'The application could not read the latest prediction snapshot from the database.'
              : 'Case Review needs published prediction rows in the EWIPredictions table.'}
            <br />
            Publish ML output into SQL or use the <strong>Predicted Deterioration</strong> tab to generate a heuristic fallback from live portfolio data.
          </div>
          <ReloadButton />
        </div>
      ) : visible.length === 0 ? (
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--green)', fontSize: '12px' }}>
          No clients above threshold in selected window
        </div>
      ) : caseRow && (
        <div id="case-review" style={{ borderRadius: '6px', border: `1px solid ${caseAccentBorder}`, overflowX: 'auto', overflowY: 'auto', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>

          {/* ── single header row: nav + identity + PD ── */}
          <div style={{ background: 'var(--navy)', padding: '10px 16px', display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', rowGap: '8px', gap: '0', minHeight: 'unset' }}>

            {/* prev */}
            <div style={{ display: 'flex', alignItems: 'center', paddingRight: '12px', borderRight: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
              {casePrevHref
                ? <a href={casePrevHref} style={{ fontSize: '10px', padding: '5px 10px', borderRadius: '3px', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>← Prev</a>
                : <span style={{ fontSize: '10px', padding: '5px 10px', color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap' }}>← Prev</span>
              }
            </div>

            {/* progress + case label */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 14px', minWidth: '120px', flexShrink: 0 }}>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '5px' }}>
                Case {safeIndex + 1} / {visible.length}
              </span>
              <div style={{ height: '3px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px', width: '90px' }}>
                <div style={{ height: '100%', width: `${caseProgressPct}%`, background: caseProgressPct === 100 ? '#4ADE80' : caseBorderColor, borderRadius: '2px' }} />
              </div>
            </div>

            {/* rank bubble + client id + badges */}
            <div style={{ flex: 1, minWidth: '220px', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 8px', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', padding: '0 14px', borderLeft: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
              <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1px' }}>PD Score</div>
              <div className="mono" style={{ fontSize: '28px', fontWeight: 900, color: caseBorderColor, lineHeight: 1 }}>{casePdPct}<span style={{ fontSize: '13px' }}>%</span></div>
              <div style={{ width: '70px', height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '4px' }}>
                <div style={{ height: '100%', width: `${casePdPct}%`, background: caseBorderColor, borderRadius: '2px' }} />
              </div>
            </div>

            {/* next */}
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', borderLeft: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
              {caseNextHref
                ? <a href={caseNextHref} style={{ fontSize: '10px', padding: '5px 10px', borderRadius: '3px', background: caseBorderColor, color: 'white', textDecoration: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}>Next →</a>
                : <span style={{ fontSize: '10px', padding: '5px 10px', borderRadius: '3px', background: '#16A34A', color: 'white', fontWeight: 700, whiteSpace: 'nowrap' }}>Done ✓</span>
              }
            </div>

          </div>

          {/* ── body: two columns ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', background: 'var(--card)' }}>

            {/* left — signals + drivers */}
            <div style={{ flex: '999 1 420px', padding: '14px 16px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* signals 3×2 */}
              <div>
                <div style={{ fontSize: '8px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px', fontWeight: 600 }}>Client Signals</div>
                <div style={{ marginBottom: '8px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', fontSize: '10px', color: 'var(--text)', lineHeight: 1.5 }}>
                  {caseSignalSummary}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px' }}>
                  {([
                    { label: 'Exposure',    value: caseRow.exposure > 0 ? fmt(caseRow.exposure) : '—', bad: false },
                    { label: 'Current DPD', value: caseSig?.current_dpd != null ? `${caseSig.current_dpd}d` : '—', bad: (caseSig?.current_dpd ?? 0) > 30 },
                    { label: 'Max DPD 12M', value: caseSig?.max_dpd_12m != null ? `${caseSig.max_dpd_12m}d` : '—', bad: (caseSig?.max_dpd_12m ?? 0) > 60 },
                    { label: 'Missed pmts', value: caseSig?.missed_payments != null ? String(caseSig.missed_payments) : '—', bad: (caseSig?.missed_payments ?? 0) >= 3 },
                    { label: 'Salary',      value: caseSig?.salary_inflow ?? '—', bad: caseSig?.salary_inflow === 'Stopped' },
                    { label: 'Repayment',   value: caseSig?.repayment_rate != null ? `${caseSig.repayment_rate}%` : '—', bad: (caseSig?.repayment_rate ?? 100) < 60 },
                  ]).map(({ label, value, bad }) => (
                    <div key={label} style={{ padding: '6px 8px', background: bad ? 'rgba(127,29,29,0.25)' : 'rgba(255,255,255,0.04)', border: `1px solid ${bad ? '#FECACA' : 'var(--border)'}`, borderRadius: '4px' }}>
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
                    <div style={{ width: '18px', height: '18px', borderRadius: '3px', flexShrink: 0, background: d.neg ? 'rgba(20,83,45,0.35)' : 'rgba(127,29,29,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--border)', fontSize: '10px', color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                    No SHAP driver data is available for this case yet.
                  </div>
                )}
              </div>

              <Link href={`/clients/${caseRow.clientID}`} style={{ fontSize: '10px', color: 'var(--blue)', textDecoration: 'none', fontWeight: 500, marginTop: 'auto' }}>
                Open full client profile →
              </Link>

            </div>

            {/* right — actions */}
            <div style={{ flex: '1 1 320px', padding: '14px 14px', minWidth: 280, background: 'rgba(255,255,255,0.03)', borderLeft: '1px solid var(--border)' }}>
              <div style={{ fontSize: '8px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '10px', fontWeight: 600 }}>Recommended Actions</div>
              {signalsUnavailable ? (
                <div style={{ padding: '9px 10px', borderRadius: '7px', background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--border)', fontSize: '10px', color: 'var(--muted)', lineHeight: 1.5 }}>
                  Recommended actions are hidden until live client signals are available again.
                </div>
              ) : (
                <ActionChips mode="structured" actions={caseActions} clientId={caseRow.clientID} userRole={userRole} />
              )}
            </div>

          </div>
        </div>
      )}

      </CaseReviewDisclosure>

      </>} {/* end EWI Monitor */}

    </>
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
  const safeTier   = VALID_TIER.has(filterTier)   ? filterTier   : 'all'
  const safeWindow = VALID_WINDOW.has(filterWindow) ? filterWindow : '90'
  const safeView   = VALID_VIEW.has(activeView)   ? activeView   : 'monitor'
  const alertPage  = Math.max(1, parseInt(ap, 10) || 1)
  const predPage   = Math.max(1, parseInt(pp, 10) || 1)
  const recPage    = Math.max(1, parseInt(rp, 10) || 1)

  let userRole: Role = 'risk_underwriter'
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (token) userRole = (await verifyToken(token)).role
  } catch { /* keep default */ }

  return (
    <>
      <Topbar title="Early Warnings" sub="EWI Monitor" />
      <LiveRefreshBanner />
      <PaymentToast />
      <div className="content">
        <Suspense fallback={<WarningSkeleton />}>
          <WarningsContent
            filterTier={safeTier} filterWindow={safeWindow}
            caseIndex={caseIndex} activeView={safeView}
            aq={aq.trim()} alertPage={alertPage} alertSev={alertSev} alertStage={alertStage}
            pq={pq.trim()} predPage={predPage} predRisk={predRisk}
            rq={rq.trim()} recPage={recPage} recPri={recPri} recShowAll={recShowAll}
            userRole={userRole}
          />
        </Suspense>
      </div>
    </>
  )
}
