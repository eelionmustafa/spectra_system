/**
 * SPECTRA Action Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts all available client signals into a prioritised, structured action
 * plan. Replaces the static tier → action-string mapping that was the previous
 * approach.
 *
 * Design principles:
 *  • Every action carries a trigger reason (WHY), urgency (WHEN), and role
 *    requirement (WHO). Actions are never just labels.
 *  • The engine never recommends an action that is already active.
 *  • SICR (Significant Increase in Credit Risk) is evaluated as a first-class
 *    check — it is a compliance requirement, not a display preference.
 *  • Product type changes the threshold for escalation (mortgage < consumer).
 *  • Signals are evaluated in priority order: DPD/Stage → PD → EWI → DTI/Cure.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Urgency = 'IMMEDIATE' | 'URGENT' | 'STANDARD' | 'ROUTINE'
export type ActionCategory =
  | 'contact'       // reach the client
  | 'restrict'      // freeze / limit facilities
  | 'legal'         // legal / recovery referral
  | 'restructure'   // renegotiate loan terms
  | 'monitor'       // watchlist / periodic review
  | 'investigate'   // gather information / request docs

export interface RecommendedAction {
  label:       string          // display text used in buttons
  urgency:     Urgency
  sla:         string          // human SLA: "Today" | "Within 24h" | "Within 7 days" | "Within 30 days"
  trigger:     string          // plain-English reason this action was selected
  category:    ActionCategory
  requiresRole: 'any' | 'risk_officer'
  destructive: boolean         // if true, never show "undo"
}

export interface SICRAssessment {
  flagged: boolean
  reason:  string
  impliedStage: 1 | 2 | 3      // what stage the signals imply, vs current IFRS stage
  currentStage: number
}

export interface ActionAssessment {
  actions:          RecommendedAction[]   // sorted by urgency, max 5
  sicr:             SICRAssessment
  urgencyHeadline:  string               // one-line summary
  tier:             'default-imminent' | 'deteriorating' | 'stable-watch'
  tierColor:        string
  tierBg:           string
  tierBorder:       string
}

/** All signals SPECTRA can collect for a client at assessment time. */
export interface ClientSignals {
  pdScore:             number    // 0–1
  riskLabel:           string    // 'Low'|'Medium'|'High'|'Default imminent'|'Critical'
  ifrsStage:           number    // 1, 2, or 3
  currentDPD:          number    // days past due today
  maxDPD12m:           number    // worst DPD in last 12 months
  missedPayments:      number
  totalPayments:       number
  dtiRatio:            number    // e.g. 45.3 (as %)
  cureRate:            number    // e.g. 12.5 (as %)
  salaryInflow:        string    // 'Normal'|'Alert'|'Stopped'|'Critical'
  overdraft:           string    // 'None'|'Active'|'Chronic'
  cardUsage:           string    // 'Normal'|'High'|'Critical'
  consecLates:         string    // e.g. '3 months' | '0 months'
  productType:         string    // 'Consumer'|'Mortgage'|'Overdraft'|'Card'|'Micro'
  stageMigrationProb:  number    // 0–1
  dpdEscalationProb:   number    // 0–1
  exposure:            number    // EUR
  activeActions:       string[]  // already-logged actions (prevents duplicates)
  topShapFactor:       string    // primary SHAP driver (e.g. 'exposure_growth_rate')
}

import { TIER, SICR, ACTIONS } from '@/lib/config'

// ─── Tier derivation (single source of truth) ─────────────────────────────────

export type Tier = 'default-imminent' | 'deteriorating' | 'stable-watch'

export const TIER_META: Record<Tier, {
  label: string; emoji: string; color: string; bg: string; border: string
}> = {
  'default-imminent': {
    label: 'Default Imminent', emoji: '🔴',
    color: '#9B1C1C', bg: '#FEF2F2', border: '#FECACA',
  },
  'deteriorating': {
    label: 'Deteriorating', emoji: '🟠',
    color: '#92400E', bg: '#FFFBEB', border: '#FDE68A',
  },
  'stable-watch': {
    label: 'Stable Watch', emoji: '🟢',
    color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0',
  },
}

