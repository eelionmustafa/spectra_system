import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { query } from '@/lib/db.server'
import { clearAllCaches } from '@/lib/queries'
import { createNotification } from '@/lib/notificationService'

// Derive IFRS 9 stage from DPD
function stageFromDPD(dpd: number): number {
  if (dpd >= 90) return 3
  if (dpd >= 30) return 2
  return 1
}

// Derive risk score (1–10) from DPD
function riskScoreFromDPD(dpd: number): number {
  if (dpd >= 90) return 9.5
  if (dpd >= 60) return 8.0
  if (dpd >= 30) return 6.5
  if (dpd >= 15) return 4.5
  if (dpd >= 1)  return 3.0
  return 1.5
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)

    const body = await req.json()
    const { creditAccount, personalId, newDueDays } = body

    if (!creditAccount || !personalId) {
      return NextResponse.json({ error: 'creditAccount and personalId are required' }, { status: 400 })
    }
    if (typeof newDueDays !== 'number' || newDueDays < 0 || newDueDays > 999) {
      return NextResponse.json({ error: 'newDueDays must be a number between 0 and 999' }, { status: 400 })
    }

    // 1. Get previous DPD
    const prevRows = await query<{ DueDays: string | null }>(
      `SELECT TOP 1 DueDays FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
       WHERE PersonalID = @personalId ORDER BY dateID DESC`,
      { personalId }
    )
    const previousDueDays = prevRows[0]?.DueDays ?? null
    const prevDpd = Number(previousDueDays ?? 0)

    // 2. Update DueDaysDaily
    const todayStr = new Date().toISOString().slice(0, 10)
    const exists = await query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[DueDaysDaily] WHERE PersonalID = @personalId AND dateID = @todayStr`,
      { personalId, todayStr }
    )
    if (exists[0]?.cnt > 0) {
      await query(
        `UPDATE [dbo].[DueDaysDaily] SET DueDays = @newDueDays WHERE PersonalID = @personalId AND dateID = @todayStr`,
        { personalId, todayStr, newDueDays: String(newDueDays) }
      )
    } else {
      await query(
        `INSERT INTO [dbo].[DueDaysDaily] (CreditAccount, PersonalID, dateID, DueDays) VALUES (@creditAccount, @personalId, @todayStr, @newDueDays)`,
        { personalId, creditAccount, todayStr, newDueDays: String(newDueDays) }
      )
    }

    // 3. Update RiskPortfolio — Stage + riskScore based on new DPD
    const newStage     = stageFromDPD(newDueDays)
    const newRiskScore = riskScoreFromDPD(newDueDays)
    const sicrFlagged  = newStage >= 2 ? 1 : 0

    // Get current exposure to keep it unchanged, and get CalculationDate
    const rpRows = await query<{ CalculationDate: string; totalExposure: string | null }>(
      `SELECT TOP 1 CalculationDate, totalExposure
       FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
       WHERE clientID = @personalId
       ORDER BY CalculationDate DESC`,
      { personalId }
    )

    if (rpRows.length > 0) {
      const calcDate = rpRows[0].CalculationDate
      // Only Stage is a stored column — risk_score is computed from Stage+DueDays in the SELECT
      await query(
        `UPDATE [dbo].[RiskPortfolio] SET Stage = @newStage WHERE clientID = @personalId AND CalculationDate = @calcDate`,
        { personalId, calcDate, newStage }
      )
    }

    // 4. Update EWIPredictions — pd_90d (ML Default Risk), dpd_escalation_prob, recommended_action
    const pd90 = newDueDays >= 90 ? 0.92 : newDueDays >= 60 ? 0.75 : newDueDays >= 30 ? 0.55 : newDueDays >= 15 ? 0.30 : 0.08
    const dpdEscProb = newDueDays >= 60 ? 0.85 : newDueDays >= 30 ? 0.60 : newDueDays >= 15 ? 0.35 : 0.10
    const stageMigProb = newStage === 3 ? 0.95 : newStage === 2 ? 0.55 : 0.10
    const recAction = newDueDays >= 90 ? 'Legal Review' : newDueDays >= 60 ? 'Escalate to Committee' : newDueDays >= 30 ? 'Restructure' : newDueDays >= 1 ? 'Outreach Call' : 'Monitor'
    const riskLabel = newDueDays >= 90 ? 'Default imminent' : newDueDays >= 60 ? 'Critical' : newDueDays >= 30 ? 'High' : newDueDays >= 1 ? 'Medium' : 'Low'

    const ewExists = await query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[EWIPredictions] WHERE client_id = @personalId`,
      { personalId }
    )
    if (ewExists[0]?.cnt > 0) {
      await query(
        `UPDATE [dbo].[EWIPredictions]
         SET pd_90d = @pd90, pd_30d = @pd30, pd_60d = @pd60,
             dpd_escalation_prob = @dpdEscProb, stage_migration_prob = @stageMigProb,
             recommended_action = @recAction, risk_label = @riskLabel,
             risk_score = @newRiskScore, deterioration_risk = @riskLabel,
             run_date = GETDATE()
         WHERE client_id = @personalId`,
        { personalId, pd90, pd30: pd90 * 0.6, pd60: pd90 * 0.8, dpdEscProb, stageMigProb, recAction, riskLabel, newRiskScore }
      )
    } else {
      await query(
        `INSERT INTO [dbo].[EWIPredictions] (client_id, risk_score, deterioration_risk, risk_label, pd_30d, pd_60d, pd_90d, dpd_escalation_prob, stage_migration_prob, recommended_action)
         VALUES (@personalId, @newRiskScore, @riskLabel, @riskLabel, @pd30, @pd60, @pd90, @dpdEscProb, @stageMigProb, @recAction)`,
        { personalId, newRiskScore, riskLabel, pd30: pd90 * 0.6, pd60: pd90 * 0.8, pd90, dpdEscProb, stageMigProb, recAction }
      )
    }

    clearAllCaches()

    // 4. Notification
    const priority: 'critical' | 'high' | 'medium' | 'low' =
      newDueDays >= 90 ? 'critical' :
      newDueDays >= 30 || (newDueDays === 0 && prevDpd > 0) ? 'high' :
      newDueDays > 0   ? 'medium' : 'low'

    const stageLabel = (s: number) => s === 3 ? 'Stage 3 (NPL)' : s === 2 ? 'Stage 2 (SICR)' : 'Stage 1'
    const prevStage  = stageFromDPD(prevDpd)

    const title = newDueDays === 0 && prevDpd > 0
      ? `Payment received — ${personalId} cleared delinquency`
      : newDueDays > prevDpd
      ? `DPD increased — ${personalId} now ${newDueDays}d overdue`
      : `Payment update — ${personalId} DPD set to ${newDueDays}d`

    const stageNote = newStage !== prevStage
      ? ` Stage updated: ${stageLabel(prevStage)} → ${stageLabel(newStage)}.` : ''

    const message = newDueDays === 0 && prevDpd > 0
      ? `Client ${personalId} made a payment clearing ${prevDpd}d past due. Account is now current. Risk score: ${riskScoreFromDPD(prevDpd)} → ${newRiskScore}.${stageNote}`
      : `DPD updated ${prevDpd}d → ${newDueDays}d for client ${personalId}. Risk score: ${riskScoreFromDPD(prevDpd)} → ${newRiskScore}.${stageNote}`

    await createNotification({
      clientId:         personalId,
      creditId:         creditAccount !== personalId ? creditAccount : null,
      notificationType: 'payment_event',
      priority,
      title,
      message,
      assignedRM:       null,
    })

    return NextResponse.json({
      ok: true, personalId, newDueDays, previousDueDays,
      newStage, newRiskScore, stageChanged: newStage !== prevStage,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
