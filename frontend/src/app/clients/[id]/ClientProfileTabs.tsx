'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import type { ClientProfile, DPDHistory, ClientEWI, ClientProduct, CaseAction } from '@/lib/queries'
import type { PredictionRow, ShapRow, RiskFlagRow } from '@/lib/predictions'
import type { PlanRow } from '@/lib/restructuringService'
import type { CommitteeRow } from '@/lib/committeeService'
import type { RecoveryCaseRow } from '@/lib/recoveryService'
import MessagingPanel from './MessagingPanel'

/* ─── types ───────────────────────────────────────────────────────────────── */

interface AIInsights {
  risk_narrative: { summary: string; risk_level: string; key_concern: string }
  deterioration_prediction: { deterioration_risk: string; risk_score: number; probability_statement: string; key_signals: string[] }
  recommended_actions: { priority: string; primary_action: string; supporting_actions: string[]; escalate_to_committee: boolean }
  recovery_recommendation: { recovery_probability: string; recommended_strategy: string; strategy_detail: string; estimated_recovery_rate: string }
  transparency_letter: { subject: string; salutation: string; body: string; closing: string }
  generated_at: string
}

interface Props {
  profile: ClientProfile
  dpdHistory: DPDHistory[]
  ewi: ClientEWI | null
  activeActions: { action: string; createdAt: string }[]
  products: ClientProduct[]
  caseHistory: CaseAction[]
  prediction: PredictionRow | null
  shap: ShapRow | null
  riskFlag: RiskFlagRow | null
  userRole: string
  clientId: string
  restructuringPlan: PlanRow | null
  committeeLog: CommitteeRow[]
  recoveryCase: RecoveryCaseRow | null
  recoveryHistory: RecoveryCaseRow[]
  isWrittenOff: boolean
  isResolved: boolean
  scheduledSalary?: { id: string; personalId: string; accountNo: string | null; amount: number; description: string; scheduledDate: string } | null
}

interface RecoveryMutationResponse {
  ok?: boolean
  caseId?: string
  case?: RecoveryCaseRow
  mode?: 'created' | 'updated'
  error?: string
}

const RECOVERY_STAGE_LABELS: Record<RecoveryCaseRow['stage'], string> = {
  DebtCollection: 'Debt Collection',
  CollateralEnforcement: 'Collateral Enforcement',
  LegalProceedings: 'Legal Proceedings',
  DebtSale: 'Debt Sale',
  WriteOff: 'Write-Off',
}