/** Canonical tier derivation — replaces the duplicated getTier() in every page. */
export function deriveTier(riskLabel: string, pdScore: number): Tier {
  if (riskLabel === 'Default imminent' || riskLabel === 'Critical' || pdScore >= TIER.CRITICAL_PD)
    return 'default-imminent'
  if (riskLabel === 'High' || pdScore >= TIER.DETERIORATING_PD)
    return 'deteriorating'
  return 'stable-watch'
}


// ─── SICR evaluation ──────────────────────────────────────────────────────────

/**
 * Evaluate IFRS 9 SICR (Significant Increase in Credit Risk).
 * SICR = the point at which a Stage 1 loan must move to Stage 2
 *        (lifetime ECL provisioning kicks in).
 *
 * Primary triggers (IFRS 9 B5.5.1):
 *   1. Quantitative — PD has increased significantly since origination.
 *      SPECTRA uses a simplified threshold of PD ≥ 20% for Stage 1.
 *   2. DPD backstop — ≥ 30 DPD is a rebuttable presumption of SICR.
 *   3. Qualitative — missed payments, salary disruption, overdraft dependency.
 */
function evaluateSICR(s: Pick<ClientSignals,
  'ifrsStage' | 'pdScore' | 'currentDPD' | 'missedPayments' |
  'salaryInflow' | 'overdraft' | 'stageMigrationProb'>
): SICRAssessment {
  const base: SICRAssessment = {
    flagged: false, reason: '', impliedStage: s.ifrsStage as 1|2|3, currentStage: s.ifrsStage,
  }

  // Stage 3 candidates (Stage 2 that should likely be Stage 3)
  if (s.ifrsStage === 2 && s.currentDPD >= SICR.NPL_DPD) {
    return { ...base, flagged: true, impliedStage: 3,
      reason: `${s.currentDPD} DPD on a Stage 2 account — meets the ${SICR.NPL_DPD}-day NPL definition` }
  }
  if (s.ifrsStage === 2 && s.pdScore >= TIER.CRITICAL_PD && s.currentDPD >= SICR.MORTGAGE_DPD) {
    return { ...base, flagged: true, impliedStage: 3,
      reason: `Stage 2 with PD ${Math.round(s.pdScore*100)}% and ${s.currentDPD} DPD — Stage 3 reclassification warranted` }
  }

  // Stage 1 → Stage 2 SICR triggers
  if (s.ifrsStage !== 1) return base  // SICR only triggers upward migration from Stage 1

  if (s.pdScore >= SICR.PD_THRESHOLD) {
    return { ...base, flagged: true, impliedStage: 2,
      reason: `PD ${Math.round(s.pdScore*100)}% exceeds ${Math.round(SICR.PD_THRESHOLD*100)}% SICR threshold — Stage 2 reclassification required` }
  }
  if (s.currentDPD >= SICR.DPD_BACKSTOP) {
    return { ...base, flagged: true, impliedStage: 2,
      reason: `${s.currentDPD} DPD — IFRS 9 DPD backstop (≥${SICR.DPD_BACKSTOP} days is a rebuttable presumption of SICR)` }
  }
  if (s.missedPayments >= SICR.MISSED_PAYMENTS) {
    return { ...base, flagged: true, impliedStage: 2,
      reason: `${s.missedPayments} missed payments — qualitative SICR indicator` }
  }
  if (s.salaryInflow === 'Stopped' && s.overdraft === 'Chronic') {
    return { ...base, flagged: true, impliedStage: 2,
      reason: 'Salary stopped + chronic overdraft dependency — combined qualitative SICR signal' }
  }
  if (s.stageMigrationProb >= SICR.STAGE_MIG_PROB) {
    return { ...base, flagged: true, impliedStage: 2,
      reason: `Model assigns ${Math.round(s.stageMigrationProb*100)}% stage migration probability — SICR threshold exceeded` }
  }

  return base
}

