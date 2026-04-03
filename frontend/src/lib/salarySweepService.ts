/**
 * SPECTRA Salary Sweep Service
 * ---------------------------------------------------------------------------
 * Detects when a salary credit arrives for a client who has overdue scheduled
 * payments, records a Payment Sweep in ClientActions, and notifies the client.
 *
 * SPECTRA is a read-only overlay on the core banking DB.
 * This service READS from TAccounts/AmortizationPlan and WRITES to
 * ClientActions + Notifications (SPECTRA-owned tables).
 *
 * Sweep eligibility:
 *   1. Client has at least one overdue instalment (due_date < today, unpaid)
 *   2. A credit transaction >= MIN_SALARY_AMOUNT arrived in the last LOOKBACK_DAYS
 *   3. No Payment Sweep has already been recorded in the last 25 days (dedup)
 */

import { query } from '@/lib/db.server'
import { recordRichClientAction } from '@/lib/queries'
import { createNotification } from '@/lib/notificationService'
import { detectScheduledSalaryCredit } from '@/lib/scheduledSalaryService'

const MIN_SALARY_AMOUNT = 300
const LOOKBACK_DAYS     = 5
const DEDUP_DAYS        = 25

export interface SalaryCredit {
  accountNo:   string
  amount:      number
  date:        string
  description: string
}

export interface OverdueInstalment {
  creditAccount:  string
  productType:    string
  dueDate:        string
  overdueAmount:  number
}

export interface SweepResult {
  clientId:      string
  eligible:      boolean
  reason?:       string
  salaryCredit?: SalaryCredit
  overdueTotal:  number
  sweepAmount:   number
  instalments:   OverdueInstalment[]
  alreadySwept:  boolean
  actionId?:     string
}

export async function detectSalaryCredit(clientId: string): Promise<SalaryCredit | null> {
  const rows = await query<{ account_no: string; amount: number; date: string; description: string }>(
    `SELECT TOP 1
       ta.NoAccount                                              AS account_no,
       COALESCE(TRY_CAST(ta.Amount AS FLOAT), 0)               AS amount,
       CONVERT(VARCHAR(10), TRY_CAST(ta.Date AS DATE), 23)     AS date,
       COALESCE(ta.TDescription1, '')               AS description
     FROM [dbo].[TAccounts] ta WITH (NOLOCK)
     JOIN [dbo].[Accounts] a WITH (NOLOCK) ON a.NoAccount = ta.NoAccount
     WHERE a.NoAccount IN (
       SELECT DISTINCT cr.NoAccount
       FROM [dbo].[Credits] cr WITH (NOLOCK)
       WHERE cr.NoCredit IN (
         SELECT contractNumber
         FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
         WHERE TRY_CAST(clientID AS BIGINT) = TRY_CAST(@clientId AS BIGINT)
       )
       AND cr.NoAccount IS NOT NULL
       AND LTRIM(RTRIM(cr.NoAccount)) != ''
     )
     AND TRY_CAST(ta.Amount AS FLOAT) >= @minAmount
     AND TRY_CAST(ta.Date AS DATE) >= CAST(DATEADD(day, -@lookback, GETDATE()) AS DATE)
     ORDER BY TRY_CAST(ta.Amount AS FLOAT) DESC`,
    { clientId, minAmount: MIN_SALARY_AMOUNT, lookback: LOOKBACK_DAYS }
  )
  if (!rows[0]) {
    // Fallback: check ScheduledSalaryCredits (demo/scheduled entries)
    return detectScheduledSalaryCredit(clientId)
  }
  return {
    accountNo:   rows[0].account_no,
    amount:      rows[0].amount,
    date:        rows[0].date,
    description: rows[0].description,
  }
}

export async function getOverdueInstalments(clientId: string): Promise<OverdueInstalment[]> {
  const rows = await query<{ credit_account: string; product_type: string; due_date: string; overdue_amount: number }>(
    `SELECT TOP 20
       ap.PARTIJA                                                 AS credit_account,
       COALESCE(cr.TypeOfCalculatioin, 'Loan')           AS product_type,
       CONVERT(VARCHAR(10), ap.DATUMDOSPECA, 23)                 AS due_date,
       COALESCE(TRY_CAST(ap.RATA AS FLOAT), 0)
         - COALESCE(TRY_CAST(ap.OTPLATA AS FLOAT), 0)           AS overdue_amount
     FROM [dbo].[AmortizationPlan] ap WITH (NOLOCK)
     LEFT JOIN [dbo].[Credits] cr WITH (NOLOCK)
       ON cr.NoCredit = ap.PARTIJA
     WHERE TRY_CAST(ap.PersonalID AS BIGINT) = TRY_CAST(@clientId AS BIGINT)
       AND COALESCE(TRY_CAST(ap.OTPLATA AS FLOAT), 0)
           < COALESCE(TRY_CAST(ap.RATA AS FLOAT), 0)
       AND ap.DATUMDOSPECA < GETDATE()
       AND ap.DATUMDOSPECA IS NOT NULL
     ORDER BY ap.DATUMDOSPECA ASC`,
    { clientId }
  )
  return rows.map(r => ({
    creditAccount: r.credit_account,
    productType:   r.product_type,
    dueDate:       r.due_date,
    overdueAmount: r.overdue_amount,
  }))
}