function sortRecoveryCases(cases: RecoveryCaseRow[]): RecoveryCaseRow[] {
  return [...cases].sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
}

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function fmtEur(n: number) {
  if (Math.abs(n) >= 1_000_000) return '€' + (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return '€' + (n / 1_000).toFixed(0) + 'K'
  return '€' + n.toLocaleString()
}

function pdColor(score: number): string {
  if (score >= 0.66) return 'var(--red)'
  if (score >= 0.21) return 'var(--amber)'
  return 'var(--green)'
}

function stageColor(stage: string): string {
  if (stage === 'Stage 1') return 'var(--green)'
  if (stage === 'Stage 2') return 'var(--amber)'
  return 'var(--red)'
}

function stageBadge(stage: string): string {
  if (stage === 'Stage 1') return 'bg'
  if (stage === 'Stage 2') return 'ba'
  return 'br'
}

function dpdColor(d: number): string {
  if (d >= 90) return 'var(--red)'
  if (d >= 30) return 'var(--amber)'
  return 'var(--green)'
}

function riskLevelColor(level: string): string {
  const l = level?.toLowerCase() ?? ''
  if (l === 'critical') return '#7F1D1D'
  if (l === 'high') return 'var(--red)'
  if (l === 'medium') return 'var(--amber)'
  return 'var(--green)'
}

function riskLevelBg(level: string): string {
  const l = level?.toLowerCase() ?? ''
  if (l === 'critical') return '#3B0A0A'
  if (l === 'high') return '#FEE2E2'
  if (l === 'medium') return '#FEF3C7'
  return '#DCFCE7'
}

function priorityColor(p: string): string {
  const pl = p?.toLowerCase() ?? ''
  if (pl === 'urgent') return 'var(--red)'
  if (pl === 'high') return '#EA580C'
  if (pl === 'medium') return 'var(--amber)'
  return 'var(--muted)'
}

function fmtDate(s: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysAgo(s: string): number {
  if (!s) return 0
  return Math.floor((Date.now() - new Date(s).getTime()) / 86_400_000)
}

/* ─── main component ──────────────────────────────────────────────────────── */

export default function ClientProfileTabs({
  profile, dpdHistory, ewi, activeActions, products, caseHistory,
  prediction, shap, riskFlag, userRole, clientId, restructuringPlan: restructuringPlanProp,
  committeeLog: committeeLogProp,
  recoveryCase: recoveryCaseProp,
  recoveryHistory: recoveryHistoryProp,
  isWrittenOff,
  isResolved: isResolvedProp,
  scheduledSalary,
}: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'ewi' | 'alerts' | 'ai' | 'log' | 'whatif'>('overview')
  const [insights, setInsights] = useState<AIInsights | null>(null)
  const [letterOpen, setLetterOpen] = useState(false)
  const [quickActionDone, setQuickActionDone] = useState<Set<string>>(new Set())
  const [quickActionLoading, setQuickActionLoading] = useState('')
  const [engagementLoading, setEngagementLoading] = useState('')
  const [engagementDone, setEngagementDone] = useState<Set<string>>(new Set())
  const [ackedAlerts, setAckedAlerts] = useState<Set<number>>(new Set())

  // Credit committee state
  const [committeeLog, setCommitteeLog]             = useState<CommitteeRow[]>(committeeLogProp)
  const [committeeSubmitting, setCommitteeSubmitting] = useState(false)
  const [committeeNotes, setCommitteeNotes]         = useState('')
  const [committeeModalOpen, setCommitteeModalOpen] = useState(false)

  // Recovery state
  const [activeRecovery, setActiveRecovery]         = useState<RecoveryCaseRow | null>(recoveryCaseProp)
  const [recoveryHistory, setRecoveryHistory]       = useState<RecoveryCaseRow[]>(sortRecoveryCases(recoveryHistoryProp))
  const [recoveryOpen, setRecoveryOpen]             = useState(false)
  const [recoverySubmitting, setRecoverySubmitting] = useState(false)
  const [rcStage, setRcStage]                       = useState('DebtCollection')
  const [rcAssignedTo, setRcAssignedTo]             = useState('')
  const [rcNotes, setRcNotes]                       = useState('')

  // Restructuring plan state
  const [activePlan, setActivePlan]               = useState<PlanRow | null>(restructuringPlanProp)
  const [restructuringOpen, setRestructuringOpen] = useState(false)
  const [restructuringSubmitting, setRestructuringSubmitting] = useState(false)
  const [rPlanType,        setRPlanType]        = useState('LoanExtension')
  const [rCreditId,        setRCreditId]        = useState('')
  const [rMaturityDate,    setRMaturityDate]    = useState('')
  const [rHolidayMonths,   setRHolidayMonths]   = useState('')
  const [rNewRate,         setRNewRate]         = useState('')
  const [rForgivenAmount,  setRForgivenAmount]  = useState('')
  const [rNotes,           setRNotes]           = useState('')

  // Schedule engagement modal
  const [scheduleModalType, setScheduleModalType] = useState<'call' | 'meeting' | null>(null)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleNotes, setScheduleNotes] = useState('')
  const [schedulingInFlight, setSchedulingInFlight] = useState(false)

  // Freeze limit modal
  const [freezeModalOpen, setFreezeModalOpen] = useState(false)
  const [freezeReason, setFreezeReason] = useState('')
  const [freezeLoading, setFreezeLoading] = useState(false)
  const [unfreezeModalOpen, setUnfreezeModalOpen] = useState(false)
  const [unfreezeReason, setUnfreezeReason] = useState('')
  const [unfreezeLoading, setUnfreezeLoading] = useState(false)
  const [isFrozen, setIsFrozen] = useState(false)

  // Resolve
  const [isResolved,       setIsResolved]       = useState(isResolvedProp)
  const [resolveModalOpen, setResolveModalOpen] = useState(false)
  const [resolveNotes,     setResolveNotes]     = useState('')
  const [resolveLoading,   setResolveLoading]   = useState(false)

  // What-If scenario
  const [whatIfDpd,   setWhatIfDpd]   = useState(profile.current_due_days ?? 0)
  const [whatIfStage, setWhatIfStage] = useState(profile.stage ?? 1)

  // Document request modal
  const [docModalOpen, setDocModalOpen] = useState(false)
  const [docSelections, setDocSelections] = useState<Record<string, boolean>>({})
  const [docDueDate, setDocDueDate] = useState('')
  const [docNotes, setDocNotes] = useState('')
  const [docLoading, setDocLoading] = useState(false)
  const [docRequestDone, setDocRequestDone] = useState(false)

  // Salary sweep state
  const [sweepLoading, setSweepLoading] = useState(false)
  const [sweepResult, setSweepResult]   = useState<{ ok: boolean; sweepAmount?: number; reason?: string } | null>(null)

  // Notify modal state
  const [notifyModal, setNotifyModal] = useState<'payment_reminder' | 'overdue_notice' | 'legal_notice' | 'custom' | null>(null)
  const [notifyAmount, setNotifyAmount] = useState('')
  const [notifyDaysOverdue, setNotifyDaysOverdue] = useState('')
  const [notifyDueDate, setNotifyDueDate] = useState('')
  const [notifyCustomBody, setNotifyCustomBody] = useState('')
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [notifyDone, setNotifyDone] = useState<Set<string>>(new Set())


  const [watchlistState, setWatchlistState] = useState<'idle' | 'loading' | 'done'>(() =>
    activeActions.some(a => a.action === 'Add to Watchlist' || a.action === 'Add to watchlist') ? 'done' : 'idle'
  )

  async function addToWatchlist() {
    setWatchlistState('loading')
    try {
      await fetch(`/api/actions/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, action: 'Add to Watchlist', notes: 'Manually added from client profile' }),
      })
      setWatchlistState('done')
      router.push('/watchlist')
    } catch {
      setWatchlistState('idle')
    }
  }

  // Avoid long-lived SSE subscriptions in the browser; refresh periodically instead.
  const router = useRouter()
  useEffect(() => {
    const refreshProfile = () => {
      if (document.visibilityState === 'visible') {
        router.refresh()
      }
    }

    const id = window.setInterval(refreshProfile, 60_000)
    document.addEventListener('visibilitychange', refreshProfile)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', refreshProfile)
    }
  }, [router])

  useEffect(() => {
    setActiveRecovery(recoveryCaseProp)
  }, [recoveryCaseProp])

  useEffect(() => {
    setRecoveryHistory(sortRecoveryCases(recoveryHistoryProp))
  }, [recoveryHistoryProp])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/freeze`, { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled && !data.error) setIsFrozen(Boolean(data.freeze))
      } catch { /* silent */ }
    })()

    return () => { cancelled = true }
  }, [clientId])

  /* ── derived values ─────────────────────────────────────────────────── */
  const creditUtil = profile.approved_amount > 0
    ? Math.round((profile.on_balance / profile.approved_amount) * 100)
    : 0
  const pd = prediction?.pd_90d ?? null
  const alertCount = activeActions.length
  const maxDpd = dpdHistory.length > 0 ? Math.max(...dpdHistory.map(d => d.due_days), 1) : 1
  const initials = profile.full_name
    ? profile.full_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')
    : profile.personal_id.slice(0, 2).toUpperCase()
  const openRecoveryCount = recoveryHistory.filter(c => c.status === 'Open').length
  const hasDuplicateOpenRecovery = openRecoveryCount > 1

  /* ── derived alerts (products with overdue) ─────────────────────────── */
  const derivedAlerts = products
    .filter(p => p.due_days > 0)
    .map((p, i) => ({
      id: i,
      trigger: p.due_days >= 90
        ? 'Severe Delinquency'
        : p.due_days >= 30
          ? 'Delinquency Alert'
          : 'Early Warning',
      credit_id: p.credit_account,
      product_type: p.product_type,
      due_days: p.due_days,
      days_open: daysAgo(new Date(Date.now() - p.due_days * 86_400_000).toISOString()),
      priority: p.due_days >= 90 ? 'Urgent' : p.due_days >= 30 ? 'High' : 'Medium',
      recommended_action: p.due_days >= 90
        ? 'Escalate to collections — account is severely past due'
        : p.due_days >= 30
          ? 'Contact client and negotiate restructuring plan'
          : 'Monitor closely and initiate outreach call',
      stage: p.stage,
    }))

  /* ── EWI signals table ───────────────────────────────────────────────── */
  const ewiSignals: { signal: string; status: string; severity: string; value: string }[] = []
  if (ewi) {
    const isStopped = ewi.salary_inflow?.toLowerCase().includes('stop') || ewi.salary_inflow === '0'
    ewiSignals.push({ signal: 'Salary Inflow', status: ewi.salary_inflow || 'Normal', severity: isStopped ? 'High' : 'Low', value: ewi.salary_inflow || 'Normal' })
    const isODAlert = ewi.overdraft?.toLowerCase().includes('depend') || ewi.overdraft?.toLowerCase().includes('high')
    ewiSignals.push({ signal: 'Overdraft Usage', status: ewi.overdraft || 'Normal', severity: isODAlert ? 'Medium' : 'Low', value: ewi.overdraft || 'Normal' })
    const isCardAlert = ewi.card_usage?.toLowerCase().includes('high') || ewi.card_usage?.toLowerCase().includes('limit')
    ewiSignals.push({ signal: 'Card Utilisation', status: ewi.card_usage || 'Normal', severity: isCardAlert ? 'Medium' : 'Low', value: ewi.card_usage || 'Normal' })
    const latesNum = parseInt(ewi.consec_lates ?? '0') || 0
    ewiSignals.push({ signal: 'Consecutive Lates', status: ewi.consec_lates || '0', severity: latesNum >= 3 ? 'High' : latesNum >= 1 ? 'Medium' : 'Low', value: ewi.consec_lates || '0' })
  }
  if (riskFlag) {
    if (riskFlag.flag_zscore_anomaly) ewiSignals.push({ signal: 'Z-Score Anomaly', status: 'Triggered', severity: 'High', value: 'Abnormal pattern detected' })
    if (riskFlag.flag_score_deterioration) ewiSignals.push({ signal: 'Score Deterioration', status: 'Triggered', severity: 'High', value: 'Rapid PD increase' })
    if (riskFlag.flag_exposure_spike) ewiSignals.push({ signal: 'Exposure Spike', status: 'Triggered', severity: 'Medium', value: 'Balance surge detected' })
    if (riskFlag.flag_card_acceleration) ewiSignals.push({ signal: 'Card Acceleration', status: 'Triggered', severity: 'Medium', value: 'Spend acceleration' })
  }

  /* ── actions ─────────────────────────────────────────────────────────── */

  // Keep AI insights on plain JSON responses to avoid runtime stream issues.
  const {
    mutate:    generateInsights,
    isPending: generating,
    error:     insightsMutationError,
  } = useMutation<AIInsights, Error>({
    mutationKey: ['insights', clientId],
    mutationFn:  async () => {
      const res = await fetch(`/api/clients/${clientId}/insights`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            full_name:        profile.full_name,
            personal_id:      profile.personal_id,
            age:              profile.age,
            region:           profile.region,
            employment_type:  profile.employment_type,
            stage:            profile.stage,
            risk_score:       profile.risk_score,
            total_exposure:   profile.total_exposure,
            on_balance:       profile.on_balance,
            current_due_days: profile.current_due_days,
            max_due_days_12m: profile.max_due_days_12m,
            missed_payments:  profile.missed_payments,
            total_payments:   profile.total_payments,
            repayment_rate_pct: profile.repayment_rate_pct,
            dti_ratio:        profile.dti_ratio,
            tenure_years:     profile.tenure_years,
          },
          prediction: prediction ? {
            pd_30d:               prediction.pd_30d,
            pd_60d:               prediction.pd_60d,
            pd_90d:               prediction.pd_90d,
            risk_label:           prediction.risk_label,
            stage_migration_prob: prediction.stage_migration_prob,
            dpd_escalation_prob:  prediction.dpd_escalation_prob,
            recommended_action:   prediction.recommended_action,
          } : null,
        }),
      })

      const payload = await res.json().catch(() => null) as { error?: string; insights?: AIInsights } | null
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to generate AI insights')
      if (!payload?.insights) throw new Error('Insights endpoint returned no data')
      return payload.insights
    },
    onSuccess: (data) => setInsights(data),
  })

  const insightsError: string | null = insightsMutationError?.message ?? null

  const logQuickAction = useCallback(async (action: string) => {
    if (action === 'Freeze Limit') {
      if (isFrozen) setUnfreezeModalOpen(true)
      else setFreezeModalOpen(true)
      return
    }
    if (action === 'Unfreeze Limit') {
      setUnfreezeModalOpen(true)
      return
    }
    if (action === 'Request Documents') {
      setDocModalOpen(true)
      return
    }
    setQuickActionLoading(action)
    try {
      await fetch(`/api/clients/${clientId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      setQuickActionDone(prev => new Set([...prev, action]))
    } catch { /* silent */ } finally {
      setQuickActionLoading('')
    }
  }, [clientId, isFrozen])

  const openScheduleModal = useCallback((type: 'call' | 'meeting') => {
    setScheduleModalType(type)
    const d = new Date()
    d.setDate(d.getDate() + 1)
    setScheduleDate(d.toISOString().slice(0, 16))
    setScheduleNotes('')
  }, [])

  const confirmScheduleEngagement = useCallback(async () => {
    if (!scheduleModalType) return
    setSchedulingInFlight(true)
    const key = scheduleModalType === 'call' ? 'Schedule Call' : 'Schedule Meeting'
    try {
      await fetch(`/api/clients/${clientId}/engagements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: scheduleModalType,
          scheduledAt: scheduleDate ? new Date(scheduleDate).toISOString() : new Date().toISOString(),
          notes: scheduleNotes || null,
        }),
      })
      setEngagementDone(prev => new Set([...prev, key]))
      setScheduleModalType(null)
    } catch { /* silent */ } finally {
      setSchedulingInFlight(false)
    }
  }, [clientId, scheduleModalType, scheduleDate, scheduleNotes])

  const confirmFreezeLimit = useCallback(async () => {
    setFreezeLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/freeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: freezeReason || null }),
      })
      const data = await res.json()
      if (!data.error) {
        setIsFrozen(true)
        setQuickActionDone(prev => {
          const next = new Set(prev)
          next.add('Freeze Limit')
          next.delete('Unfreeze Limit')
          return next
        })
        setFreezeModalOpen(false)
        setFreezeReason('')
      }
    } catch { /* silent */ } finally {
      setFreezeLoading(false)
    }
  }, [clientId, freezeReason])

  const confirmUnfreezeLimit = useCallback(async () => {
    setUnfreezeLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/freeze`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: unfreezeReason || null }),
      })
      const data = await res.json()
      if (!data.error) {
        setIsFrozen(false)
        setQuickActionDone(prev => {
          const next = new Set(prev)
          next.delete('Freeze Limit')
          next.add('Unfreeze Limit')
          return next
        })
        setUnfreezeModalOpen(false)
        setUnfreezeReason('')
      }
    } catch { /* silent */ } finally {
      setUnfreezeLoading(false)
    }
  }, [clientId, unfreezeReason])

  const submitDocumentRequest = useCallback(async () => {
    const selected = Object.entries(docSelections).filter(([, v]) => v).map(([k]) => k)
    if (!selected.length) return
    setDocLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/document-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedDocs: selected,
          dueDate: docDueDate || null,
          notes: docNotes || null,
        }),
      })
      const data = await res.json()
      if (!data.error) {
        setDocRequestDone(true)
        setQuickActionDone(prev => new Set([...prev, 'Request Documents']))
        setDocModalOpen(false)
        setDocSelections({})
        setDocDueDate('')
        setDocNotes('')
      }
    } catch { /* silent */ } finally {
      setDocLoading(false)
    }
  }, [clientId, docSelections, docDueDate, docNotes])

  const handleResolve = useCallback(async () => {
    setResolveLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: resolveNotes || null }),
      })
      if (!res.ok) throw new Error(((await res.json()) as { error: string }).error)
      setIsResolved(true)
      setResolveModalOpen(false)
      setResolveNotes('')
    } catch (err) { alert((err as Error).message) }
    finally { setResolveLoading(false) }
  }, [clientId, resolveNotes])

  const handleUnresolve = useCallback(async () => {
    setResolveLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/resolve`, { method: 'DELETE' })
      if (!res.ok) throw new Error(((await res.json()) as { error: string }).error)
      setIsResolved(false)
    } catch (err) { alert((err as Error).message) }
    finally { setResolveLoading(false) }
  }, [clientId])

  const runSalarySweep = useCallback(async () => {
    setSweepLoading(true)
    setSweepResult(null)
    try {
      const res  = await fetch(`/api/clients/${clientId}/salary-sweep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.error) {
        setSweepResult({ ok: false, reason: data.error })
      } else if (data.ok) {
        setSweepResult({ ok: true, sweepAmount: data.result?.sweepAmount })
        setQuickActionDone(prev => new Set([...prev, 'Payment Sweep']))
      } else {
        setSweepResult({ ok: false, reason: data.reason ?? 'Not eligible' })
      }
    } catch {
      setSweepResult({ ok: false, reason: 'Request failed' })
    } finally {
      setSweepLoading(false)
    }
  }, [clientId])


  const sendNotify = async (type: 'payment_reminder' | 'overdue_notice' | 'legal_notice' | 'custom') => {
    setNotifyLoading(true)
    try {
      const body: Record<string, unknown> = { type }
      if (type === 'payment_reminder') {
        if (notifyAmount) body.amount = Number(notifyAmount)
        if (notifyDueDate) body.dueDate = notifyDueDate
      } else if (type === 'overdue_notice') {
        if (notifyAmount) body.amount = Number(notifyAmount)
        if (notifyDaysOverdue) body.daysOverdue = Number(notifyDaysOverdue)
      } else if (type === 'custom') {
        body.customBody = notifyCustomBody
      }
      const res = await fetch(`/api/clients/${clientId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.error) {
        setNotifyDone(prev => new Set([...prev, type]))
        setNotifyModal(null)
        setNotifyAmount('')
        setNotifyDaysOverdue('')
        setNotifyDueDate('')
        setNotifyCustomBody('')
      }
    } catch { /* silent */ } finally {
      setNotifyLoading(false)
    }
  }

  const proposeRestructuring = useCallback(async () => {
    setRestructuringSubmitting(true)
    try {
      const body: Record<string, unknown> = { type: rPlanType }
      if (rCreditId)       body.creditId              = rCreditId
      if (rNotes)          body.notes                 = rNotes
      if (rPlanType === 'LoanExtension'   && rMaturityDate)   body.newMaturityDate       = rMaturityDate
      if (rPlanType === 'PaymentHoliday'  && rHolidayMonths)  body.holidayDurationMonths = Number(rHolidayMonths)
      if (rPlanType === 'RateReduction'   && rNewRate)         body.newInterestRate       = Number(rNewRate)
      if ((rPlanType === 'DebtConsolidation' || rPlanType === 'PartialWriteOff') && rForgivenAmount)
        body.forgivenAmount = Number(rForgivenAmount)

      const res  = await fetch(`/api/clients/${clientId}/restructuring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.error) {
        setActivePlan({
          id:                      data.id,
          client_id:               clientId,
          credit_id:               rCreditId || null,
          type:                    rPlanType,
          new_maturity_date:       rPlanType === 'LoanExtension'  ? rMaturityDate   || null : null,
          holiday_duration_months: rPlanType === 'PaymentHoliday' ? Number(rHolidayMonths) || null : null,
          new_interest_rate:       rPlanType === 'RateReduction'  ? Number(rNewRate) || null : null,
          forgiven_amount:         (rPlanType === 'DebtConsolidation' || rPlanType === 'PartialWriteOff')
                                   ? Number(rForgivenAmount) || null : null,
          status:      'Proposed',
          approved_by: null,
          approved_at: null,
          notes:       rNotes || null,
          created_by:  '',
          created_at:  new Date().toISOString(),
          updated_at:  new Date().toISOString(),
        })
        setRestructuringOpen(false)
        // reset form
        setRPlanType('LoanExtension'); setRCreditId(''); setRMaturityDate('')
        setRHolidayMonths(''); setRNewRate(''); setRForgivenAmount(''); setRNotes('')
      }
    } catch { /* silent */ } finally {
      setRestructuringSubmitting(false)
    }
  }, [clientId, rPlanType, rCreditId, rMaturityDate, rHolidayMonths, rNewRate, rForgivenAmount, rNotes])

  const escalateToCommittee = useCallback(async () => {
    setCommitteeSubmitting(true)
    try {
      const res  = await fetch(`/api/clients/${clientId}/committee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: committeeNotes || null }),
      })
      const data = await res.json()
      if (!data.error) {
        const newEntry: CommitteeRow = {
          id:            data.id,
          client_id:     clientId,
          credit_id:     null,
          escalated_by:  '',
          escalated_at:  new Date().toISOString(),
          decision:      'Pending',
          decision_date: null,
          decided_by:    null,
          notes:         committeeNotes || null,
          updated_at:    new Date().toISOString(),
        }
        setCommitteeLog(prev => [newEntry, ...prev])
        setQuickActionDone(prev => new Set([...prev, 'Escalate']))
        setCommitteeModalOpen(false)
        setCommitteeNotes('')
      }
    } catch { /* silent */ } finally {
      setCommitteeSubmitting(false)
    }
  }, [clientId, committeeNotes])

  const initiateRecovery = useCallback(async () => {
    setRecoverySubmitting(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/recovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: rcStage, assignedTo: rcAssignedTo || null, notes: rcNotes || null }),
      })
      const data = await res.json() as RecoveryMutationResponse
      if (!data.error && data.case) {
        const nextCase = data.case
        setActiveRecovery(nextCase)
        setRecoveryHistory(prev => sortRecoveryCases([
          nextCase,
          ...prev.filter(item => item.id !== nextCase.id),
        ]))
        setRecoveryOpen(false)
        setRcStage('DebtCollection'); setRcAssignedTo(''); setRcNotes('')
      }
    } catch { /* silent */ } finally {
      setRecoverySubmitting(false)
    }
  }, [clientId, rcStage, rcAssignedTo, rcNotes])

  const openRecoveryModal = useCallback(() => {
    setRcStage(activeRecovery?.stage ?? 'DebtCollection')
    setRcAssignedTo(activeRecovery?.assigned_to ?? '')
    setRcNotes(activeRecovery?.notes ?? '')
    setRecoveryOpen(true)
  }, [activeRecovery])

  /* ── render ──────────────────────────────────────────────────────────── */
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Profile hero card ──────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0D1B2A 0%, #152638 55%, #0A1E30 100%)',
        padding: '16px 24px 14px',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        borderBottom: '1px solid rgba(201,168,76,0.2)',
      }}>
        {/* Gold accent line top */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, var(--gold) 0%, rgba(201,168,76,0.3) 50%, transparent 100%)',
        }} />
        {/* Subtle decorative ring */}
        <div style={{
          position: 'absolute', top: -60, right: -60,
          width: 200, height: 200, borderRadius: '50%',
          border: '1px solid rgba(201,168,76,0.08)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: -30, right: -30,
          width: 120, height: 120, borderRadius: '50%',
          border: '1px solid rgba(201,168,76,0.06)',
          pointerEvents: 'none',
        }} />

        {/* Identity row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, position: 'relative' }}>
          {/* Avatar */}
          <div style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            background: `${stageColor(profile.stage)}22`,
            border: `2px solid ${stageColor(profile.stage)}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '15px', fontWeight: 700, color: stageColor(profile.stage),
            fontFamily: 'var(--mono)',
            boxShadow: `0 0 0 4px ${stageColor(profile.stage)}15, 0 4px 16px rgba(0,0,0,0.4)`,
          }}>
            {initials}
          </div>

          {/* Name + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {profile.full_name && (
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'white', lineHeight: 1.2, marginBottom: 5 }}>
                {profile.full_name}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--mono)' }}>
                {profile.personal_id}
              </span>
              {profile.region && (
                <><span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{profile.region}</span></>
              )}
              {profile.employment_type && (
                <><span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{profile.employment_type}</span></>
              )}
              <span className={`badge ${stageBadge(profile.stage)}`} style={{ marginTop: 0 }}>{profile.stage}</span>
              {isWrittenOff && (
                <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '2px 7px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', color: 'white' }}>
                  Written Off
                </span>
              )}
              {isFrozen && (
                <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '2px 7px', borderRadius: '3px', background: '#1E3A5F', color: '#93C5FD' }}>
                  🔒 Frozen
                </span>
              )}
              {isResolved && (
                <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '2px 7px', borderRadius: '3px', background: 'rgba(22,163,74,0.2)', color: '#86EFAC' }}>
                  ✓ Resolved
                </span>
              )}
            </div>
          </div>

          {/* AI Insights button */}
          <button
            onClick={() => { setActiveTab('ai'); generateInsights() /* useMutation.mutate */ }}
            disabled={generating}
            style={{
              flexShrink: 0, padding: '9px 18px', borderRadius: '8px',
              border: '1px solid rgba(201,168,76,0.35)',
              background: generating ? 'rgba(255,255,255,0.05)' : 'rgba(201,168,76,0.1)',
              color: generating ? 'rgba(255,255,255,0.35)' : 'var(--gold)',
              fontSize: '12px', fontWeight: 700, cursor: generating ? 'default' : 'pointer',
              fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
              letterSpacing: '0.2px',
            }}
          >
            <span style={{ fontSize: '13px' }}>{generating ? '⏳' : '✦'}</span>
            {generating ? 'Generating…' : 'AI Insights'}
          </button>

          {/* Add to Watchlist button */}
          <button
            onClick={watchlistState === 'done' ? () => router.push('/watchlist') : addToWatchlist}
            disabled={watchlistState === 'loading'}
            title={watchlistState === 'done' ? 'On watchlist — click to view' : 'Add to watchlist'}
            style={{
              flexShrink: 0, padding: '9px 14px', borderRadius: '8px',
              border: watchlistState === 'done'
                ? '1px solid rgba(34,197,94,0.4)'
                : '1px solid rgba(255,255,255,0.12)',
              background: watchlistState === 'done'
                ? 'rgba(34,197,94,0.12)'
                : watchlistState === 'loading'
                  ? 'rgba(255,255,255,0.03)'
                  : 'rgba(255,255,255,0.06)',
              color: watchlistState === 'done'
                ? '#4ade80'
                : watchlistState === 'loading'
                  ? 'rgba(255,255,255,0.25)'
                  : 'rgba(255,255,255,0.7)',
              fontSize: '13px', cursor: watchlistState === 'loading' ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            {watchlistState === 'loading' ? (
              <span style={{ fontSize: '12px' }}>⏳</span>
            ) : watchlistState === 'done' ? (
              <>
                <span>★</span>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>On Watchlist</span>
              </>
            ) : (
              <>
                <span>☆</span>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>Watchlist</span>
              </>
            )}
          </button>
        </div>

        {/* KPI tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, position: 'relative' }}>
          {([
            {
              label: 'Total Exposure',
              value: fmtEur(profile.total_exposure),
              sub: profile.on_balance > 0 ? `${fmtEur(profile.on_balance)} outstanding` : '—',
              accent: 'var(--gold)',
              valueColor: 'rgba(255,255,255,0.95)',
            },
            {
              label: 'Days Past Due',
              value: `${profile.current_due_days}d`,
              sub: `Max 12M: ${profile.max_due_days_12m}d`,
              accent: profile.current_due_days > 90 ? '#EF4444' : profile.current_due_days > 30 ? '#F59E0B' : '#22C55E',
              valueColor: profile.current_due_days > 90 ? '#F87171' : profile.current_due_days > 30 ? '#FCD34D' : '#4ADE80',
            },
            {
              label: 'Risk Score',
              value: profile.risk_score != null ? String(profile.risk_score) : '—',
              sub: profile.sicr_flagged ? '⚑ SICR flagged' : 'No SICR',
              accent: profile.risk_score >= 7 ? '#EF4444' : profile.risk_score >= 4 ? '#F59E0B' : '#22C55E',
              valueColor: profile.risk_score >= 7 ? '#F87171' : profile.risk_score >= 4 ? '#FCD34D' : '#4ADE80',
              subAlert: profile.sicr_flagged,
            },
            {
              label: 'DTI Ratio',
              value: `${profile.dti_ratio?.toFixed(1) ?? '—'}%`,
              sub: `Repayment: ${profile.repayment_rate_pct?.toFixed(0) ?? '—'}%`,
              accent: (profile.dti_ratio ?? 0) > 50 ? '#EF4444' : (profile.dti_ratio ?? 0) > 35 ? '#F59E0B' : '#22C55E',
              valueColor: (profile.dti_ratio ?? 0) > 50 ? '#F87171' : (profile.dti_ratio ?? 0) > 35 ? '#FCD34D' : '#4ADE80',
            },
            pd !== null ? {
              label: 'ML Default Risk',
              value: `${(pd * 100).toFixed(1)}%`,
              sub: prediction?.risk_label ?? '90-day PD',
              accent: pd > 0.3 ? '#EF4444' : pd > 0.1 ? '#F59E0B' : '#22C55E',
              valueColor: pd > 0.3 ? '#F87171' : pd > 0.1 ? '#FCD34D' : '#4ADE80',
            } : {
              label: 'Credit Utilisation',
              value: `${creditUtil}%`,
              sub: `${fmtEur(profile.on_balance)} / ${fmtEur(profile.approved_amount)}`,
              accent: creditUtil > 80 ? '#EF4444' : creditUtil > 60 ? '#F59E0B' : '#22C55E',
              valueColor: creditUtil > 80 ? '#F87171' : creditUtil > 60 ? '#FCD34D' : '#4ADE80',
            },
          ] as { label: string; value: string; sub: string; accent: string; valueColor: string; subAlert?: boolean }[]).map(kpi => (
            <div key={kpi.label} style={{
              background: 'rgba(255,255,255,0.055)',
              borderRadius: 9,
              padding: '11px 13px',
              borderBottom: `2px solid ${kpi.accent}`,
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1.2px',
                color: 'rgba(255,255,255,0.4)', marginBottom: 5, fontWeight: 600,
              }}>
                {kpi.label}
              </div>
              <div style={{
                fontSize: '19px', fontWeight: 700, color: kpi.valueColor,
                fontFamily: 'var(--mono)', lineHeight: 1.1,
              }}>
                {kpi.value}
              </div>
              <div style={{
                fontSize: '9.5px', marginTop: 4,
                color: kpi.subAlert ? '#F87171' : 'rgba(255,255,255,0.38)',
                fontWeight: kpi.subAlert ? 600 : 400,
              }}>
                {kpi.sub}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Credit Committee escalation banner ─────────────────────────── */}
      {insights?.recommended_actions?.escalate_to_committee && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '8px 18px',
          background: '#FEF2F2', borderBottom: '1px solid #FECACA', flexShrink: 0,
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: '#FEE2E2', border: '2px solid var(--red)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 800, color: 'var(--red)',
          }}>!</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#991B1B' }}>
              Credit Committee Escalation Required
            </span>
            <span style={{ fontSize: '11px', color: '#B91C1C', marginLeft: '8px' }}>
              AI analysis recommends escalating this client to the credit committee.
            </span>
          </div>
          {!quickActionDone.has('Escalate') ? (
            <button
              onClick={() => setCommitteeModalOpen(true)}
              style={{
                padding: '5px 14px', borderRadius: '5px', flexShrink: 0,
                background: 'var(--red)', border: 'none', color: 'white',
                fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              Escalate Now
            </button>
          ) : (
            <span style={{
              fontSize: '11px', fontWeight: 700, color: 'var(--green)',
              padding: '5px 14px', background: '#DCFCE7', borderRadius: '5px', flexShrink: 0,
            }}>✓ Escalated</span>
          )}
        </div>
      )}

      {/* ── Recovery case sub-banner ───────────────────────────────────── */}
      {activeRecovery && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '7px 18px',
          background: '#FFF7ED', borderBottom: '1px solid #FED7AA', flexShrink: 0,
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
            background: '#FFEDD5', border: '2px solid #EA580C',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px', fontWeight: 800, color: '#EA580C',
          }}>R</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#7C2D12' }}>
              Recovery Case: {activeRecovery.stage.replace(/([A-Z])/g, ' $1').trim()}
            </span>
            {activeRecovery.assigned_to && (
              <span style={{ fontSize: '11px', color: '#9A3412', marginLeft: '8px' }}>
                · Assigned to {activeRecovery.assigned_to}
              </span>
            )}
            <span style={{ fontSize: '10px', color: '#92400E', marginLeft: '8px' }}>
              Opened {fmtDate(activeRecovery.opened_at)}
            </span>
          </div>
          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#FEF3C7', color: '#92400E', flexShrink: 0 }}>
            {activeRecovery.status}
          </span>
        </div>
      )}

      {/* ── Main body (tabs + sidebar) ─────────────────────────────────── */}
      <div className="profile-body">

        {/* ── Left: tab area ─────────────────────────────────────────── */}
        <div className="profile-tab-area">

          {/* Tab bar */}
          <div className="tabs">
            {(([
              { id: 'overview', label: 'Overview' },
              { id: 'ewi', label: 'EWI Signals', count: ewiSignals.filter(s => s.severity !== 'Low').length || undefined },
              { id: 'alerts', label: 'Alerts', count: derivedAlerts.length || undefined },
              { id: 'ai', label: 'AI Insights' },
              { id: 'log', label: 'Actions Log', count: caseHistory.length || undefined },
              { id: 'whatif', label: 'What-If' },
            ]) as { id: typeof activeTab; label: string; count?: number }[]).map(t => (
              <button
                key={t.id}
                className={`tab${activeTab === t.id ? ' active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
                {t.count != null && <span className="tab-count">{t.count}</span>}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* ── Overview ─────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>

                {/* ── Left column: products + DPD + active plans ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Loan products */}
                  <div className="panel">
                    <div className="ph"><span className="pt">Loan Products</span></div>
                    {products.length === 0 ? (
                      <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No products found</div></div>
                    ) : (
                      <div className="tbl-wrap">
                        <table className="tbl">
                          <thead>
                            <tr>
                              <th>Account</th>
                              <th>Product Type</th>
                              <th className="tr">Approved Amount</th>
                              <th>Stage</th>
                              <th className="tr">DPD</th>
                            </tr>
                          </thead>
                          <tbody>
                            {products.map((p, i) => (
                              <tr key={i}>
                                <td><span className="mono" style={{ fontSize: '11px' }}>{p.credit_account}</span></td>
                                <td>{p.product_type || '—'}</td>
                                <td className="tr"><span className="mono">{fmtEur(p.approved_amount)}</span></td>
                                <td><span className={`badge ${stageBadge(p.stage)}`} style={{ marginTop: 0, fontSize: '8.5px' }}>{p.stage}</span></td>
                                <td className="tr">
                                  <span className="mono" style={{ fontSize: '11px', color: dpdColor(p.due_days), fontWeight: p.due_days > 0 ? 700 : 400 }}>
                                    {p.due_days}d
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* DPD history chart */}
                  {dpdHistory.length > 0 && (
                    <div className="panel">
                      <div className="ph">
                        <span className="pt">DPD History</span>
                        <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Last {dpdHistory.length} months</span>
                      </div>
                      <div className="bars" style={{ height: '64px', alignItems: 'flex-end' }}>
                        {dpdHistory.slice(-12).map((d, i) => {
                          const h = maxDpd > 0 ? Math.max((d.due_days / maxDpd) * 56, d.due_days > 0 ? 4 : 2) : 2
                          const col = d.due_days === 0 ? 'var(--green)' : dpdColor(d.due_days)
                          return (
                            <div key={i} className="bw" title={`${d.month}: ${d.due_days}d DPD`}>
                              <div className="b" style={{ height: `${h}px`, background: col, opacity: 0.85 }} />
                              <div className="bl">{d.month?.slice(-2)}</div>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                        {[
                          { col: 'var(--green)', label: 'Current (0d)' },
                          { col: 'var(--amber)', label: 'Late (30–89d)' },
                          { col: 'var(--red)', label: 'Overdue (90d+)' },
                        ].map(l => (
                          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: 'var(--muted)' }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: l.col }} />
                            {l.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active restructuring plan */}
                  {activePlan && (() => {
                    const planTypeLabels: Record<string, string> = {
                      LoanExtension:    'Loan Extension',
                      PaymentHoliday:   'Payment Holiday',
                      RateReduction:    'Rate Reduction',
                      DebtConsolidation:'Debt Consolidation',
                      PartialWriteOff:  'Partial Write-Off',
                    }
                    const statusColor: Record<string, string> = {
                      Proposed:  'var(--amber)',
                      Approved:  'var(--blue)',
                      Active:    'var(--green)',
                      Rejected:  'var(--red)',
                      Completed: 'var(--muted)',
                    }
                    const statusBg: Record<string, string> = {
                      Proposed:  '#FEF3C7',
                      Approved:  '#EFF6FF',
                      Active:    '#DCFCE7',
                      Rejected:  '#FEE2E2',
                      Completed: '#F1F5F9',
                    }
                    const sc = statusColor[activePlan.status] ?? 'var(--muted)'
                    const sb = statusBg[activePlan.status]    ?? '#F8FAFC'
                    return (
                      <div className="panel" style={{ borderLeft: `3px solid ${sc}` }}>
                        <div className="ph">
                          <span className="pt">Active Restructuring Plan</span>
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '3px', color: sc, background: sb }}>
                            {activePlan.status}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '2px' }}>Type</div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                              {planTypeLabels[activePlan.type] ?? activePlan.type}
                            </div>
                          </div>
                          {activePlan.credit_id && (
                            <div>
                              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '2px' }}>Credit</div>
                              <div className="mono" style={{ fontSize: '12px', color: 'var(--text)' }}>{activePlan.credit_id}</div>
                            </div>
                          )}
                          {activePlan.new_maturity_date && (
                            <div>
                              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '2px' }}>New Maturity</div>
                              <div className="mono" style={{ fontSize: '12px', color: 'var(--text)' }}>{activePlan.new_maturity_date}</div>
                            </div>
                          )}
                          {activePlan.holiday_duration_months != null && (
                            <div>
                              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '2px' }}>Holiday Duration</div>
                              <div className="mono" style={{ fontSize: '12px', color: 'var(--text)' }}>{activePlan.holiday_duration_months} months</div>
                            </div>
                          )}
                          {activePlan.new_interest_rate != null && (
                            <div>
                              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '2px' }}>New Interest Rate</div>
                              <div className="mono" style={{ fontSize: '12px', color: 'var(--text)' }}>{activePlan.new_interest_rate}%</div>
                            </div>
                          )}
                          {activePlan.forgiven_amount != null && (
                            <div>
                              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '2px' }}>Forgiven Amount</div>
                              <div className="mono" style={{ fontSize: '12px', color: 'var(--text)' }}>{fmtEur(activePlan.forgiven_amount)}</div>
                            </div>
                          )}
                          {activePlan.approved_by && (
                            <div>
                              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '2px' }}>Approved By</div>
                              <div style={{ fontSize: '12px', color: 'var(--text)' }}>{activePlan.approved_by}</div>
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '2px' }}>Proposed</div>
                            <div className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmtDate(activePlan.created_at)}</div>
                          </div>
                        </div>
                        {activePlan.notes && (
                          <div style={{ marginTop: '10px', padding: '8px 10px', background: '#F8FAFC', borderRadius: '5px', borderLeft: '3px solid var(--border)', fontSize: '11.5px', color: 'var(--text)', lineHeight: '1.5' }}>
                            {activePlan.notes}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Active recovery case */}
                  {activeRecovery && (() => {
                    const stageColor = activeRecovery.stage === 'WriteOff'
                      ? 'var(--red)' : '#EA580C'
                    return (
                      <div className="panel" style={{ borderLeft: `3px solid ${stageColor}` }}>
                        <div className="ph">
                          <span className="pt">Active Recovery Case</span>
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '3px', background: '#FFF7ED', color: stageColor }}>
                            {RECOVERY_STAGE_LABELS[activeRecovery.stage] ?? activeRecovery.stage}
                          </span>
                        </div>
                        {hasDuplicateOpenRecovery && (
                          <div style={{ marginBottom: '10px', padding: '8px 10px', background: '#FEF2F2', borderRadius: '5px', borderLeft: '3px solid var(--red)', fontSize: '11.5px', color: '#991B1B', lineHeight: '1.45' }}>
                            {openRecoveryCount} open recovery cases exist for this client. The banner shows the most recent one; the history below exposes the duplicates.
                          </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '2px' }}>Status</div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: activeRecovery.status === 'Open' ? 'var(--green)' : 'var(--muted)' }}>{activeRecovery.status}</div>
                          </div>
                          {activeRecovery.assigned_to && (
                            <div>
                              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '2px' }}>Assigned To</div>
                              <div style={{ fontSize: '12px', color: 'var(--text)' }}>{activeRecovery.assigned_to}</div>
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '2px' }}>Opened</div>
                            <div className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmtDate(activeRecovery.opened_at)}</div>
                          </div>
                        </div>
                        {activeRecovery.notes && (
                          <div style={{ marginTop: '10px', padding: '8px 10px', background: '#FFF7ED', borderRadius: '5px', borderLeft: '3px solid #FED7AA', fontSize: '11.5px', color: 'var(--text)', lineHeight: '1.5' }}>
                            {activeRecovery.notes}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {recoveryHistory.length > 0 && (
                    <div className="panel">
                      <div className="ph">
                        <span className="pt">Recovery History</span>
                        <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                          {recoveryHistory.length} case{recoveryHistory.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {recoveryHistory.slice(0, 5).map(item => {
                          const itemColor = item.stage === 'WriteOff' ? 'var(--red)' : item.status === 'Open' ? '#EA580C' : 'var(--border)'
                          return (
                            <div
                              key={item.id}
                              style={{
                                padding: '10px 12px',
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                background: item.status === 'Open' ? '#FFF7ED' : '#F8FAFC',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: itemColor }}>
                                  {RECOVERY_STAGE_LABELS[item.stage] ?? item.stage}
                                </div>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  background: item.status === 'Open' ? '#FFEDD5' : '#E5E7EB',
                                  color: item.status === 'Open' ? '#9A3412' : 'var(--muted)',
                                }}>
                                  {item.status}
                                </span>
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: '1.5' }}>
                                Opened {fmtDate(item.opened_at)}
                                {item.assigned_to ? ` • Assigned to ${item.assigned_to}` : ''}
                              </div>
                              {item.notes && (
                                <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--text)', lineHeight: '1.45' }}>
                                  {item.notes}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      {recoveryHistory.length > 5 && (
                        <div style={{ marginTop: '10px', fontSize: '10.5px', color: 'var(--muted)' }}>
                          Showing the latest 5 recovery cases.
                        </div>
                      )}
                    </div>
                  )}

                </div>{/* end left column */}

                {/* ── Right column: client info + ML prediction ──── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Client information */}
                  <div className="panel">
                    <div className="ph"><span className="pt">Client Information</span></div>
                    <div className="detail-grid">
                      {[
                        ['Full Name', profile.full_name || '—'],
                        ['Personal ID', profile.personal_id],
                        ['Region / City', profile.region || '—'],
                        ['Gender', profile.gender || '—'],
                        ['Age', profile.age ? `${profile.age} years` : '—'],
                        ['Employment', profile.employment_type || '—'],
                        ['Tenure', profile.tenure_years ? `${profile.tenure_years.toFixed(1)}y` : '—'],
                        ['Missed Payments', profile.total_payments > 0 ? `${profile.missed_payments} of ${profile.total_payments}` : '—'],
                        ['On Balance', fmtEur(profile.on_balance)],
                        ['Off Balance', fmtEur(profile.off_balance)],
                      ].map(([label, value]) => (
                        <div key={label} className="detail-item">
                          <div className="detail-label">{label}</div>
                          <div className="detail-value">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ML prediction detail */}
                  {prediction && (
                    <div className="panel">
                      <div className="ph">
                        <span className="pt">ML Prediction Detail</span>
                        <span style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{prediction.prediction_date}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                        {[
                          { label: '30-day PD', value: `${(prediction.pd_30d * 100).toFixed(1)}%`, color: pdColor(prediction.pd_30d) },
                          { label: '60-day PD', value: `${(prediction.pd_60d * 100).toFixed(1)}%`, color: pdColor(prediction.pd_60d) },
                          { label: '90-day PD', value: `${(prediction.pd_90d * 100).toFixed(1)}%`, color: pdColor(prediction.pd_90d) },
                        ].map(p => (
                          <div key={p.label} style={{ textAlign: 'center', padding: '10px', background: '#F8FAFC', borderRadius: '6px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '4px' }}>{p.label}</div>
                            <div className="mono" style={{ fontSize: '20px', fontWeight: 700, color: p.color }}>{p.value}</div>
                          </div>
                        ))}
                      </div>
                      {[
                        { label: 'Stage Migration Prob', value: `${(prediction.stage_migration_prob * 100).toFixed(1)}%` },
                        { label: 'DPD Escalation Prob', value: `${(prediction.dpd_escalation_prob * 100).toFixed(1)}%` },
                      ].map(r => (
                        <div key={r.label} className="stat-row">
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{r.label}</span>
                          <span className="mono" style={{ fontSize: '12px', fontWeight: 600 }}>{r.value}</span>
                        </div>
                      ))}
                      {prediction.recommended_action && (
                        <div style={{ marginTop: '10px', padding: '8px 11px', background: '#F0F9FF', borderRadius: '6px', borderLeft: '3px solid var(--blue)', fontSize: '11.5px', color: 'var(--text)' }}>
                          <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--blue)', display: 'block', marginBottom: '3px' }}>Recommended Action</span>
                          {prediction.recommended_action}
                        </div>
                      )}

                      {/* SHAP drivers */}
                      {shap && (
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '8px' }}>Top Risk Drivers</div>
                          {[
                            { factor: shap.top_factor_1, shap: shap.shap_1 },
                            { factor: shap.top_factor_2, shap: shap.shap_2 },
                            { factor: shap.top_factor_3, shap: shap.shap_3 },
                          ].filter(d => d.factor).map((d, i) => {
                            const max = Math.abs(shap.shap_1) || 1
                            const pct = Math.abs(d.shap / max) * 100
                            return (
                              <div key={i} className="prog-row" style={{ marginBottom: '6px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text)', flex: 1, minWidth: 0 }}>
                                  {d.factor.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                </div>
                                <div style={{ width: '80px', height: '5px', background: '#E9EEF5', borderRadius: '3px', overflow: 'hidden', flexShrink: 0, margin: '0 8px' }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: d.shap >= 0 ? 'var(--red)' : 'var(--green)', borderRadius: '3px' }} />
                                </div>
                                <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: d.shap >= 0 ? 'var(--red)' : 'var(--green)', width: '44px', textAlign: 'right', flexShrink: 0 }}>
                                  {d.shap >= 0 ? '+' : ''}{d.shap.toFixed(3)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                </div>{/* end right column */}

              </div>
            )}

            {/* ── EWI Signals ──────────────────────────────────────── */}
            {activeTab === 'ewi' && (
              <>
                {/* EWI cards */}
                {ewi && (
                  <div className="panel">
                    <div className="ph"><span className="pt">Early Warning Indicators</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                      {[
                        { name: 'Salary Inflow', val: ewi.salary_inflow, ok: !ewi.salary_inflow?.toLowerCase().includes('stop') },
                        { name: 'Overdraft', val: ewi.overdraft, ok: !ewi.overdraft?.toLowerCase().includes('depend') && !ewi.overdraft?.toLowerCase().includes('high') },
                        { name: 'Card Usage', val: ewi.card_usage, ok: !ewi.card_usage?.toLowerCase().includes('high') },
                        { name: 'Consec. Lates', val: ewi.consec_lates, ok: parseInt(ewi.consec_lates ?? '0') === 0 },
                      ].map(s => (
                        <div key={s.name} className="ewi-card" style={{ borderColor: s.ok ? 'var(--border)' : '#FCA5A5' }}>
                          <div className="ewi-name">{s.name}</div>
                          <div className={`ewi-val ${s.ok ? 'ewi-ok' : 'ewi-alert'}`}>{s.val || 'Normal'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Signals table */}
                <div className="panel">
                  <div className="ph">
                    <span className="pt">Signal Log</span>
                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{ewiSignals.length} signal{ewiSignals.length !== 1 ? 's' : ''}</span>
                  </div>
                  {ewiSignals.length === 0 ? (
                    <div className="empty-state">
                      <div style={{ fontSize: '24px' }}>✓</div>
                      <div className="empty-state-text" style={{ fontWeight: 600, color: 'var(--green)' }}>No active EWI signals</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>This client shows no early warning indicators.</div>
                    </div>
                  ) : (
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Signal</th>
                          <th>Status / Value</th>
                          <th>Severity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ewiSignals.map((s, i) => {
                          const sev = s.severity.toLowerCase()
                          const sevColor = sev === 'high' ? 'var(--red)' : sev === 'medium' ? 'var(--amber)' : 'var(--green)'
                          const sevBg = sev === 'high' ? '#FEE2E2' : sev === 'medium' ? '#FEF3C7' : '#DCFCE7'
                          return (
                            <tr key={i}>
                              <td style={{ fontWeight: 500 }}>{s.signal}</td>
                              <td style={{ color: 'var(--muted)' }}>{s.value}</td>
                              <td>
                                <span style={{
                                  display: 'inline-block', padding: '2px 8px', borderRadius: '3px',
                                  fontSize: '10px', fontWeight: 600, fontFamily: 'var(--mono)',
                                  color: sevColor, background: sevBg,
                                }}>
                                  {s.severity}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Risk flags detail */}
                {riskFlag && riskFlag.risk_flag_count > 0 && (
                  <div className="panel">
                    <div className="ph">
                      <span className="pt">ML Risk Flags</span>
                      <span style={{
                        fontSize: '10px', padding: '2px 8px', borderRadius: '3px',
                        background: '#FEE2E2', color: 'var(--red)', fontWeight: 600,
                      }}>
                        {riskFlag.risk_flag_count} flag{riskFlag.risk_flag_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {[
                        { key: 'flag_zscore_anomaly', label: 'Z-Score Anomaly', desc: 'Client behaviour deviates significantly from statistical norm' },
                        { key: 'flag_score_deterioration', label: 'Score Deterioration', desc: 'PD score has deteriorated rapidly in recent periods' },
                        { key: 'flag_exposure_spike', label: 'Exposure Spike', desc: 'Unusual increase in outstanding balance detected' },
                        { key: 'flag_salary_stopped', label: 'Salary Inflow Stopped', desc: 'No salary credit received in the past 60 days' },
                        { key: 'flag_overdraft_dependent', label: 'Overdraft Dependency', desc: 'Account consistently operates in overdraft territory' },
                        { key: 'flag_card_acceleration', label: 'Card Spend Acceleration', desc: 'Credit card spend is accelerating above normal patterns' },
                      ].filter(f => riskFlag[f.key as keyof RiskFlagRow]).map(f => (
                        <div key={f.key} style={{ display: 'flex', gap: '10px', padding: '8px 10px', background: '#FFF7F7', borderRadius: '6px', border: '1px solid #FCA5A5' }}>
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#FEE2E2', border: '1px solid #FCA5A5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', flexShrink: 0, color: 'var(--red)', fontWeight: 700 }}>!</div>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{f.label}</div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>{f.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Alerts ───────────────────────────────────────────── */}
            {activeTab === 'alerts' && (
              <>
                {derivedAlerts.length === 0 && activeActions.length === 0 ? (
                  <div className="panel">
                    <div className="empty-state">
                      <div style={{ fontSize: '28px' }}>✓</div>
                      <div className="empty-state-text" style={{ fontWeight: 600, color: 'var(--green)' }}>No active alerts</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>No overdue products or active actions for this client.</div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Product-level alerts */}
                    {derivedAlerts.map(a => {
                      const isAcked = ackedAlerts.has(a.id)
                      const col = priorityColor(a.priority)
                      return (
                        <div key={a.id} className="panel" style={{
                          borderLeft: `3px solid ${isAcked ? 'var(--green)' : col}`,
                          opacity: isAcked ? 0.65 : 1,
                        }}>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: '6px', flexShrink: 0,
                              background: isAcked ? '#DCFCE7' : `${col}18`,
                              border: `1px solid ${isAcked ? 'var(--green)' : col}40`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '14px',
                            }}>
                              {isAcked ? '✓' : a.priority === 'Urgent' ? '🔴' : a.priority === 'High' ? '🟠' : '🟡'}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{a.trigger}</span>
                                <span style={{
                                  padding: '2px 7px', borderRadius: '3px', fontSize: '9px',
                                  fontWeight: 700, fontFamily: 'var(--mono)',
                                  color: isAcked ? 'var(--green)' : col,
                                  background: isAcked ? '#DCFCE7' : `${col}18`,
                                }}>
                                  {isAcked ? 'ACTIONED' : a.priority}
                                </span>
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>
                                {a.product_type} · <span className="mono">{a.credit_id}</span> · <span style={{ color: col, fontWeight: 600 }}>{a.due_days}d DPD</span>
                              </div>
                              <div style={{ fontSize: '11.5px', color: 'var(--text)', marginTop: '6px', padding: '7px 10px', background: '#F8FAFC', borderRadius: '5px' }}>
                                {a.recommended_action}
                              </div>
                            </div>
                            {!isAcked && (
                              <button
                                onClick={() => setAckedAlerts(prev => new Set([...prev, a.id]))}
                                style={{
                                  flexShrink: 0, padding: '6px 14px', borderRadius: '5px',
                                  border: '1px solid var(--green)', background: 'white',
                                  color: 'var(--green)', fontSize: '11px', fontWeight: 600,
                                  cursor: 'pointer', fontFamily: 'var(--font)',
                                }}
                              >
                                Mark Actioned
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {/* Active banker actions */}
                    {activeActions.length > 0 && (
                      <div className="panel">
                        <div className="ph">
                          <span className="pt">Active Banker Actions</span>
                          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{activeActions.length} active</span>
                        </div>
                        {activeActions.map((a, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < activeActions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: '12px', color: 'var(--text)' }}>{a.action}</span>
                            <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>{fmtDate(a.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── AI Insights ──────────────────────────────────────── */}
            {activeTab === 'ai' && (
              <>
                {!insights && !generating && (
                  <div className="panel ai-panel" style={{ padding: '28px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', marginBottom: '12px' }}>🤖</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>AI Risk Insights</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '20px', maxWidth: '360px', margin: '0 auto 20px' }}>
                      Generate a structured AI analysis including risk narrative, deterioration prediction, recommended actions, recovery strategy, and a client transparency letter.
                    </div>
                    {insightsError && (
                      <div className="ai-error" style={{ marginBottom: '12px', textAlign: 'left' }}>{insightsError}</div>
                    )}
                    <button className="ai-btn" onClick={() => generateInsights()} style={{ maxWidth: '300px', margin: '0 auto', display: 'block' }}>
                      Generate AI Insights for {profile.full_name || profile.personal_id} ↗
                    </button>
                  </div>
                )}

                {generating && (
                  <div className="panel" style={{ padding: '28px', textAlign: 'center' }}>
                    <div className="ai-loading" style={{ justifyContent: 'center' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: '8px' }}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Analysing client risk profile…
                    </div>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                )}

                {insights && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>
                        Generated {fmtDate(insights.generated_at)}
                        <span className="ai-badge" style={{ marginLeft: '8px' }}>Claude</span>
                      </div>
                      <button className="ai-regen" onClick={() => generateInsights()}>↺ Regenerate</button>
                    </div>

                    {/* 2x2 grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

                      {/* Risk Narrative */}
                      <div className="panel">
                        <div className="ph">
                          <span className="pt">Risk Narrative</span>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '3px',
                            color: riskLevelColor(insights.risk_narrative.risk_level),
                            background: riskLevelBg(insights.risk_narrative.risk_level),
                          }}>
                            {insights.risk_narrative.risk_level}
                          </span>
                        </div>
                        <p style={{ fontSize: '12px', lineHeight: '1.7', color: 'var(--text)', marginBottom: '10px' }}>
                          {insights.risk_narrative.summary}
                        </p>
                        <div style={{ padding: '8px 10px', background: '#FFF7F0', borderRadius: '5px', borderLeft: '3px solid var(--amber)' }}>
                          <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--amber)', marginBottom: '3px' }}>Key Concern</div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text)' }}>{insights.risk_narrative.key_concern}</div>
                        </div>
                      </div>

                      {/* Deterioration Prediction */}
                      <div className="panel">
                        <div className="ph">
                          <span className="pt">Deterioration Prediction</span>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '3px',
                            color: riskLevelColor(insights.deterioration_prediction.deterioration_risk),
                            background: riskLevelBg(insights.deterioration_prediction.deterioration_risk),
                          }}>
                            {insights.deterioration_prediction.deterioration_risk}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                          <div className="meter" style={{ flex: 1 }}>
                            <div className="meter-pin" style={{ left: `${Math.min(insights.deterioration_prediction.risk_score, 99)}%` }} />
                          </div>
                          <span className="mono" style={{ fontSize: '20px', fontWeight: 700, color: riskLevelColor(insights.deterioration_prediction.deterioration_risk), flexShrink: 0 }}>
                            {insights.deterioration_prediction.risk_score}
                          </span>
                        </div>
                        <p style={{ fontSize: '11.5px', color: 'var(--muted)', marginBottom: '8px' }}>
                          {insights.deterioration_prediction.probability_statement}
                        </p>
                        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {insights.deterioration_prediction.key_signals.map((s, i) => (
                            <li key={i} style={{ fontSize: '11px', color: 'var(--text)', display: 'flex', gap: '7px', alignItems: 'flex-start' }}>
                              <span style={{ color: 'var(--red)', flexShrink: 0, marginTop: '1px' }}>▲</span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Recommended Actions */}
                      <div className="panel">
                        <div className="ph">
                          <span className="pt">Recommended Actions</span>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '3px',
                            color: priorityColor(insights.recommended_actions.priority),
                            background: `${priorityColor(insights.recommended_actions.priority)}18`,
                          }}>
                            {insights.recommended_actions.priority}
                          </span>
                        </div>
                        <div style={{ padding: '10px', background: '#F0F9FF', borderRadius: '6px', border: '1px solid #BFDBFE', marginBottom: '10px' }}>
                          <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--blue)', marginBottom: '4px' }}>Primary Action</div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{insights.recommended_actions.primary_action}</div>
                        </div>
                        {insights.recommended_actions.supporting_actions.map((a, i) => (
                          <div key={i} style={{ fontSize: '11.5px', color: 'var(--text)', padding: '5px 0', borderBottom: i < insights.recommended_actions.supporting_actions.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', gap: '8px' }}>
                            <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{i + 2}.</span>
                            {a}
                          </div>
                        ))}
                        {insights.recommended_actions.escalate_to_committee && (
                          <div style={{ marginTop: '10px', padding: '7px 10px', background: '#FEE2E2', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px' }}>⚠️</span>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--red)' }}>Escalate to Credit Committee</span>
                          </div>
                        )}
                      </div>

                      {/* Recovery Recommendation */}
                      <div className="panel">
                        <div className="ph">
                          <span className="pt">Recovery Recommendation</span>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '3px',
                            color: riskLevelColor(insights.recovery_recommendation.recovery_probability === 'High' ? 'Low' : insights.recovery_recommendation.recovery_probability === 'Low' ? 'High' : 'Medium'),
                            background: riskLevelBg(insights.recovery_recommendation.recovery_probability === 'High' ? 'Low' : insights.recovery_recommendation.recovery_probability === 'Low' ? 'High' : 'Medium'),
                          }}>
                            {insights.recovery_recommendation.recovery_probability} Recovery
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                          <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: '#EFF6FF', color: 'var(--blue)', border: '1px solid #BFDBFE' }}>
                            {insights.recovery_recommendation.recommended_strategy}
                          </span>
                          <span className="mono" style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#F0FDF4', color: 'var(--green)', border: '1px solid #BBF7D0' }}>
                            ~{insights.recovery_recommendation.estimated_recovery_rate}
                          </span>
                        </div>
                        <p style={{ fontSize: '11.5px', color: 'var(--text)', lineHeight: '1.6' }}>
                          {insights.recovery_recommendation.strategy_detail}
                        </p>
                      </div>
                    </div>

                    {/* Transparency Letter */}
                    <div className="panel">
                      <div className="ph">
                        <span className="pt">Client Transparency Letter</span>
                        <button
                          onClick={() => setLetterOpen(true)}
                          style={{
                            padding: '4px 12px', borderRadius: '5px',
                            border: '1px solid var(--border)', background: 'white',
                            fontSize: '11px', color: 'var(--text)', cursor: 'pointer',
                            fontFamily: 'var(--font)',
                          }}
                        >
                          View Full Letter →
                        </button>
                      </div>
                      <div style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '3px' }}>Subject</div>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)', fontStyle: 'italic' }}>{insights.transparency_letter.subject}</div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── Actions Log ──────────────────────────────────────── */}
            {activeTab === 'log' && (() => {
              // Merge case history + committee log into a single timeline,
              // sorted newest-first.
              type TimelineEntry =
                | { kind: 'action';    data: typeof caseHistory[0];  sortKey: string }
                | { kind: 'committee'; data: CommitteeRow;            sortKey: string }

              const entries: TimelineEntry[] = [
                ...caseHistory.map(c => ({
                  kind: 'action' as const,
                  data: c,
                  sortKey: c.createdAt,
                })),
                ...committeeLog.map(c => ({
                  kind: 'committee' as const,
                  data: c,
                  sortKey: c.escalated_at,
                })),
              ].sort((a, b) => b.sortKey.localeCompare(a.sortKey))

              return (
                <div className="panel">
                  <div className="ph">
                    <span className="pt">Actions Log</span>
                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                      {entries.length} record{entries.length !== 1 ? 's' : ''}
                      {committeeLog.length > 0 && (
                        <span style={{
                          marginLeft: '8px', fontSize: '9px', padding: '1px 6px',
                          borderRadius: '3px', background: '#FFF7ED',
                          color: '#9A3412', fontWeight: 600,
                        }}>
                          {committeeLog.length} committee
                        </span>
                      )}
                    </span>
                  </div>
                  {entries.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">📝</div>
                      <div className="empty-state-text">No actions logged yet</div>
                    </div>
                  ) : (
                    <div className="timeline">
                      {entries.map((entry, i) => {
                        if (entry.kind === 'committee') {
                          const c = entry.data
                          const isPending  = c.decision === 'Pending'
                          const dotColor   = isPending ? '#EA580C' : 'var(--navy)'
                          const decisionColors: Record<string, { bg: string; text: string }> = {
                            Pending:     { bg: '#FFF7ED', text: '#9A3412' },
                            Restructure: { bg: '#EFF6FF', text: 'var(--blue)' },
                            LegalAction: { bg: '#FEF2F2', text: 'var(--red)' },
                            WriteOff:    { bg: '#F1F5F9', text: 'var(--muted)' },
                          }
                          const dc = decisionColors[c.decision] ?? decisionColors.Pending
                          return (
                            <div key={c.id} className="tl-item">
                              <div className="tl-dot" style={{ background: dotColor, fontSize: '8px' }}>C</div>
                              <div className="tl-content">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span className="tl-title">
                                    {c.decision === 'Pending'
                                      ? 'Escalated to Credit Committee'
                                      : `Credit Committee Decision: ${c.decision === 'LegalAction' ? 'Legal Action' : c.decision === 'WriteOff' ? 'Write-Off' : c.decision}`
                                    }
                                  </span>
                                  <span style={{
                                    fontSize: '9px', padding: '1px 6px', borderRadius: '3px',
                                    background: '#FFF7ED', color: '#9A3412', fontFamily: 'var(--mono)', fontWeight: 600,
                                  }}>Committee</span>
                                  <span style={{
                                    fontSize: '9px', padding: '1px 6px', borderRadius: '3px',
                                    background: dc.bg, color: dc.text, fontFamily: 'var(--mono)',
                                  }}>
                                    {c.decision}
                                  </span>
                                </div>
                                <div className="tl-meta">
                                  {fmtDate(c.escalated_at)}
                                  {c.escalated_by && ` · ${c.escalated_by}`}
                                  {c.decision_date && ` · Decision: ${fmtDate(c.decision_date)}`}
                                </div>
                                {c.notes && (
                                  <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>{c.notes}</div>
                                )}
                              </div>
                            </div>
                          )
                        }

                        const c = entry.data
                        const isSystem = !c.actionedBy || c.actionedBy === 'system' || c.actionedBy === 'risk_officer'
                        const dotColor = c.status === 'resolved' ? 'var(--green)' : c.status === 'active' ? 'var(--amber)' : 'var(--slate)'
                        return (
                          <div key={c.id || i} className="tl-item">
                            <div className="tl-dot" style={{ background: dotColor, fontSize: '8px' }}>
                              {c.status === 'resolved' ? '✓' : isSystem ? 'S' : 'U'}
                            </div>
                            <div className="tl-content">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="tl-title">{c.action}</span>
                                <span style={{
                                  fontSize: '9px', padding: '1px 6px', borderRadius: '3px',
                                  background: isSystem ? '#F1F5F9' : '#EFF6FF',
                                  color: isSystem ? 'var(--muted)' : 'var(--blue)',
                                  fontFamily: 'var(--mono)',
                                }}>
                                  {isSystem ? 'System' : 'Manual'}
                                </span>
                                {c.status === 'resolved' && (
                                  <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '3px', background: '#DCFCE7', color: 'var(--green)', fontFamily: 'var(--mono)' }}>Resolved</span>
                                )}
                              </div>
                              <div className="tl-meta">
                                {fmtDate(c.createdAt)}
                                {c.actionedBy && c.actionedBy !== 'risk_officer' && ` · ${c.actionedBy}`}
                              </div>
                              {c.notes && (
                                <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>{c.notes}</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── What-If ──────────────────────────────────────────── */}
            {activeTab === 'whatif' && (() => {
              // Risk scoring formula (mirrors Python pipeline)
              function wiScore(stage: number, dpd: number) {
                const base = stage === 3 ? 0.65 : stage === 2 ? 0.40 : 0.20
                const dpdMod = dpd >= 90 ? 0.25 : dpd >= 60 ? 0.18 : dpd >= 30 ? 0.10 : dpd > 0 ? 0.04 : 0.0
                return Math.min(0.98, Math.max(0.05, base + dpdMod))
              }
              function wiLabel(s: number) {
                if (s >= 0.75) return 'Critical'
                if (s >= 0.50) return 'High'
                if (s >= 0.30) return 'Medium'
                return 'Low'
              }
              function wiColor(s: number) {
                if (s >= 0.75) return '#ef4444'
                if (s >= 0.50) return '#f97316'
                if (s >= 0.30) return '#eab308'
                return '#10b981'
              }
              function wiLabelColor(lbl: string) {
                if (lbl === 'Critical') return '#ef4444'
                if (lbl === 'High')     return '#f97316'
                if (lbl === 'Medium')   return '#eab308'
                return '#10b981'
              }

              const curStage  = profile.stage ?? 1
              const curDpd    = profile.current_due_days ?? 0
              const curScore  = wiScore(curStage, curDpd)
              const scenScore = wiScore(whatIfStage, whatIfDpd)
              const scenLabel = wiLabel(scenScore)
              const scenPct   = Math.round(scenScore * 100)
              const curPct    = Math.round(curScore * 100)
              const delta     = scenPct - curPct
              const improved  = delta < 0
              const worsened  = delta > 0

              const pd30 = Math.max(0.05, scenScore * 0.70)
              const pd60 = Math.max(0.05, scenScore * 0.85)
              const pd90 = scenScore

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Header */}
                  <div className="panel" style={{ padding: '12px 14px', background: 'linear-gradient(180deg, #FBFCFE 0%, #F4F7FB 100%)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>What-If Scenario</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.5 }}>
                      Adjust DPD and IFRS 9 Stage to see how the risk score would change. Uses the same formula as the ML pipeline.
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="panel" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, fontWeight: 600 }}>
                      Scenario Controls
                    </div>

                    {/* Stage selector */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: 8, fontWeight: 500 }}>
                        IFRS 9 Stage
                        <span style={{
                          marginLeft: 8, fontSize: '9px', padding: '1px 6px', borderRadius: 3,
                          background: whatIfStage === curStage ? '#F1F5F9' : '#FFF7ED',
                          color: whatIfStage === curStage ? 'var(--muted)' : '#9A3412',
                          fontWeight: 600,
                        }}>
                          {whatIfStage === curStage ? 'current' : 'modified'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[1, 2, 3].map(s => (
                          <button
                            key={s}
                            onClick={() => setWhatIfStage(s)}
                            style={{
                              flex: 1, padding: '8px 0', borderRadius: 6, cursor: 'pointer',
                              border: whatIfStage === s
                                ? `2px solid ${s === 3 ? 'var(--red)' : s === 2 ? 'var(--amber)' : 'var(--green)'}`
                                : '1px solid var(--border)',
                              background: whatIfStage === s
                                ? s === 3 ? '#FEE2E2' : s === 2 ? '#FEF3C7' : '#DCFCE7'
                                : 'transparent',
                              color: whatIfStage === s
                                ? s === 3 ? 'var(--red)' : s === 2 ? 'var(--amber)' : 'var(--green)'
                                : 'var(--muted)',
                              fontSize: '11px', fontWeight: 700,
                            }}
                          >
                            Stage {s}
                            <div style={{ fontSize: '9px', fontWeight: 400, opacity: 0.7, marginTop: 1 }}>
                              {s === 1 ? 'Performing' : s === 2 ? 'Underperform' : 'NPL'}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* DPD slider */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 500 }}>
                          Days Past Due (DPD)
                          <span style={{
                            marginLeft: 8, fontSize: '9px', padding: '1px 6px', borderRadius: 3,
                            background: whatIfDpd === curDpd ? '#F1F5F9' : '#FFF7ED',
                            color: whatIfDpd === curDpd ? 'var(--muted)' : '#9A3412',
                            fontWeight: 600,
                          }}>
                            {whatIfDpd === curDpd ? 'current' : 'modified'}
                          </span>
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: dpdColor(whatIfDpd), fontFamily: 'var(--mono)' }}>
                          {whatIfDpd}d
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={120}
                        value={whatIfDpd}
                        onChange={e => setWhatIfDpd(Number(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--navy)', cursor: 'pointer' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--muted)', marginTop: 2 }}>
                        <span>0</span><span>30</span><span>60</span><span>90</span><span>120</span>
                      </div>
                    </div>

                    {/* Reset button */}
                    {(whatIfDpd !== curDpd || whatIfStage !== curStage) && (
                      <button
                        onClick={() => { setWhatIfDpd(curDpd); setWhatIfStage(curStage) }}
                        style={{
                          marginTop: 12, fontSize: '10px', color: 'var(--muted)', background: 'none',
                          border: '1px solid var(--border)', borderRadius: 4, padding: '4px 10px',
                          cursor: 'pointer',
                        }}
                      >
                        ↺ Reset to current
                      </button>
                    )}
                  </div>

                  {/* Before → After */}
                  <div className="panel" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, fontWeight: 600 }}>
                      Risk Score Impact
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center' }}>

                      {/* Current */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Current</div>
                        <div style={{
                          padding: '12px 8px', borderRadius: 8,
                          background: `${wiColor(curScore)}12`,
                          border: `1px solid ${wiColor(curScore)}30`,
                        }}>
                          <div className="mono" style={{ fontSize: '28px', fontWeight: 900, color: wiColor(curScore), lineHeight: 1 }}>
                            {curPct}<span style={{ fontSize: 12 }}>%</span>
                          </div>
                          <div style={{ fontSize: '10px', color: wiColor(curScore), fontWeight: 700, marginTop: 3 }}>{wiLabel(curScore)}</div>
                          <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: 3 }}>Stage {curStage} · {curDpd}d DPD</div>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div style={{
                        fontSize: 20,
                        color: improved ? 'var(--green)' : worsened ? 'var(--red)' : 'var(--muted)',
                        fontWeight: 700,
                      }}>
                        {improved ? '↓' : worsened ? '↑' : '='}
                      </div>

                      {/* Scenario */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Scenario</div>
                        <div style={{
                          padding: '12px 8px', borderRadius: 8,
                          background: `${wiColor(scenScore)}12`,
                          border: `2px solid ${wiColor(scenScore)}50`,
                          boxShadow: `0 0 12px ${wiColor(scenScore)}20`,
                        }}>
                          <div className="mono" style={{ fontSize: '28px', fontWeight: 900, color: wiColor(scenScore), lineHeight: 1 }}>
                            {scenPct}<span style={{ fontSize: 12 }}>%</span>
                          </div>
                          <div style={{ fontSize: '10px', color: wiColor(scenScore), fontWeight: 700, marginTop: 3 }}>{scenLabel}</div>
                          <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: 3 }}>Stage {whatIfStage} · {whatIfDpd}d DPD</div>
                        </div>
                      </div>

                    </div>

                    {/* Delta pill */}
                    {delta !== 0 && (
                      <div style={{
                        marginTop: 12, padding: '7px 10px', borderRadius: 6, textAlign: 'center',
                        background: improved ? '#DCFCE7' : '#FEE2E2',
                        border: `1px solid ${improved ? '#86EFAC' : '#FECACA'}`,
                        fontSize: '11px', fontWeight: 700,
                        color: improved ? 'var(--green)' : 'var(--red)',
                      }}>
                        {improved ? '▼' : '▲'} {Math.abs(delta)} points — {improved ? 'risk improves' : 'risk worsens'}
                        {improved && delta <= -20 && ' significantly'}
                      </div>
                    )}
                    {delta === 0 && (
                      <div style={{
                        marginTop: 12, padding: '7px 10px', borderRadius: 6, textAlign: 'center',
                        background: '#F8FAFC', border: '1px solid var(--border)',
                        fontSize: '11px', color: 'var(--muted)',
                      }}>
                        No change from current state
                      </div>
                    )}
                  </div>

                  {/* PD Timeline */}
                  <div className="panel" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, fontWeight: 600 }}>
                      Probability of Default — Scenario Horizon
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {[
                        { label: '30-day PD',  value: pd30, col: '#3B82F6' },
                        { label: '60-day PD',  value: pd60, col: '#8B5CF6' },
                        { label: '90-day PD',  value: pd90, col: wiColor(scenScore) },
                      ].map(({ label, value, col }) => {
                        const pct = Math.round(value * 100)
                        return (
                          <div key={label} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '9px', color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
                            <div style={{
                              padding: '10px 6px', borderRadius: 6,
                              background: `${col}10`, border: `1px solid ${col}30`,
                            }}>
                              <div className="mono" style={{ fontSize: '20px', fontWeight: 800, color: col }}>{pct}%</div>
                            </div>
                            <div style={{ marginTop: 5, height: 3, background: 'var(--border)', borderRadius: 2 }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 2 }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                </div>
              )
            })()}
          </div>
        </div>

        {/* ── Right sidebar ─────────────────────────────────────── */}
        <div className="profile-right-sidebar">
          {/* Stage + ML score card */}
          <div style={{
            background: 'var(--navy)',
            borderRadius: 10,
            padding: '14px 16px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', bottom: -20, right: -20, width: 80, height: 80, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.1)', pointerEvents: 'none' }} />
            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.45)', marginBottom: 8, fontWeight: 600 }}>
              Risk Classification
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: pd !== null ? 12 : 0 }}>
              <span className={`badge ${stageBadge(profile.stage)}`} style={{ fontSize: '11px', padding: '4px 10px' }}>{profile.stage}</span>
              {riskFlag && riskFlag.risk_flag_count > 0 && (
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#F87171', background: 'rgba(239,68,68,0.15)', padding: '3px 8px', borderRadius: 4 }}>
                  {riskFlag.risk_flag_count} flag{riskFlag.risk_flag_count !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {pd !== null && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
                <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>ML Default Risk (90d)</div>
                <div className="mono" style={{ fontSize: '24px', fontWeight: 700, color: pd > 0.3 ? '#F87171' : pd > 0.1 ? '#FCD34D' : '#4ADE80', lineHeight: 1.1 }}>
                  {(pd * 100).toFixed(1)}%
                </div>
                {prediction?.risk_label && (
                  <div style={{ fontSize: '10px', color: pd > 0.3 ? '#F87171' : pd > 0.1 ? '#FCD34D' : '#4ADE80', marginTop: 3, fontWeight: 600 }}>
                    {prediction.risk_label}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Compare link */}
          <Link
            href={`/compare?a=${encodeURIComponent(clientId)}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 6, textDecoration: 'none',
              border: '1px solid var(--border)', fontSize: '11px', fontWeight: 600,
              color: 'var(--muted)',
              background: 'var(--card)',
              transition: 'all 0.15s',
            }}
          >
            ⇄ Compare with another client
          </Link>

          {/* Divider */}
          <div className="divider" style={{ margin: '2px 0' }} />

          {/* Client Management fields */}
          {(() => {
            const reviewFreq =
              profile.stage === 'Stage 3' ? 'Weekly' :
              profile.stage === 'Stage 2' ? 'Monthly' : 'Quarterly'
            const lastReview = caseHistory.length > 0
              ? caseHistory.reduce((latest, a) =>
                  a.createdAt > latest ? a.createdAt : latest,
                  caseHistory[0].createdAt)
              : null
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '3px' }}>Relationship Manager</div>
                  <div style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 500 }}>—</div>
                </div>
                <div>
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '3px' }}>Review Frequency</div>
                  <div style={{
                    display: 'inline-block', fontSize: '10px', fontWeight: 700,
                    padding: '2px 8px', borderRadius: '4px',
                    background: profile.stage === 'Stage 3' ? '#FEE2E2' : profile.stage === 'Stage 2' ? '#FEF3C7' : '#DCFCE7',
                    color: profile.stage === 'Stage 3' ? 'var(--red)' : profile.stage === 'Stage 2' ? '#92400E' : 'var(--green)',
                  }}>
                    {reviewFreq}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '3px' }}>Last Review</div>
                  <div className="mono" style={{ fontSize: '11px', color: 'var(--text)' }}>
                    {lastReview ? fmtDate(lastReview) : '—'}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Last model run */}
          {prediction?.prediction_date && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Last model run</span>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--text)' }}>{prediction.prediction_date}</span>
            </div>
          )}

          <div className="divider" style={{ margin: '2px 0' }} />

          {/* Transparency letter callout — Stage 2 / Stage 3 only */}
          {(profile.stage === 'Stage 2' || profile.stage === 'Stage 3') && (
            <>
              <div style={{
                padding: '10px 12px',
                borderRadius: '7px',
                border: `1px solid ${profile.stage === 'Stage 3' ? '#FCA5A5' : '#FCD34D'}`,
                background: profile.stage === 'Stage 3' ? '#FFF5F5' : '#FFFBEB',
                marginBottom: '4px',
              }}>
                <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: profile.stage === 'Stage 3' ? 'var(--red)' : '#92400E', marginBottom: '5px', fontWeight: 600 }}>
                  {profile.stage === 'Stage 3' ? '⚠ Stage 3 — NPL' : '⚠ Stage 2 — SICR'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '8px', lineHeight: '1.5' }}>
                  Transparency letter required. Generate AI insights to draft and send.
                </div>
                <button
                  className="act-btn"
                  onClick={() => {
                    setActiveTab('ai')
                    if (insights) setLetterOpen(true)
                  }}
                  style={{ background: profile.stage === 'Stage 3' ? '#FEE2E2' : '#FEF3C7', borderColor: profile.stage === 'Stage 3' ? '#FCA5A5' : '#FCD34D', color: profile.stage === 'Stage 3' ? '#991B1B' : '#92400E', fontSize: '11px', fontWeight: 600 }}
                >
                  ✉ {insights ? 'Open Transparency Letter' : 'Go to AI Insights →'}
                </button>
              </div>
            </>
          )}

          {/* Quick actions */}
          <div>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '8px' }}>Quick Actions</div>
            {([
              { action: 'Schedule Call',    icon: '📞', engagement: 'call'    as const },
              { action: 'Schedule Meeting', icon: '🗓', engagement: 'meeting' as const },
            ] as { action: string; icon: string; engagement: 'call' | 'meeting' }[]).map(({ action, icon, engagement }) => {
              const done    = engagementDone.has(action)
              const loading = engagementLoading === action
              return (
                <button
                  key={action}
                  className="act-btn"
                  disabled={done || loading}
                  onClick={() => openScheduleModal(engagement)}
                  style={{
                    background: done ? '#F0FDF4' : '#F8FAFC',
                    borderColor: done ? 'var(--green)' : 'var(--border)',
                    color: done ? 'var(--green)' : 'var(--text)',
                    opacity: loading ? 0.7 : 1,
                    fontSize: '11.5px',
                  }}
                >
                  <span style={{ marginRight: '6px' }}>{done ? '✓' : icon}</span>
                  {loading ? 'Scheduling…' : done ? `${action} scheduled` : action}
                </button>
              )
            })}
            <button
              className="act-btn"
              onClick={() => setRestructuringOpen(true)}
              style={{ background: activePlan ? '#F0FDF4' : '#F8FAFC', borderColor: activePlan ? 'var(--green)' : 'var(--border)', color: activePlan ? 'var(--green)' : 'var(--text)', fontSize: '11.5px' }}
            >
              <span style={{ marginRight: '6px' }}>📋</span>
              {activePlan ? 'View / Edit Plan' : 'Propose Restructuring'}
            </button>
            {[
              { action: 'Freeze Limit',      icon: '🔒' },
              { action: 'Request Documents', icon: '📄' },
            ].map(({ action, icon }) => {
              const isFreezeToggle = action === 'Freeze Limit'
              const done    = isFreezeToggle ? false : quickActionDone.has(action)
              const loading = quickActionLoading === action
              const displayLabel = isFreezeToggle ? (isFrozen ? 'Unfreeze Limit' : 'Freeze Limit') : action
              const displayIcon = isFreezeToggle ? (isFrozen ? '🔓' : '🔒') : icon
              return (
                <button
                  key={action}
                  className="act-btn"
                  disabled={done || loading}
                  onClick={() => logQuickAction(action)}
                  style={{
                    background: done ? '#F0FDF4' : '#F8FAFC',
                    borderColor: done ? 'var(--green)' : 'var(--border)',
                    color: done ? 'var(--green)' : 'var(--text)',
                    opacity: loading ? 0.7 : 1,
                    fontSize: '11.5px',
                  }}
                >
                  <span style={{ marginRight: '6px' }}>{done ? '✓' : displayIcon}</span>
                  {loading ? 'Logging...' : done ? `${displayLabel} logged` : displayLabel}
                </button>
              )
            })}
            {/* Escalate → Credit Committee */}
            {(() => {
              const done = quickActionDone.has('Escalate')
              return (
                <button
                  className="act-btn"
                  disabled={done || committeeSubmitting}
                  onClick={() => setCommitteeModalOpen(true)}
                  style={{
                    background: done ? '#FFF7ED' : '#FFF7ED',
                    borderColor: done ? 'var(--green)' : '#FED7AA',
                    color: done ? 'var(--green)' : '#9A3412',
                    opacity: committeeSubmitting ? 0.7 : 1,
                    fontSize: '11.5px',
                    fontWeight: 600,
                  }}
                >
                  <span style={{ marginRight: '6px' }}>{done ? '✓' : '⬆️'}</span>
                  {committeeSubmitting ? 'Escalating…' : done ? 'Escalated' : 'Escalate to Committee'}
                </button>
              )
            })()}
            {/* Initiate Recovery — Stage 3 only */}
            {profile.stage === 'Stage 3' && (
              <button
                className="act-btn"
                disabled={recoverySubmitting}
                onClick={openRecoveryModal}
                style={{
                  background: activeRecovery ? '#FEF9F0' : '#FFF7ED',
                  borderColor: '#FDBA74',
                  color: '#7C2D12',
                  fontSize: '11.5px',
                  fontWeight: 600,
                }}
              >
                <span style={{ marginRight: '6px' }}>{activeRecovery ? '⚠️' : '⚖️'}</span>
                {recoverySubmitting ? 'Saving…' : activeRecovery ? 'Update Recovery' : 'Initiate Recovery'}
              </button>
            )}
            {/* Upcoming scheduled salary */}
            {scheduledSalary && (
              <div style={{
                padding: '8px 12px', borderRadius: 8, marginBottom: 4,
                background: '#F0FDF4', border: '1px solid #86EFAC',
                fontSize: '11px', color: '#166534', lineHeight: 1.5,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>💰 Salary scheduled</div>
                <div>€{scheduledSalary.amount.toLocaleString()} · {new Date(scheduledSalary.scheduledDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                <div style={{ color: '#16A34A', fontSize: '10px' }}>{scheduledSalary.description}</div>
              </div>
            )}
            {/* Salary Sweep */}
            {(profile.stage === 'Stage 2' || profile.stage === 'Stage 3') && profile.current_due_days > 0 && (
              <button
                className="act-btn"
                disabled={sweepLoading || quickActionDone.has('Payment Sweep')}
                onClick={runSalarySweep}
                style={{
                  background: quickActionDone.has('Payment Sweep') ? '#F0FDF4' : sweepResult?.ok === false ? '#FEF2F2' : '#F8FAFC',
                  borderColor: quickActionDone.has('Payment Sweep') ? 'var(--green)' : sweepResult?.ok === false ? '#FECACA' : 'var(--border)',
                  color: quickActionDone.has('Payment Sweep') ? 'var(--green)' : sweepResult?.ok === false ? '#991B1B' : 'var(--text)',
                  opacity: sweepLoading ? 0.7 : 1,
                  fontSize: '11.5px',
                  fontWeight: 600,
                }}
              >
                <span style={{ marginRight: '6px' }}>
                  {quickActionDone.has('Payment Sweep') ? '✓' : sweepResult?.ok === false ? '✗' : '💸'}
                </span>
                {sweepLoading ? 'Running sweep…'
                  : quickActionDone.has('Payment Sweep')
                    ? `Swept €${sweepResult?.sweepAmount?.toFixed(2) ?? ''}`
                    : sweepResult?.ok === false ? sweepResult.reason ?? 'Not eligible'
                    : 'Run Salary Sweep'}
              </button>
            )}
            {/* Payment Reminder */}
            <button
              className="act-btn"
              disabled={notifyDone.has('payment_reminder')}
              onClick={() => setNotifyModal('payment_reminder')}
              style={{ background: notifyDone.has('payment_reminder') ? '#F0FDF4' : '#F8FAFC', borderColor: notifyDone.has('payment_reminder') ? 'var(--green)' : 'var(--border)', color: notifyDone.has('payment_reminder') ? 'var(--green)' : 'var(--text)', fontSize: '11.5px' }}
            >
              <span style={{ marginRight: '6px' }}>{notifyDone.has('payment_reminder') ? '✓' : '📅'}</span>
              {notifyDone.has('payment_reminder') ? 'Reminder Sent' : 'Payment Reminder'}
            </button>

            {/* Overdue Notice */}
            <button
              className="act-btn"
              disabled={notifyDone.has('overdue_notice')}
              onClick={() => setNotifyModal('overdue_notice')}
              style={{ background: notifyDone.has('overdue_notice') ? '#F0FDF4' : '#F8FAFC', borderColor: notifyDone.has('overdue_notice') ? 'var(--green)' : 'var(--border)', color: notifyDone.has('overdue_notice') ? 'var(--green)' : 'var(--text)', fontSize: '11.5px' }}
            >
              <span style={{ marginRight: '6px' }}>{notifyDone.has('overdue_notice') ? '✓' : '⚠️'}</span>
              {notifyDone.has('overdue_notice') ? 'Notice Sent' : 'Overdue Notice'}
            </button>

            {/* Legal Notice */}
            <button
              className="act-btn"
              disabled={notifyDone.has('legal_notice')}
              onClick={() => setNotifyModal('legal_notice')}
              style={{ background: notifyDone.has('legal_notice') ? '#F0FDF4' : '#FFF7ED', borderColor: notifyDone.has('legal_notice') ? 'var(--green)' : '#FED7AA', color: notifyDone.has('legal_notice') ? 'var(--green)' : '#9A3412', fontSize: '11.5px', fontWeight: 600 }}
            >
              <span style={{ marginRight: '6px' }}>{notifyDone.has('legal_notice') ? '✓' : '⚖️'}</span>
              {notifyDone.has('legal_notice') ? 'Legal Notice Sent' : 'Legal Notice'}
            </button>

            {/* Official Message */}
            <button
              className="act-btn"
              onClick={() => setNotifyModal('custom')}
              style={{ background: '#F8FAFC', borderColor: 'var(--border)', color: 'var(--text)', fontSize: '11.5px' }}
            >
              <span style={{ marginRight: '6px' }}>📋</span>
              Official Message
            </button>
          </div>

          {/* Mark Resolved */}
          <button
            className="act-btn"
            disabled={resolveLoading}
            onClick={() => isResolved ? handleUnresolve() : setResolveModalOpen(true)}
            style={{
              background:  isResolved ? '#F0FDF4' : '#F8FAFC',
              borderColor: isResolved ? '#86EFAC' : 'var(--border)',
              color:       isResolved ? '#16A34A' : 'var(--text)',
              opacity:     resolveLoading ? 0.7 : 1,
              fontSize:    '11.5px',
              fontWeight:  600,
            }}
          >
            <span style={{ marginRight: '6px' }}>{isResolved ? '✓' : '○'}</span>
            {resolveLoading
              ? (isResolved ? 'Removing…' : 'Resolving…')
              : (isResolved ? 'Unmark Resolved' : 'Mark Resolved')}
          </button>

          <div className="divider" style={{ margin: '2px 0' }} />

          {/* Back link */}
          <Link href="/clients" className="back-link" style={{ justifyContent: 'center' }}>
            ← All Clients
          </Link>
        </div>
      </div>

      {/* ── Restructuring modal ────────────────────────────────────────── */}
      {restructuringOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setRestructuringOpen(false)}
        >
          <div
            style={{ background: 'white', borderRadius: '10px', padding: '24px', maxWidth: '480px', width: '90%', maxHeight: '80vh', overflowY: 'auto', position: 'relative', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setRestructuringOpen(false)}
              style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}
              aria-label="Close"
            >×</button>

            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '4px' }}>Restructuring Plan</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '18px' }}>
              {activePlan ? 'Current Plan' : 'Propose New Plan'}
            </div>

            {/* Read-only view of existing plan */}
            {activePlan ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  ['Type',             (() => ({ LoanExtension: 'Loan Extension', PaymentHoliday: 'Payment Holiday', RateReduction: 'Rate Reduction', DebtConsolidation: 'Debt Consolidation', PartialWriteOff: 'Partial Write-Off' } as Record<string,string>)[activePlan.type] ?? activePlan.type)()],
                  ['Status',           activePlan.status],
                  activePlan.credit_id            ? ['Credit ID',          activePlan.credit_id] : null,
                  activePlan.new_maturity_date    ? ['New Maturity Date',   activePlan.new_maturity_date] : null,
                  activePlan.holiday_duration_months != null ? ['Holiday Duration', `${activePlan.holiday_duration_months} months`] : null,
                  activePlan.new_interest_rate    != null ? ['New Interest Rate',   `${activePlan.new_interest_rate}%`] : null,
                  activePlan.forgiven_amount      != null ? ['Forgiven Amount',     fmtEur(activePlan.forgiven_amount)] : null,
                  activePlan.approved_by          ? ['Approved By',         activePlan.approved_by] : null,
                  ['Proposed',         fmtDate(activePlan.created_at)],
                  activePlan.notes    ? ['Notes', activePlan.notes] : null,
                ].filter((x): x is [string, string] => x !== null).map(([label, value]) => (
                  <div key={label as string} className="detail-item">
                    <div className="detail-label">{label}</div>
                    <div className="detail-value">{value}</div>
                  </div>
                ))}
                <div style={{ marginTop: '6px', display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setRestructuringOpen(false)}
                    style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                  >
                    Close
                  </button>
                  <button
                    onClick={() => setActivePlan(null)}
                    style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: '#F8FAFC', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--muted)' }}
                  >
                    Propose New Plan
                  </button>
                </div>
              </div>
            ) : (
              /* New plan form */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Type selector */}
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>
                    Plan Type <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <select
                    value={rPlanType}
                    onChange={e => setRPlanType(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', background: 'white' }}
                  >
                    <option value="LoanExtension">Loan Extension</option>
                    <option value="PaymentHoliday">Payment Holiday</option>
                    <option value="RateReduction">Rate Reduction</option>
                    <option value="DebtConsolidation">Debt Consolidation</option>
                    <option value="PartialWriteOff">Partial Write-Off</option>
                  </select>
                </div>

                {/* Conditional fields */}
                {rPlanType === 'LoanExtension' && (
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>New Maturity Date</label>
                    <input
                      type="date"
                      value={rMaturityDate}
                      onChange={e => setRMaturityDate(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
                    />
                  </div>
                )}
                {rPlanType === 'PaymentHoliday' && (
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Holiday Duration (months)</label>
                    <input
                      type="number" min="1" step="1"
                      value={rHolidayMonths}
                      onChange={e => setRHolidayMonths(e.target.value)}
                      placeholder="e.g. 3"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
                    />
                  </div>
                )}
                {rPlanType === 'RateReduction' && (
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>New Interest Rate (%)</label>
                    <input
                      type="number" min="0.01" step="0.01"
                      value={rNewRate}
                      onChange={e => setRNewRate(e.target.value)}
                      placeholder="e.g. 4.5"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
                    />
                  </div>
                )}
                {(rPlanType === 'DebtConsolidation' || rPlanType === 'PartialWriteOff') && (
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Forgiven Amount (€)</label>
                    <input
                      type="number" min="0.01" step="0.01"
                      value={rForgivenAmount}
                      onChange={e => setRForgivenAmount(e.target.value)}
                      placeholder="e.g. 5000"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                {/* Optional credit ID */}
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Credit Account (optional)</label>
                  <input
                    type="text"
                    value={rCreditId}
                    onChange={e => setRCreditId(e.target.value)}
                    placeholder="Leave blank to apply to all credits"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Notes (optional)</label>
                  <textarea
                    value={rNotes}
                    onChange={e => setRNotes(e.target.value)}
                    rows={3}
                    placeholder="Rationale for the restructuring plan…"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setRestructuringOpen(false)}
                    style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={proposeRestructuring}
                    disabled={restructuringSubmitting}
                    style={{ flex: 2, padding: '9px', borderRadius: '6px', border: '1px solid var(--blue)', background: 'var(--blue)', color: 'white', fontSize: '12px', fontWeight: 600, cursor: restructuringSubmitting ? 'default' : 'pointer', fontFamily: 'var(--font)', opacity: restructuringSubmitting ? 0.7 : 1 }}
                  >
                    {restructuringSubmitting ? 'Submitting…' : 'Submit Proposal'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Committee escalation modal ─────────────────────────────────── */}
      {committeeModalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setCommitteeModalOpen(false)}
        >
          <div
            style={{ background: 'white', borderRadius: '10px', padding: '24px', maxWidth: '420px', width: '90%', position: 'relative', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setCommitteeModalOpen(false)}
              style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}
              aria-label="Close"
            >×</button>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: '#FEE2E2', border: '2px solid var(--red)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 800, color: 'var(--red)',
              }}>!</div>
              <div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--red)', fontWeight: 700 }}>Credit Committee</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Escalate for Review</div>
              </div>
            </div>

            {/* Client context */}
            <div style={{ padding: '10px 12px', background: '#FEF2F2', borderRadius: '7px', marginBottom: '16px', fontSize: '11.5px', color: '#991B1B', lineHeight: '1.5' }}>
              <strong>{profile.full_name || profile.personal_id}</strong> will be escalated to the credit committee.
              A formal review will be initiated with Decision = <strong>Pending</strong> until the committee responds.
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>
                Escalation Notes <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                value={committeeNotes}
                onChange={e => setCommitteeNotes(e.target.value)}
                placeholder="Reason for escalation, key risk signals, recommended action…"
                rows={3}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: '6px',
                  border: '1px solid var(--border)', fontSize: '12px',
                  fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setCommitteeModalOpen(false)}
                style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                Cancel
              </button>
              <button
                onClick={escalateToCommittee}
                disabled={committeeSubmitting}
                style={{
                  flex: 2, padding: '9px', borderRadius: '6px',
                  border: 'none', background: 'var(--red)', color: 'white',
                  fontSize: '12px', fontWeight: 700, cursor: committeeSubmitting ? 'default' : 'pointer',
                  fontFamily: 'var(--font)', opacity: committeeSubmitting ? 0.7 : 1,
                }}
              >
                {committeeSubmitting ? 'Escalating…' : 'Confirm Escalation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recovery modal ─────────────────────────────────────────────── */}
      {recoveryOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setRecoveryOpen(false)}
        >
          <div
            style={{ background: 'white', borderRadius: '10px', padding: '24px', maxWidth: '440px', width: '90%', position: 'relative', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setRecoveryOpen(false)}
              style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}
              aria-label="Close"
            >×</button>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: '#FFEDD5', border: '2px solid #EA580C',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 800, color: '#EA580C',
              }}>R</div>
              <div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#EA580C', fontWeight: 700 }}>Recovery</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                  {activeRecovery ? 'Update Recovery Case' : 'Initiate Recovery Case'}
                </div>
              </div>
            </div>

            {/* Stage */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Recovery Stage</label>
              <select
                value={rcStage}
                onChange={e => setRcStage(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', background: 'white', boxSizing: 'border-box' }}
              >
                <option value="DebtCollection">Debt Collection</option>
                <option value="CollateralEnforcement">Collateral Enforcement</option>
                <option value="LegalProceedings">Legal Proceedings</option>
                <option value="DebtSale">Debt Sale</option>
                <option value="WriteOff">Write-Off</option>
              </select>
            </div>

            {/* WriteOff warning */}
            {rcStage === 'WriteOff' && (
              <div style={{ padding: '10px 12px', background: '#FEE2E2', borderRadius: '7px', marginBottom: '14px', fontSize: '11.5px', color: '#991B1B', lineHeight: '1.5', borderLeft: '3px solid var(--red)' }}>
                <strong>Warning:</strong> Selecting Write-Off will permanently mark this client as written off and remove them from active portfolio KPIs.
                This action is logged in the audit trail.
              </div>
            )}

            {/* Assigned To */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>
                Assign To <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="text"
                value={rcAssignedTo}
                onChange={e => setRcAssignedTo(e.target.value)}
                placeholder="Officer or team name"
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
              />
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>
                Notes <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                value={rcNotes}
                onChange={e => setRcNotes(e.target.value)}
                placeholder="Recovery rationale, collateral details, legal instructions…"
                rows={3}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setRecoveryOpen(false)}
                style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                Cancel
              </button>
              <button
                onClick={initiateRecovery}
                disabled={recoverySubmitting}
                style={{
                  flex: 2, padding: '9px', borderRadius: '6px',
                  border: 'none', background: rcStage === 'WriteOff' ? 'var(--red)' : '#EA580C',
                  color: 'white', fontSize: '12px', fontWeight: 700,
                  cursor: recoverySubmitting ? 'default' : 'pointer',
                  fontFamily: 'var(--font)', opacity: recoverySubmitting ? 0.7 : 1,
                }}
              >
                {recoverySubmitting ? 'Saving…' : rcStage === 'WriteOff' ? 'Confirm Write-Off' : activeRecovery ? 'Update Recovery Case' : 'Create Recovery Case'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- Schedule Engagement Modal -- */}
      {scheduleModalType !== null && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setScheduleModalType(null)}
        >
          <div
            style={{ background: 'white', borderRadius: '10px', padding: '24px', maxWidth: '400px', width: '90%', position: 'relative', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setScheduleModalType(null)} style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }} aria-label="Close">×</button>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '4px' }}>
              {scheduleModalType === 'call' ? 'Schedule Call' : 'Schedule Meeting'}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '18px' }}>Pick a date &amp; time</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Date &amp; Time <span style={{ color: 'var(--red)' }}>*</span></label>
                <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Notes (optional)</label>
                <textarea value={scheduleNotes} onChange={e => setScheduleNotes(e.target.value)} rows={3} placeholder="Agenda or context..." style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={() => setScheduleModalType(null)} style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
                <button onClick={confirmScheduleEngagement} disabled={schedulingInFlight || !scheduleDate} style={{ flex: 2, padding: '9px', borderRadius: '6px', border: 'none', background: 'var(--navy)', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', opacity: (schedulingInFlight || !scheduleDate) ? 0.6 : 1 }}>
                  {schedulingInFlight ? 'Scheduling...' : `Confirm ${scheduleModalType === 'call' ? 'Call' : 'Meeting'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -- Resolve Modal -- */}
      {resolveModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setResolveModalOpen(false)}>
          <div style={{ background: 'white', borderRadius: '10px', padding: '24px', maxWidth: '380px', width: '90%', position: 'relative', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setResolveModalOpen(false)} style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>×</button>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '4px' }}>Risk Management</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>Mark Client as Resolved</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '18px', lineHeight: 1.5 }}>Records that the credit risk concern for this client has been addressed. The RiskPortfolio data is not modified.</div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Notes (optional)</label>
              <textarea
                value={resolveNotes}
                onChange={e => setResolveNotes(e.target.value)}
                rows={3}
                placeholder="Reason for resolution, e.g. debt restructured and payments resumed..."
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setResolveModalOpen(false)} style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
              <button onClick={handleResolve} disabled={resolveLoading} style={{ flex: 2, padding: '9px', borderRadius: '6px', border: 'none', background: '#16A34A', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', opacity: resolveLoading ? 0.6 : 1 }}>
                {resolveLoading ? 'Resolving…' : '✓ Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- Freeze Limit Modal -- */}
      {freezeModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setFreezeModalOpen(false)}>
          <div style={{ background: 'white', borderRadius: '10px', padding: '24px', maxWidth: '400px', width: '90%', position: 'relative', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setFreezeModalOpen(false)} style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }} aria-label="Close">×</button>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '4px' }}>Credit Limit</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>Freeze Client Limit</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '18px', lineHeight: 1.5 }}>This will record a formal credit limit freeze for this client and notify the team.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Reason (optional)</label>
                <textarea value={freezeReason} onChange={e => setFreezeReason(e.target.value)} rows={3} placeholder="Reason for freezing the credit limit..." style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={() => setFreezeModalOpen(false)} style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
                <button onClick={confirmFreezeLimit} disabled={freezeLoading} style={{ flex: 2, padding: '9px', borderRadius: '6px', border: 'none', background: '#1E3A5F', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', opacity: freezeLoading ? 0.6 : 1 }}>
                  {freezeLoading ? 'Freezing...' : '🔒 Confirm Freeze'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -- Unfreeze Limit Modal -- */}
      {unfreezeModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setUnfreezeModalOpen(false)}>
          <div style={{ background: 'white', borderRadius: '10px', padding: '24px', maxWidth: '400px', width: '90%', position: 'relative', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setUnfreezeModalOpen(false)} style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }} aria-label="Close">×</button>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '4px' }}>Credit Limit</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>Unfreeze Client Limit</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '18px', lineHeight: 1.5 }}>This will lift the formal credit limit freeze, resolve the active freeze record, and notify the team.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Reason (optional)</label>
                <textarea value={unfreezeReason} onChange={e => setUnfreezeReason(e.target.value)} rows={3} placeholder="Reason for unfreezing the credit limit..." style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={() => setUnfreezeModalOpen(false)} style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
                <button onClick={confirmUnfreezeLimit} disabled={unfreezeLoading} style={{ flex: 2, padding: '9px', borderRadius: '6px', border: 'none', background: '#065F46', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', opacity: unfreezeLoading ? 0.6 : 1 }}>
                  {unfreezeLoading ? 'Unfreezing...' : '🔓 Confirm Unfreeze'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -- Request Documents Modal -- */}
      {docModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDocModalOpen(false)}>
          <div style={{ background: 'white', borderRadius: '10px', padding: '24px', maxWidth: '440px', width: '90%', maxHeight: '80vh', overflowY: 'auto', position: 'relative', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setDocModalOpen(false)} style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }} aria-label="Close">×</button>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '4px' }}>Documents</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '18px' }}>Request Documents from Client</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>Select documents to request:</div>
                {[
                  'Pay Slips (3 months)',
                  'Bank Statements (6 months)',
                  'Tax Returns',
                  'Proof of Employment',
                  'Proof of Assets',
                  'Business Financial Statements',
                  'Property Valuation Report',
                  'Updated ID / Passport',
                  'Insurance Policy Documents',
                  'Other',
                ].map(doc => (
                  <label key={doc} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text)' }}>
                    <input type="checkbox" checked={!!docSelections[doc]} onChange={e => setDocSelections(prev => ({ ...prev, [doc]: e.target.checked }))} />
                    {doc}
                  </label>
                ))}
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Due Date (optional)</label>
                <input type="date" value={docDueDate} onChange={e => setDocDueDate(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Notes (optional)</label>
                <textarea value={docNotes} onChange={e => setDocNotes(e.target.value)} rows={2} placeholder="Additional instructions for the client..." style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={() => setDocModalOpen(false)} style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
                <button onClick={submitDocumentRequest} disabled={docLoading || !Object.values(docSelections).some(Boolean)} style={{ flex: 2, padding: '9px', borderRadius: '6px', border: 'none', background: 'var(--navy)', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', opacity: (docLoading || !Object.values(docSelections).some(Boolean)) ? 0.6 : 1 }}>
                  {docLoading ? 'Sending...' : '📄 Send Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Letter modal ───────────────────────────────────────────────── */}
      {letterOpen && insights && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setLetterOpen(false)}
        >
          <div
            style={{ background: 'white', borderRadius: '10px', padding: '24px', maxWidth: '580px', width: '90%', maxHeight: '80vh', overflowY: 'auto', position: 'relative', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setLetterOpen(false)}
              style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}
              aria-label="Close"
            >×</button>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '8px' }}>Transparency Letter</div>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>{insights.transparency_letter.subject}</div>
            <div style={{ fontSize: '13px', lineHeight: '1.8', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
              {insights.transparency_letter.salutation}{'\n\n'}{insights.transparency_letter.body}{'\n\n'}{insights.transparency_letter.closing}
            </div>
            <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  const text = `${insights.transparency_letter.salutation}\n\n${insights.transparency_letter.body}\n\n${insights.transparency_letter.closing}`
                  navigator.clipboard.writeText(text).catch(() => {})
                }}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: '#F8FAFC', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                📋 Copy Letter
              </button>
              <button
                onClick={() => setLetterOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      {/* -- Payment Reminder Modal -- */}
      {notifyModal === 'payment_reminder' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setNotifyModal(null)}>
          <div style={{ background: 'white', borderRadius: '10px', padding: '24px', maxWidth: '400px', width: '90%', position: 'relative', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setNotifyModal(null)} style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }} aria-label="Close">×</button>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '4px' }}>Notification</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>Payment Reminder</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '18px', lineHeight: 1.5 }}>Send a payment reminder message to the client.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Amount (optional)</label>
                <input type="number" min="0" step="0.01" value={notifyAmount} onChange={e => setNotifyAmount(e.target.value)} placeholder="Amount €" style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Due Date (optional)</label>
                <input type="date" value={notifyDueDate} onChange={e => setNotifyDueDate(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={() => setNotifyModal(null)} style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
                <button onClick={() => sendNotify('payment_reminder')} disabled={notifyLoading} style={{ flex: 2, padding: '9px', borderRadius: '6px', border: 'none', background: 'var(--navy)', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', opacity: notifyLoading ? 0.6 : 1 }}>
                  {notifyLoading ? 'Sending…' : '📅 Send Reminder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* -- Overdue Notice Modal -- */}
      {notifyModal === 'overdue_notice' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setNotifyModal(null)}>
          <div style={{ background: 'white', borderRadius: '10px', padding: '24px', maxWidth: '400px', width: '90%', position: 'relative', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setNotifyModal(null)} style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }} aria-label="Close">×</button>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '4px' }}>Notification</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>Overdue Payment Notice</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '18px', lineHeight: 1.5 }}>Notify the client of an overdue payment and request immediate action.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Overdue Amount (optional)</label>
                <input type="number" min="0" step="0.01" value={notifyAmount} onChange={e => setNotifyAmount(e.target.value)} placeholder="Amount €" style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Days Overdue (optional)</label>
                <input type="number" min="0" value={notifyDaysOverdue} onChange={e => setNotifyDaysOverdue(e.target.value)} placeholder="e.g. 30" style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={() => setNotifyModal(null)} style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
                <button onClick={() => sendNotify('overdue_notice')} disabled={notifyLoading} style={{ flex: 2, padding: '9px', borderRadius: '6px', border: 'none', background: '#B45309', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', opacity: notifyLoading ? 0.6 : 1 }}>
                  {notifyLoading ? 'Sending…' : '⚠️ Send Notice'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* -- Legal Notice Modal -- */}
      {notifyModal === 'legal_notice' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setNotifyModal(null)}>
          <div style={{ background: 'white', borderRadius: '10px', padding: '24px', maxWidth: '400px', width: '90%', position: 'relative', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setNotifyModal(null)} style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }} aria-label="Close">×</button>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '4px' }}>Legal</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>Pre-Legal Warning</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '18px', lineHeight: 1.5 }}>Send a formal pre-legal warning. The client will be informed that legal action will follow within 7 days if no payment is received.</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button onClick={() => setNotifyModal(null)} style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
              <button onClick={() => sendNotify('legal_notice')} disabled={notifyLoading} style={{ flex: 2, padding: '9px', borderRadius: '6px', border: 'none', background: '#7F1D1D', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', opacity: notifyLoading ? 0.6 : 1 }}>
                {notifyLoading ? 'Sending…' : '⚖️ Send Pre-Legal Warning'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* -- Custom Modal -- */}
      {notifyModal === 'custom' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setNotifyModal(null)}>
          <div style={{ background: 'white', borderRadius: '10px', padding: '24px', maxWidth: '440px', width: '90%', position: 'relative', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setNotifyModal(null)} style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }} aria-label="Close">×</button>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '4px' }}>Messaging</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>Send Official Message</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '18px', lineHeight: 1.5 }}>Compose an official bank communication to this client. Minimum 10 characters.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '5px' }}>Message</label>
                <textarea value={notifyCustomBody} onChange={e => setNotifyCustomBody(e.target.value)} rows={5} placeholder="Enter your official message here..." style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={() => setNotifyModal(null)} style={{ flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
                <button onClick={() => sendNotify('custom')} disabled={notifyLoading || notifyCustomBody.trim().length < 10} style={{ flex: 2, padding: '9px', borderRadius: '6px', border: 'none', background: 'var(--navy)', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', opacity: (notifyLoading || notifyCustomBody.trim().length < 10) ? 0.6 : 1 }}>
                  {notifyLoading ? 'Sending…' : '📋 Send Message'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <MessagingPanel clientId={clientId} clientName={profile.full_name || profile.personal_id} />
    </div>
  )
}


