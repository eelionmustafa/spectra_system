import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db.server'
import { clearAllCaches, recordRichClientAction } from '@/lib/queries'
import { createNotification } from '@/lib/notificationService'
import { upsertEWIPrediction } from '@/lib/ewiPredictionsService'

// ─── Risk scoring helpers (mirrors Python pipeline + warnings/actions.ts) ─────

function computeRiskScore(stage: number, dueDays: number): number {
  const base = stage === 3 ? 0.65 : stage === 2 ? 0.40 : 0.20
  const dpd  = dueDays >= 90 ? 0.25 : dueDays >= 60 ? 0.18 : dueDays >= 30 ? 0.10 : dueDays > 0 ? 0.04 : 0.0
  return Math.min(0.98, Math.max(0.05, base + dpd))
}

function riskLabel(score: number): string {
  if (score >= 0.75) return 'Critical'
  if (score >= 0.50) return 'High'
  if (score >= 0.30) return 'Medium'
  return 'Low'
}

function recommendedAction(score: number): string {
  if (score >= 0.75) return 'Escalate to recovery and initiate immediate legal review'
  if (score >= 0.50) return 'Call client immediately and place under intensive monitoring'
  if (score >= 0.30) return 'Add to watchlist and request supporting documents'
  return 'Monitor and schedule routine check-in'
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { creditAccount, personalId, newDueDays } = body

    if (!personalId) {
      return NextResponse.json({ error: 'personalId is required' }, { status: 400 })
    }
    if (typeof newDueDays !== 'number' || newDueDays < 0) {
      return NextResponse.json({ error: 'newDueDays must be a non-negative number' }, { status: 400 })
    }

    // Resolve credit account
    let resolvedAccount = creditAccount
    if (!resolvedAccount) {
      const rows = await query<{ CreditAccount: string }>(
        `SELECT TOP 1 CreditAccount FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
         WHERE PersonalID = @personalId ORDER BY dateID DESC`,
        { personalId }
      )
      resolvedAccount = rows[0]?.CreditAccount ?? null
    }
    if (!resolvedAccount) {
      return NextResponse.json({ error: 'No credit account found for this client' }, { status: 404 })
    }

    // Get current DueDays + latest dateID
    const prevRows = await query<{ DueDays: number | null; dateID: string }>(
      `SELECT TOP 1 DueDays, dateID FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
       WHERE CreditAccount = @creditAccount AND PersonalID = @personalId
       ORDER BY dateID DESC`,
      { personalId, creditAccount: resolvedAccount }
    )
    const previousDueDays = prevRows[0]?.DueDays ?? null
    const latestDateID    = prevRows[0]?.dateID ?? null

    // Get client's current Stage + exposure for rescoring
    const stageRows = await query<{ Stage: number; totalExposure: number | null }>(
      `SELECT TOP 1 COALESCE(Stage, 1) AS Stage, totalExposure
       FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
       WHERE clientID = @personalId
       ORDER BY CalculationDate DESC`,
      { personalId }
    )
    const stage    = stageRows[0]?.Stage ?? 1
    const exposure = stageRows[0]?.totalExposure ?? null

    // Get previous risk label from EWIPredictions for the change summary
    const prevEwiRows = await query<{ risk_label: string | null }>(
      `SELECT TOP 1 risk_label FROM [dbo].[EWIPredictions] WITH (NOLOCK)
       WHERE client_id = @personalId ORDER BY run_date DESC`,
      { personalId }
    ).catch(() => [] as { risk_label: string | null }[])
    const previousRiskLabel = prevEwiRows[0]?.risk_label ?? null

    // 1. Update DueDaysDaily — reset DPD to 0
    if (latestDateID) {
      await query(
        `UPDATE [dbo].[DueDaysDaily]
         SET DueDays = @newDueDays
         WHERE CreditAccount = @creditAccount AND PersonalID = @personalId AND dateID = @dateID`,
        { personalId, creditAccount: resolvedAccount, newDueDays, dateID: latestDateID }
      )
    } else {
      const todayStr = new Date().toISOString().slice(0, 10)
      await query(
        `INSERT INTO [dbo].[DueDaysDaily] (CreditAccount, PersonalID, dateID, DueDays)
         VALUES (@creditAccount, @personalId, @todayStr, @newDueDays)`,
        { personalId, creditAccount: resolvedAccount, todayStr, newDueDays }
      )
    }

    // 1b. If DPD cleared and client was Stage 3, migrate to Stage 2 (partial cure)
    if (newDueDays === 0 && stage === 3) {
      await query(
        `UPDATE [dbo].[RiskPortfolio]
         SET Stage = 2
         WHERE clientID = @personalId
           AND CalculationDate = (SELECT MAX(CalculationDate) FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE clientID = @personalId)`,
        { personalId }
      ).catch(() => {})
    }

    // 2. Update AmortizationPlan — mark overdue installments as fully paid
    await query(
      `UPDATE [dbo].[AmortizationPlan]
       SET OTPLATA = ANUITET
       WHERE PARTIJA = @creditAccount
         AND DATUMDOSPECA <= GETDATE()
         AND COALESCE(TRY_CAST(OTPLATA AS FLOAT), 0) < COALESCE(TRY_CAST(ANUITET AS FLOAT), 0)`,
      { creditAccount: resolvedAccount }
    ).catch(() => {})

    // 3. Record in ClientActions
    const actionNote = previousDueDays && previousDueDays > 0
      ? `Client cleared overdue balance (was ${previousDueDays} DPD). All outstanding installments marked as paid.`
      : `Payment received. Account brought up to date.`

    await recordRichClientAction(
      personalId,
      'Payment Received',
      'client_portal',
      actionNote,
      { creditAccount: resolvedAccount, previousDueDays, newDueDays, source: 'client_portal', paidAt: new Date().toISOString() }
    )

    // 4. Notifications
    await createNotification({
      clientId:         personalId,
      creditId:         resolvedAccount,
      notificationType: 'payment_received',
      priority:         'high',
      title:            'Payment Received',
      message:          `Client ${personalId} made a payment and cleared their overdue balance (was ${previousDueDays ?? 0} DPD). Account is now up to date.`,
      assignedRM:       null,
    }).catch(() => {})

    // 6. Recompute risk score + ML Default Risk and write to EWIPredictions
    //    Uses the same formula as the Python pipeline and warnings/actions.ts.
    //    DueDays is now newDueDays (0 for a full payment).
    const effectiveStage = (newDueDays === 0 && stage === 3) ? 2 : stage
    const newScore  = computeRiskScore(effectiveStage, newDueDays)
    const newLabel  = riskLabel(newScore)
    const newAction = recommendedAction(newScore)
    const signals   = [`Payment received — DueDays reset from ${previousDueDays ?? '?'} to ${newDueDays}`]
    const reasoning = `${newLabel} risk on the 90-day horizon (${Math.round(newScore * 100)}% PD). ${newAction}. Payment received — account brought up to date.`

    await upsertEWIPrediction({
      clientId:           personalId,
      riskScore:          newScore,
      deteriorationRisk:  newLabel,
      riskLabel:          newLabel,
      keySignals:         signals,
      aiReasoning:        reasoning,
      exposure:           typeof exposure === 'number' ? exposure : null,
      pd30d:              Math.max(0.05, newScore * 0.70),
      pd60d:              Math.max(0.05, newScore * 0.85),
      pd90d:              newScore,
      stageMigrationProb: effectiveStage >= 2 ? 0.05 : 0.02,
      dpdEscalationProb:  newDueDays > 0 ? 0.10 : 0.01,
      recommendedAction:  newAction,
      runDate:            new Date(),
    })

    // 5. DemoPaymentEvents — ensure table + columns exist (separate queries so SQL Server
    //    re-parses the INSERT after the schema changes are committed)
    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DemoPaymentEvents' AND schema_id = SCHEMA_ID('dbo'))
        CREATE TABLE [dbo].[DemoPaymentEvents] (
          id                  INT IDENTITY PRIMARY KEY,
          personalId          NVARCHAR(50)  NOT NULL,
          paid_at             DATETIME      NOT NULL DEFAULT GETDATE(),
          previous_due_days   INT           NULL,
          previous_risk_label NVARCHAR(32)  NULL,
          new_risk_label      NVARCHAR(32)  NULL
        )
    `, {})
    await query(`IF COL_LENGTH('dbo.DemoPaymentEvents','previous_due_days')   IS NULL ALTER TABLE [dbo].[DemoPaymentEvents] ADD previous_due_days   INT          NULL`, {})
    await query(`IF COL_LENGTH('dbo.DemoPaymentEvents','previous_risk_label') IS NULL ALTER TABLE [dbo].[DemoPaymentEvents] ADD previous_risk_label NVARCHAR(32) NULL`, {})
    await query(`IF COL_LENGTH('dbo.DemoPaymentEvents','new_risk_label')      IS NULL ALTER TABLE [dbo].[DemoPaymentEvents] ADD new_risk_label      NVARCHAR(32) NULL`, {})
    await query(
      `INSERT INTO [dbo].[DemoPaymentEvents] (personalId, paid_at, previous_due_days, previous_risk_label, new_risk_label)
       VALUES (@personalId, GETDATE(), @previousDueDays, @previousRiskLabel, @newLabel)`,
      { personalId, previousDueDays: previousDueDays ?? null, previousRiskLabel, newLabel }
    )

    clearAllCaches()

    // 7. Also try the local ML microservice for a proper model rescore (non-blocking)
    const rescoreUrl = `${req.nextUrl.origin}/api/ml/rescore`
    fetch(rescoreUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personalId }),
    }).catch(() => {})

    // 8. Auto-reset after 30s so next scan gets fresh data
    const resetDueDays = previousDueDays ?? 92
    const resetStage   = stage // original stage before payment
    setTimeout(async () => {
      try {
        // Restore DueDays
        await query(
          `UPDATE [dbo].[DueDaysDaily] SET DueDays = @resetDueDays
           WHERE CreditAccount = @creditAccount AND PersonalID = @personalId
             AND dateID = (SELECT MAX(dateID) FROM [dbo].[DueDaysDaily] WHERE PersonalID = @personalId)`,
          { personalId, creditAccount: resolvedAccount, resetDueDays }
        )
        // Restore Stage
        await query(
          `UPDATE [dbo].[RiskPortfolio] SET Stage = @resetStage
           WHERE clientID = @personalId
             AND CalculationDate = (SELECT MAX(CalculationDate) FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE clientID = @personalId)`,
          { personalId, resetStage }
        )
        // Remove post-payment EWI entry
        await query(
          `DELETE FROM [dbo].[EWIPredictions] WHERE client_id = @personalId AND run_date >= @since`,
          { personalId, since: new Date(Date.now() - 35000).toISOString() }
        )
        // Clear payment action
        await query(
          `DELETE FROM [dbo].[ClientActions] WHERE clientId = @personalId AND action = 'Payment Received'`,
          { personalId }
        )
        // Clear demo assignment so next scan picks a fresh client
        await query(
          `DELETE FROM [dbo].[DemoClientAssignments] WHERE client_id = @personalId`,
          { personalId }
        )
      } catch { /* silent — demo reset is best-effort */ }
    }, 30_000)

    return NextResponse.json({ ok: true, personalId, creditAccount: resolvedAccount, newDueDays, previousDueDays, newRiskScore: newScore, newRiskLabel: newLabel })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
