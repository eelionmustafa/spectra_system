/**
 * SPECTRA Classification Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-time client stage reclassification based on live EWI signals and risk
 * score changes.
 *
 * Responsibilities:
 *  1. Derive the implied IFRS stage from current client signals.
 *  2. Compute a composite real-time risk score (0–100).
 *  3. Detect stage changes and write a SystemAction audit log entry.
 *  4. Notify the assigned RM via the Notifications table when stage changes.
 *  5. Expose processEWISignal() as the entry-point for EWI-fired events.
 *
 * Stage derivation mirrors evaluateSICR() in actionEngine.ts — both read from
 * the same SICR/TIER thresholds in config.ts. Keep them in sync.
 */

import { SICR, TIER } from '@/lib/config'
import { recordSystemAction, createNotification } from '@/lib/notificationService'
import { upsertClientMonitoring, stageToReviewFrequency } from '@/lib/monitoringService'
import { recordECLProvision, computeECLAmount, eclTypeForStage, ECL_RATES } from '@/lib/eclProvisionService'

// ─── Types ─────────────────────────────────────────────────────────────────

/** All signals required for real-time classification. */
export interface ClassificationSignals {
  pdScore:            number   // 0–1 from ML model
  currentDPD:         number   // days past due today
  missedPayments:     number
  salaryInflow:       string   // 'Normal'|'Alert'|'Stopped'|'Critical'
  overdraft:          string   // 'None'|'Active'|'Chronic'
  cardUsage:          string   // 'Normal'|'High'|'Critical'
  stageMigrationProb: number   // 0–1 from ML model
  ewiFlagCount:       number   // 0–6 count of active risk flags from risk_flags.csv
  productType:        string   // 'Consumer'|'Mortgage'|'Overdraft'|'Card'|'Micro'
}

export interface ClassificationResult {
  impliedStage:     1 | 2 | 3
  riskScore:        number     // 0–100 composite
  riskLabel:        string     // 'Low'|'Medium'|'High'|'Critical'
  sicrFlagged:      boolean
  sicrReason:       string
  stageChanged:     boolean
  oldStage:         number
  newStage:         number
  oldRiskScore:     number
  newRiskScore:     number
  triggeredSignals: string[]   // plain-English list of active triggers
}

// ─── Composite risk score (0–100) ─────────────────────────────────────────
// Weighted blend:
//   PD score    → 60 pts  (primary driver — ML probability of default)
//   DPD         → 25 pts  (lateness severity, capped at 90 days)
//   EWI breadth → 15 pts  (behavioural stress — how many flags are active)
//
// A client with PD 0.90, DPD 90, and all 6 EWI flags scores 100.
// A client with PD 0.20, DPD 0, and 0 flags scores 12.

export function computeRiskScore(s: ClassificationSignals): number {
  const pdComponent  = s.pdScore * 60
  const dpdComponent = (Math.min(s.currentDPD, 90) / 90) * 25
  const ewiComponent = (Math.min(s.ewiFlagCount, 6) / 6) * 15
  return Math.min(100, Math.round(pdComponent + dpdComponent + ewiComponent))
}

// ─── Risk label from composite score ─────────────────────────────────────

function riskScoreToLabel(score: number): string {
  if (score >= 85) return 'Critical'
  if (score >= 65) return 'High'
  if (score >= 40) return 'Medium'
  return 'Low'
}

// ─── Stage derivation ─────────────────────────────────────────────────────
// Mirrors evaluateSICR() in actionEngine.ts.
// Key difference: this function can also upgrade Stage 1 → 2 → 3 in a single
// pass, whereas evaluateSICR() only ever returns impliedStage = currentStage + 1.

