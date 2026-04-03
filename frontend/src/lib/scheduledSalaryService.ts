/**
 * SPECTRA Scheduled Salary Service
 * ---------------------------------------------------------------------------
 * Manages a ScheduledSalaryCredits table — SPECTRA-owned salary entries that
 * act as real salary credits when their scheduled_date arrives.
 *
 * detectSalaryCredit() in salarySweepService.ts is patched to also check this
 * table, so salary sweep works exactly as it does for real TAccounts credits.
 *
 * Salary credits appear as:
 *   - "Upcoming salary" on client profile before the date
 *   - Real credit (sweep-eligible) on/after the scheduled_date
 *   - Transaction entry in portal after the date
 */

import { query } from '@/lib/db.server'

const ENSURE_TABLE = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'ScheduledSalaryCredits' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[ScheduledSalaryCredits] (
  id             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  personal_id    NVARCHAR(50)     NOT NULL,
  account_no     NVARCHAR(50)     NULL,
  amount         FLOAT            NOT NULL,
  description    NVARCHAR(200)    NOT NULL DEFAULT 'Salary Credit',
  scheduled_date DATE             NOT NULL,
  created_at     DATETIME         NOT NULL DEFAULT GETDATE()
)
`

let _ready = false
async function ensureTable() {
  if (_ready) return
  await query(ENSURE_TABLE, {})
  _ready = true
}

export interface ScheduledSalary {
  id:            string
  personalId:    string
  accountNo:     string | null
  amount:        number
  description:   string
  scheduledDate: string
}

/** Seed demo salary entries for April 7 2026 for given client IDs */
export async function seedDemoSalaries(clientIds: string[], amount = 1200): Promise<void> {
  await ensureTable()
  const scheduledDate = '2026-04-07'
  for (const personalId of clientIds) {
    // Look up account number from Credits/RiskPortfolio
    const accRows = await query<{ account_no: string }>(
      `SELECT TOP 1 cr.NoAccount AS account_no
       FROM [dbo].[Credits] cr WITH (NOLOCK)
       JOIN [dbo].[RiskPortfolio] rp WITH (NOLOCK)
         ON rp.contractNumber = cr.NoCredit
       WHERE rp.clientID = @personalId
         AND cr.NoAccount IS NOT NULL
         AND LTRIM(RTRIM(cr.NoAccount)) != ''`,
      { personalId }
    ).catch(() => [])

    const accountNo = accRows[0]?.account_no ?? null

    // Only insert if not already scheduled for that date
    await query(
      `IF NOT EXISTS (
         SELECT 1 FROM [dbo].[ScheduledSalaryCredits]
         WHERE personal_id = @personalId AND scheduled_date = @scheduledDate
       )
       INSERT INTO [dbo].[ScheduledSalaryCredits]
         (personal_id, account_no, amount, description, scheduled_date)
       VALUES
         (@personalId, @accountNo, @amount, 'Salary Credit — April 2026', @scheduledDate)`,
      { personalId, accountNo, amount, scheduledDate }
    )
  }
}

/** Returns upcoming scheduled salary for a client (for profile/portal display) */
export async function getScheduledSalary(personalId: string): Promise<ScheduledSalary | null> {
  await ensureTable()
  const rows = await query<{ id: string; personal_id: string; account_no: string | null; amount: number; description: string; scheduled_date: string }>(
    `SELECT TOP 1
       CAST(id AS VARCHAR(36)) AS id,
       personal_id, account_no, amount, description,
       CONVERT(VARCHAR(10), scheduled_date, 23) AS scheduled_date
     FROM [dbo].[ScheduledSalaryCredits] WITH (NOLOCK)
     WHERE personal_id = @personalId
       AND scheduled_date >= CAST(GETDATE() AS DATE)
     ORDER BY scheduled_date ASC`,
    { personalId }
  ).catch(() => [])
  if (!rows[0]) return null
  return {
    id:            rows[0].id,
    personalId:    rows[0].personal_id,
    accountNo:     rows[0].account_no,
    amount:        rows[0].amount,
    description:   rows[0].description,
    scheduledDate: rows[0].scheduled_date,
  }
}

/**
 * Returns a salary credit if scheduled_date <= today.
 * Called by detectSalaryCredit() as a fallback when TAccounts has no match.
 */
export async function detectScheduledSalaryCredit(personalId: string): Promise<{ accountNo: string; amount: number; date: string; description: string } | null> {
  await ensureTable()
  const rows = await query<{ account_no: string | null; amount: number; scheduled_date: string; description: string }>(
    `SELECT TOP 1 account_no, amount, description,
       CONVERT(VARCHAR(10), scheduled_date, 23) AS scheduled_date
     FROM [dbo].[ScheduledSalaryCredits] WITH (NOLOCK)
     WHERE personal_id = @personalId
       AND scheduled_date <= CAST(GETDATE() AS DATE)
     ORDER BY scheduled_date DESC`,
    { personalId }
  ).catch(() => [])
  if (!rows[0]) return null
  return {
    accountNo:   rows[0].account_no ?? personalId,
    amount:      rows[0].amount,
    date:        rows[0].scheduled_date,
    description: rows[0].description,
  }
}

/** Seed 5 random high-risk clients from RiskPortfolio with April 7 salary */
export async function seedRandomDemoSalaries(): Promise<{ seeded: string[] }> {
  await ensureTable()
  const rows = await query<{ clientID: string }>(
    `SELECT TOP 5 rp.clientID
     FROM (
       SELECT clientID, MAX(Stage) AS Stage
       FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
       WHERE CalculationDate = (SELECT MAX(CalculationDate) FROM [dbo].[RiskPortfolio] WITH (NOLOCK))
       GROUP BY clientID
     ) rp
     WHERE rp.Stage >= 2
     ORDER BY NEWID()`,
    {}
  ).catch(() => [])
  const ids = rows.map(r => r.clientID)
  await seedDemoSalaries(ids)
  return { seeded: ids }
}