async function recentSweepExists(clientId: string): Promise<boolean> {
  try {
    const rows = await query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt
       FROM [dbo].[ClientActions] WITH (NOLOCK)
       WHERE clientId = @clientId
         AND action = 'Payment Sweep'
         AND createdAt >= DATEADD(day, -@dedupDays, GETDATE())`,
      { clientId, dedupDays: DEDUP_DAYS }
    )
    return (rows[0]?.cnt ?? 0) > 0
  } catch {
    return false
}
}

export async function executeSweep(
  clientId:  string,
  executor:  string = 'SYSTEM'
): Promise<SweepResult> {
  const base: SweepResult = {
    clientId,
    eligible:     false,
    overdueTotal: 0,
    sweepAmount:  0,
    instalments:  [],
    alreadySwept: false,
}

  const alreadySwept = await recentSweepExists(clientId)
  if (alreadySwept) {
    return { ...base, alreadySwept: true, reason: 'Payment sweep already recorded this month' }
}

  const salaryCredit = await detectSalaryCredit(clientId)
  if (!salaryCredit) {
    return { ...base, reason: `No credit >=EUR${MIN_SALARY_AMOUNT} found in last ${LOOKBACK_DAYS} days` }
}

  const instalments = await getOverdueInstalments(clientId)
  if (!instalments.length) {
    return { ...base, salaryCredit, reason: 'No overdue instalments found' }
}

  const overdueTotal = instalments.reduce((s, i) => s + i.overdueAmount, 0)
  const sweepAmount  = Math.min(salaryCredit.amount, overdueTotal)

  const metadata = {
    salary_credit_account: salaryCredit.accountNo,
    salary_credit_amount:  salaryCredit.amount,
    salary_credit_date:    salaryCredit.date,
    overdue_total:         overdueTotal,
    sweep_amount:          sweepAmount,
    instalments_count:     instalments.length,
    instalments:           instalments.map(i => ({
      credit_account: i.creditAccount,
      product_type:   i.productType,
      due_date:       i.dueDate,
      overdue_amount: i.overdueAmount,
    })),
  }

  const notes = `Salary credit of EUR${sweepAmount.toFixed(2)} applied to ${instalments.length} overdue instalment${instalments.length !== 1 ? 's' : ''} (total overdue: EUR${overdueTotal.toFixed(2)})`

  await recordRichClientAction(clientId, 'Payment Sweep', executor, notes, metadata)

  await createNotification({
    clientId,
    creditId:         instalments[0]?.creditAccount ?? null,
    notificationType: 'stage_change',
    priority:         'medium',
    title:            'Automatic Payment Applied',
    message:          `A payment of EUR${sweepAmount.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been automatically applied from your salary credit towards your overdue instalment${instalments.length !== 1 ? 's' : ''}. ${instalments.length} payment${instalments.length !== 1 ? 's' : ''} covered. Please contact your branch for details.`,
    assignedRM:       null,
  })

  return {
    clientId,
    eligible:     true,
    salaryCredit,
    overdueTotal,
    sweepAmount,
    instalments,
    alreadySwept: false,
}
}

export interface PortfolioSweepResult {
  processed: number
  swept:     number
  skipped:   number
  errors:    number
  results:   SweepResult[]
}

/**
 * Run salary sweep for all Stage 2/3 clients with overdue payments.
 * Designed to be called from a nightly cron job or admin trigger.
 */
export async function runPortfolioSweep(executor: string = 'SYSTEM'): Promise<PortfolioSweepResult> {
  const clients = await query<{ clientId: string }>(
    `SELECT DISTINCT TOP 500
       rp.clientID AS clientId
     FROM [dbo].[RiskPortfolio] rp WITH (NOLOCK)
     WHERE rp.CalculationDate = (SELECT MAX(CalculationDate) FROM [dbo].[RiskPortfolio] WITH (NOLOCK))
       AND rp.Stage >= 2
       AND TRY_CAST(rp.DueDays AS INT) > 0
     ORDER BY TRY_CAST(rp.DueDays AS INT) DESC`,
    {}
  )

  const results: SweepResult[] = []
  let swept = 0, skipped = 0, errors = 0

  for (const { clientId } of clients) {
    try {
      const result = await executeSweep(clientId, executor)
      results.push(result)
      if (result.eligible) swept++
      else skipped++
    } catch (err) {
      errors++
      results.push({
        clientId,
        eligible:     false,
        reason:       (err as Error).message,
        overdueTotal: 0,
        sweepAmount:  0,
        instalments:  [],
        alreadySwept: false,
      })
    }
}

  return { processed: clients.length, swept, skipped, errors, results }
}