export function deriveImpliedStage(
  s: ClassificationSignals,
  currentStage: number
): { stage: 1 | 2 | 3; reason: string; signals: string[] } {

  const triggered: string[] = []

  // ── Stage 2 or 3 → Stage 3 (NPL) ────────────────────────────────────────
  if (currentStage >= 2 && s.currentDPD >= SICR.NPL_DPD) {
    triggered.push(`DPD ${s.currentDPD} ≥ ${SICR.NPL_DPD}-day NPL definition (IFRS 9 §5.5.3)`)
    return { stage: 3, reason: triggered[0], signals: triggered }
  }

  // Mortgage Stage 2 → 3: lower DPD threshold because collateral is at risk
  if (
    currentStage >= 2 &&
    s.productType === 'Mortgage' &&
    s.pdScore >= TIER.CRITICAL_PD &&
    s.currentDPD >= SICR.MORTGAGE_DPD
  ) {
    triggered.push(
      `Mortgage ${s.currentDPD} DPD + PD ${Math.round(s.pdScore * 100)}% — secured Stage 3 criteria met`
    )
    return { stage: 3, reason: triggered[0], signals: triggered }
  }

  // ── Stage 1 → Stage 2 (SICR) ─────────────────────────────────────────────
  if (s.pdScore >= SICR.PD_THRESHOLD) {
    triggered.push(
      `PD ${Math.round(s.pdScore * 100)}% ≥ ${Math.round(SICR.PD_THRESHOLD * 100)}% SICR quantitative threshold`
    )
  }
  if (s.currentDPD >= SICR.DPD_BACKSTOP) {
    triggered.push(
      `${s.currentDPD} DPD ≥ ${SICR.DPD_BACKSTOP}-day backstop (IFRS 9 §B5.5.19 rebuttable presumption)`
    )
  }
  if (s.missedPayments >= SICR.MISSED_PAYMENTS) {
    triggered.push(`${s.missedPayments} missed payments — qualitative SICR backstop`)
  }
  if (s.salaryInflow === 'Stopped' && s.overdraft === 'Chronic') {
    triggered.push('Salary stopped + chronic overdraft — combined qualitative SICR signal')
  }
  if (s.stageMigrationProb >= SICR.STAGE_MIG_PROB) {
    triggered.push(
      `${Math.round(s.stageMigrationProb * 100)}% model stage migration probability ≥ ${Math.round(SICR.STAGE_MIG_PROB * 100)}% threshold`
    )
  }

  if (triggered.length > 0) {
    // If already Stage 2 or 3 stay there — SICR triggers don't downgrade
    const stage = currentStage >= 2 ? (currentStage as 2 | 3) : 2
    return { stage, reason: triggered.join('; '), signals: triggered }
  }

  // No triggers — stay at current stage (engine never auto-downgrades)
  const stable = Math.max(1, currentStage) as 1 | 2 | 3
  return { stage: stable, reason: 'No SICR triggers active', signals: [] }
}

// ─── Main classification function ─────────────────────────────────────────

interface ClassifyOpts {
  clientId:            string
  creditId:            string | null
  currentStage:        number
  currentRiskScore:    number   // previously stored composite score (0 = first run)
  signals:             ClassificationSignals
  assignedRM:          string   // username of RM who owns this client
  triggeredBy:         string   // 'ewi_signal:salary_stopped' | 'manual' | 'scheduled'
  /** Outstanding loan balance — when provided, ECL provision is auto-calculated on stage change. */
  outstandingBalance?: number
}