// ─── Core engine ──────────────────────────────────────────────────────────────

export function assess(s: ClientSignals): ActionAssessment {
  const actions: RecommendedAction[] = []
  const active = new Set(s.activeActions.map(a => a.toLowerCase().trim()))

  const push = (a: RecommendedAction) => {
    // Skip if already active
    if (active.has(a.label.toLowerCase())) return
    actions.push(a)
  }

  const isMortgage  = s.productType === 'Mortgage'
  const isCard      = s.productType === 'Card'
  const isOverdraft = s.productType === 'Overdraft'
  const pdPct       = Math.round(s.pdScore * 100)

  // ── IMMEDIATE ───────────────────────────────────────────────────────────────

  // Stage 3 / NPL: legal & recovery are non-negotiable
  if (s.ifrsStage === 3 || s.currentDPD >= SICR.NPL_DPD) {
    push({
      label: 'Escalate → Recovery',
      urgency: 'IMMEDIATE', sla: 'Today',
      trigger: s.currentDPD >= SICR.NPL_DPD
        ? `${s.currentDPD} DPD — ${SICR.NPL_DPD}-day NPL definition met, recovery team must be engaged`
        : 'IFRS Stage 3 (credit impaired) — mandatory recovery referral',
      category: 'legal', requiresRole: 'risk_officer', destructive: true,
    })
    push({
      label: 'Legal Review',
      urgency: 'IMMEDIATE', sla: 'Today',
      trigger: 'Required for all Stage 3 / 90+ DPD accounts per credit policy',
      category: 'legal', requiresRole: 'risk_officer', destructive: true,
    })
  }

  // Mortgage: lower DPD threshold than consumer (collateral at risk)
  if (isMortgage && s.currentDPD >= SICR.MORTGAGE_DPD && s.ifrsStage < 3) {
    push({
      label: 'Legal Review',
      urgency: 'IMMEDIATE', sla: 'Today',
      trigger: `Mortgage ${s.currentDPD} DPD (≥${SICR.MORTGAGE_DPD}) — property collateral at risk, foreclosure evaluation required`,
      category: 'legal', requiresRole: 'risk_officer', destructive: true,
    })
  }

  // High PD + active DPD + salary stopped = maximum risk confluence → freeze
  if (s.pdScore >= ACTIONS.FREEZE_PD && s.currentDPD >= ACTIONS.FREEZE_DPD && s.salaryInflow === 'Stopped'
      && !active.has('freeze account')) {
    push({
      label: 'Freeze Account',
      urgency: 'IMMEDIATE', sla: 'Today',
      trigger: `PD ${pdPct}% + salary stopped + ${s.currentDPD} DPD — three concurrent risk signals`,
      category: 'restrict', requiresRole: 'risk_officer', destructive: true,
    })
  }

  // ── URGENT ──────────────────────────────────────────────────────────────────

  // High PD + active DPD: contact before situation worsens
  if (s.pdScore >= ACTIONS.URGENT_CALL_PD && s.currentDPD >= ACTIONS.URGENT_CALL_DPD_MIN && s.currentDPD < ACTIONS.URGENT_CALL_DPD_MAX
      && s.ifrsStage < 3) {
    push({
      label: 'Call Now',
      urgency: 'URGENT', sla: 'Within 24h',
      trigger: `PD ${pdPct}% — ${s.currentDPD} DPD outstanding, contact to arrange payment`,
      category: 'contact', requiresRole: 'any', destructive: false,
    })
  }

  // Salary stopped: request documentation regardless of DPD (leading indicator)
  if (s.salaryInflow === 'Stopped') {
    push({
      label: 'Request salary documentation',
      urgency: 'URGENT', sla: 'Within 24h',
      trigger: 'No salary credit detected — confirm employment status and income continuity',
      category: 'investigate', requiresRole: 'any', destructive: false,
    })
  } else if (s.salaryInflow === 'Alert') {
    push({
      label: 'Request salary documentation',
      urgency: 'STANDARD', sla: 'Within 7 days',
      trigger: 'Salary inflow below normal threshold — monitor income stability',
      category: 'investigate', requiresRole: 'any', destructive: false,
    })
  }

  // High stage migration probability → watchlist now
  if (s.stageMigrationProb >= SICR.STAGE_MIG_PROB && !active.has('add to watchlist')) {
    push({
      label: 'Add to Watchlist',
      urgency: 'URGENT', sla: 'Within 24h',
      trigger: `${Math.round(s.stageMigrationProb * 100)}% stage migration probability — formal monitoring required`,
      category: 'monitor', requiresRole: 'any', destructive: false,
    })
  }

  // Deteriorating PD + no current DPD: proactive contact before arrears start
  if (s.pdScore >= ACTIONS.URGENT_CALL_PD && s.currentDPD === 0 && s.dpdEscalationProb >= ACTIONS.DPD_ESCALATION_PROB) {
    push({
      label: 'Schedule Call',
      urgency: 'URGENT', sla: 'Within 24h',
      trigger: `PD ${pdPct}% — ${Math.round(s.dpdEscalationProb*100)}% DPD escalation risk. Preventive contact before arrears occur`,
      category: 'contact', requiresRole: 'any', destructive: false,
    })
  }

  // ── STANDARD ────────────────────────────────────────────────────────────────

  // Stage 2 with elevated DPD escalation → restructuring review
  if (s.ifrsStage === 2 && (s.dpdEscalationProb >= ACTIONS.STAGE2_RESTRUCTURE_PROB || s.currentDPD >= ACTIONS.STAGE2_RESTRUCTURE_DPD)) {
    push({
      label: 'Restructure',
      urgency: 'STANDARD', sla: 'Within 7 days',
      trigger: s.currentDPD >= ACTIONS.STAGE2_RESTRUCTURE_DPD
        ? `Stage 2, ${s.currentDPD} DPD — loan restructuring may prevent Stage 3`
        : `Stage 2, ${Math.round(s.dpdEscalationProb*100)}% DPD escalation risk — early restructuring opportunity`,
      category: 'restructure', requiresRole: 'risk_officer', destructive: false,
    })
  }

  // Chronic overdraft: structural liquidity problem
  if (s.overdraft === 'Chronic') {
    push({
      label: isOverdraft ? 'Reduce overdraft facility' : 'Review overdraft facility',
      urgency: 'STANDARD', sla: 'Within 7 days',
      trigger: 'Chronic overdraft usage (3+ consecutive months) — structural liquidity risk indicator',
      category: 'investigate', requiresRole: 'any', destructive: false,
    })
  }

  // High DTI: client may be over-leveraged
  if (s.dtiRatio >= ACTIONS.DTI_RESTRUCTURE) {
    push({
      label: 'Debt restructuring consultation',
      urgency: 'STANDARD', sla: 'Within 7 days',
      trigger: `DTI ${s.dtiRatio.toFixed(0)}% — above ${ACTIONS.DTI_RESTRUCTURE}% threshold, debt servicing sustainability at risk`,
      category: 'restructure', requiresRole: 'risk_officer', destructive: false,
    })
  }

  // Card at limit: behavioural stress signal
  if (isCard && s.cardUsage === 'Critical') {
    push({
      label: 'Card limit review',
      urgency: 'STANDARD', sla: 'Within 7 days',
      trigger: 'Card utilisation at or above limit — liquidity stress behaviour',
      category: 'investigate', requiresRole: 'any', destructive: false,
    })
  } else if (s.cardUsage === 'Critical' && !isCard) {
    push({
      label: 'Review credit facilities',
      urgency: 'STANDARD', sla: 'Within 7 days',
      trigger: 'Card utilisation critical — client may be drawing on all credit lines',
      category: 'investigate', requiresRole: 'any', destructive: false,
    })
  }

  // Zero cure rate on a delinquent client: no track record of recovery
  if (s.cureRate === 0 && s.missedPayments >= 2 && s.ifrsStage >= 2) {
    push({
      label: 'Request financial statements',
      urgency: 'STANDARD', sla: 'Within 7 days',
      trigger: `0% cure rate — ${s.missedPayments} missed payments with no recovery history`,
      category: 'investigate', requiresRole: 'any', destructive: false,
    })
  }

  // ── ROUTINE ──────────────────────────────────────────────────────────────────

  // Watchlist (if not already) for moderate risk
  if (s.pdScore >= ACTIONS.WATCHLIST_ROUTINE_LOW && s.pdScore < ACTIONS.WATCHLIST_ROUTINE_HIGH && !active.has('add to watchlist')) {
    push({
      label: 'Add to Watchlist',
      urgency: 'ROUTINE', sla: 'Within 30 days',
      trigger: `PD ${pdPct}% — preventive watchlist monitoring`,
      category: 'monitor', requiresRole: 'any', destructive: false,
    })
  }

  // Stage 2 periodic review
  if (s.ifrsStage === 2 && !active.has('flag for review')) {
    push({
      label: 'Flag for Review',
      urgency: 'ROUTINE', sla: 'Within 30 days',
      trigger: 'IFRS Stage 2 — requires periodic credit review per policy',
      category: 'monitor', requiresRole: 'any', destructive: false,
    })
  }

  // Low risk but PD emerging
  if (s.pdScore >= ACTIONS.MONITOR_PD_LOW && s.pdScore < ACTIONS.MONITOR_PD_HIGH && s.currentDPD === 0) {
    push({
      label: 'Monthly Monitor',
      urgency: 'ROUTINE', sla: 'Within 30 days',
      trigger: `PD ${pdPct}% — emerging risk signal, preventive monitoring`,
      category: 'monitor', requiresRole: 'any', destructive: false,
    })
  }

  // Fallback: always at least one action
  if (actions.length === 0) {
    push({
      label: 'Monthly Monitor',
      urgency: 'ROUTINE', sla: 'Within 30 days',
      trigger: 'No acute risk signals — maintain standard monitoring frequency',
      category: 'monitor', requiresRole: 'any', destructive: false,
    })
  }

  // ── Deduplicate labels (same label may have been added from multiple rules) ─
  const seen = new Set<string>()
  const deduped = actions.filter(a => { if (seen.has(a.label)) return false; seen.add(a.label); return true })

  // ── Sort: IMMEDIATE → URGENT → STANDARD → ROUTINE ─────────────────────────
  const urgencyOrder: Record<Urgency, number> = { IMMEDIATE: 0, URGENT: 1, STANDARD: 2, ROUTINE: 3 }
  deduped.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])

  const top5 = deduped.slice(0, 5)

  // ── Tier + styling ──────────────────────────────────────────────────────────
  const tier = deriveTier(s.riskLabel, s.pdScore)
  const tm   = TIER_META[tier]

  // ── SICR ────────────────────────────────────────────────────────────────────
  const sicr = evaluateSICR({
    ifrsStage:          s.ifrsStage,
    pdScore:            s.pdScore,
    currentDPD:         s.currentDPD,
    missedPayments:     s.missedPayments,
    salaryInflow:       s.salaryInflow,
    overdraft:          s.overdraft,
    stageMigrationProb: s.stageMigrationProb,
  })

  // ── Urgency headline ────────────────────────────────────────────────────────
  const top = top5[0]
  const urgencyHeadline =
    top.urgency === 'IMMEDIATE' ? `Immediate action required today — ${top.label}` :
    top.urgency === 'URGENT'    ? `Urgent — action required within 24–48 hours` :
    top.urgency === 'STANDARD'  ? `Action required within 7 days` :
                                  'Routine monitoring — no acute risk'

  return {
    actions:         top5,
    sicr,
    urgencyHeadline,
    tier,
    tierColor:       tm.color,
    tierBg:          tm.bg,
    tierBorder:      tm.border,
  }
}