export async function classifyClient(opts: ClassifyOpts): Promise<ClassificationResult> {
  const { clientId, creditId, currentStage, currentRiskScore, signals, assignedRM, triggeredBy, outstandingBalance } = opts

  const newRiskScore = computeRiskScore(signals)
  const { stage: impliedStage, reason, signals: triggeredSignals } = deriveImpliedStage(signals, currentStage)
  const riskLabel   = riskScoreToLabel(newRiskScore)
  const sicrFlagged = triggeredSignals.length > 0 && impliedStage > currentStage
  const stageChanged = impliedStage !== currentStage

  const result: ClassificationResult = {
    impliedStage,
    riskScore:   newRiskScore,
    riskLabel,
    sicrFlagged,
    sicrReason:      reason,
    stageChanged,
    oldStage:        currentStage,
    newStage:        impliedStage,
    oldRiskScore:    currentRiskScore,
    newRiskScore,
    triggeredSignals,
  }

  // ── Persist when stage changes or risk score drifts ≥5 pts ───────────────
  const riskScoreDrift = Math.abs(newRiskScore - currentRiskScore)
  const shouldPersist  = stageChanged || riskScoreDrift >= 5

  if (shouldPersist) {
    const eventType = stageChanged ? 'stage_change' : 'risk_score_update'

    await recordSystemAction({
      clientId,
      creditId,
      eventType,
      oldStage:     currentStage,
      newStage:     impliedStage,
      oldRiskScore: currentRiskScore,
      newRiskScore,
      triggerReason: JSON.stringify({ reason, signals: triggeredSignals, triggeredBy }),
    })

    if (stageChanged) {
      const stageLabel = (n: number) =>
        n === 1 ? 'Stage 1 (Normal)' :
        n === 2 ? 'Stage 2 (SICR)'   :
                  'Stage 3 (NPL)'

      const priority: 'critical' | 'high' | 'medium' =
        impliedStage === 3 ? 'critical' :
        impliedStage === 2 ? 'high'     :
                             'medium'

      await createNotification({
        clientId,
        creditId,
        notificationType: 'stage_change',
        priority,
        title: `Stage reclassification: ${stageLabel(currentStage)} → ${stageLabel(impliedStage)}`,
        message:
          `Client ${clientId}${creditId ? ` (credit ${creditId})` : ''} automatically reclassified ` +
          `from ${stageLabel(currentStage)} to ${stageLabel(impliedStage)}. ` +
          `Trigger: ${reason}. ` +
          `Risk score: ${currentRiskScore} → ${newRiskScore}.`,
        assignedRM,
      })

      // ── Enhanced monitoring: review frequency + credit freeze ─────────────
      // Stage 1 = Monthly, Stage 2 = Weekly, Stage 3 = Daily.
      // Auto-freeze credit disbursements when client escalates to Stage 2 or 3.
      const reviewFreq   = stageToReviewFrequency(impliedStage)
      const shouldFreeze = impliedStage >= 2
      await upsertClientMonitoring(
        clientId,
        reviewFreq,
        shouldFreeze,
        shouldFreeze
          ? `Auto-frozen: escalated to ${stageLabel(impliedStage)} (trigger: ${reason})`
          : undefined
      )

      // ── IFRS 9 ECL provision ───────────────────────────────────────────────
      // Auto-calculate provision when outstanding balance is known.
      if (outstandingBalance != null && outstandingBalance > 0) {
        const stage        = impliedStage as 1 | 2 | 3
        const rate         = ECL_RATES[stage]
        const provisionAmt = computeECLAmount(stage, outstandingBalance)
        const eclType      = eclTypeForStage(stage)

        await recordECLProvision({ clientId, creditId, stage, outstandingBalance })

        // Log the provision change in SystemActions for full audit trail
        await recordSystemAction({
          clientId,
          creditId,
          eventType: 'provision_update',
          oldStage:     currentStage,
          newStage:     impliedStage,
          oldRiskScore: null,
          newRiskScore: null,
          triggerReason: JSON.stringify({
            stage,
            ecl_type:           eclType,
            provision_rate:     rate,
            provision_amount:   provisionAmt,
            outstanding_balance: outstandingBalance,
            triggeredBy:        'stage_change',
          }),
        })
      }
    }
  }

  return result
}

// ─── EWI signal entry-point ───────────────────────────────────────────────
// Called by POST /api/ewi/fire when a new EWI signal is received for a client.

export interface EWISignalPayload {
  clientId:            string
  creditId?:           string
  /** Which signal fired — used in the audit log trigger reason. */
  signal:              string   // e.g. 'salary_stopped' | 'overdraft_chronic' | 'dpd_change' | 'pd_update'
  currentStage:        number
  currentRiskScore:    number
  assignedRM:          string
  signals:             ClassificationSignals
  /** Outstanding loan balance — when provided, ECL provision is auto-calculated on stage change. */
  outstandingBalance?: number
}

export async function processEWISignal(payload: EWISignalPayload): Promise<ClassificationResult> {
  return classifyClient({
    clientId:            payload.clientId,
    creditId:            payload.creditId ?? null,
    currentStage:        payload.currentStage,
    currentRiskScore:    payload.currentRiskScore,
    signals:             payload.signals,
    assignedRM:          payload.assignedRM,
    triggeredBy:         `ewi_signal:${payload.signal}`,
    outstandingBalance:  payload.outstandingBalance,
  })
}
