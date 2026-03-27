/**
 * SPECTRA Restructuring Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the RestructuringPlans table (DDL-on-first-use, same pattern as
 * ClientActions in queries.ts and ClientEngagements in engagementService.ts).
 *
 *   RestructuringPlans — formal restructuring proposals raised against a client.
 *                        Status lifecycle: Proposed → Approved | Rejected → Active → Completed
 *                        Read by: /api/clients/[id]/restructuring
 */

import { query } from '@/lib/db.server'

// ─── DDL ──────────────────────────────────────────────────────────────────

const ENSURE_RESTRUCTURING_PLANS = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'RestructuringPlans' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[RestructuringPlans] (
  id                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id                NVARCHAR(50)     NOT NULL,
  credit_id                NVARCHAR(50)     NULL,
  -- 'LoanExtension' | 'PaymentHoliday' | 'RateReduction' | 'DebtConsolidation' | 'PartialWriteOff'
  type                     NVARCHAR(50)     NOT NULL,
  new_maturity_date        DATE             NULL,
  holiday_duration_months  INT              NULL,
  new_interest_rate        FLOAT            NULL,
  forgiven_amount          FLOAT            NULL,
  -- 'Proposed' | 'Approved' | 'Rejected' | 'Active' | 'Completed'
  status                   NVARCHAR(20)     NOT NULL DEFAULT 'Proposed',
  approved_by              NVARCHAR(100)    NULL,
  approved_at              DATETIME         NULL,
  notes                    NVARCHAR(MAX)    NULL,
  created_by               NVARCHAR(100)    NOT NULL,
  created_at               DATETIME         NOT NULL DEFAULT GETDATE(),
  updated_at               DATETIME         NOT NULL DEFAULT GETDATE()
)
`

const ENSURE_IDX_PLANS_CLIENT = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_RestructuringPlans_ClientID_CreatedAt'
    AND object_id = OBJECT_ID('SPECTRA.dbo.RestructuringPlans')
)
CREATE INDEX IX_RestructuringPlans_ClientID_CreatedAt
  ON [SPECTRA].[dbo].[RestructuringPlans] (client_id, created_at DESC)
  INCLUDE (type, status)
`

// ─── One-time DDL guard ────────────────────────────────────────────────────

let _tablesReady    = false
let _tablesInFlight: Promise<void> | null = null

async function ensureTables(): Promise<void> {
  if (_tablesReady) return
  if (_tablesInFlight) return _tablesInFlight
  _tablesInFlight = (async () => {
    await query(ENSURE_RESTRUCTURING_PLANS)
    try { await query(ENSURE_IDX_PLANS_CLIENT) } catch { /* non-fatal */ }
    _tablesReady = true
  })().finally(() => { _tablesInFlight = null })
  return _tablesInFlight
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface PlanRecord {
  clientId:               string
  creditId?:              string | null
  type:                   string
  newMaturityDate?:       string | null   // 'YYYY-MM-DD'
  holidayDurationMonths?: number | null
  newInterestRate?:       number | null
  forgivenAmount?:        number | null
  notes?:                 string | null
  createdBy:              string
}

export interface PlanRow {
  id:                      string
  client_id:               string
  credit_id:               string | null
  type:                    string
  new_maturity_date:       string | null
  holiday_duration_months: number | null
  new_interest_rate:       number | null
  forgiven_amount:         number | null
  status:                  'Proposed' | 'Approved' | 'Rejected' | 'Active' | 'Completed'
  approved_by:             string | null
  approved_at:             string | null
  notes:                   string | null
  created_by:              string
  created_at:              string
  updated_at:              string
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function createRestructuringPlan(rec: PlanRecord): Promise<string> {
  await ensureTables()
  const rows = await query<{ id: string }>(
    `INSERT INTO [SPECTRA].[dbo].[RestructuringPlans]
       (client_id, credit_id, type, new_maturity_date, holiday_duration_months,
        new_interest_rate, forgiven_amount, notes, created_by)
     OUTPUT CAST(inserted.id AS VARCHAR(36)) AS id
     VALUES (@clientId, @creditId, @type, @newMaturityDate, @holidayDurationMonths,
             @newInterestRate, @forgivenAmount, @notes, @createdBy)`,
    {
      clientId:               rec.clientId,
      creditId:               rec.creditId               ?? null,
      type:                   rec.type,
      newMaturityDate:        rec.newMaturityDate         ?? null,
      holidayDurationMonths:  rec.holidayDurationMonths  ?? null,
      newInterestRate:        rec.newInterestRate         ?? null,
      forgivenAmount:         rec.forgivenAmount          ?? null,
      notes:                  rec.notes                  ?? null,
      createdBy:              rec.createdBy,
    }
  )
  return rows[0].id
}

export async function getRestructuringPlans(
  clientId: string,
  limit = 20
): Promise<PlanRow[]> {
  await ensureTables()
  return query<PlanRow>(
    `SELECT TOP (@limit)
       CAST(id AS VARCHAR(36))                         AS id,
       client_id, credit_id, type,
       CONVERT(VARCHAR(10), new_maturity_date, 23)     AS new_maturity_date,
       holiday_duration_months, new_interest_rate, forgiven_amount,
       status, approved_by,
       CONVERT(VARCHAR(30), approved_at, 127)          AS approved_at,
       notes, created_by,
       CONVERT(VARCHAR(30), created_at, 127)           AS created_at,
       CONVERT(VARCHAR(30), updated_at, 127)           AS updated_at
     FROM [SPECTRA].[dbo].[RestructuringPlans] WITH (NOLOCK)
     WHERE client_id = @clientId
     ORDER BY created_at DESC`,
    { clientId, limit }
  )
}

/**
 * Returns the most-recent plan that is still open (Proposed, Approved, or Active).
 * Returns null when no such plan exists.
 */
export async function getActiveRestructuringPlan(
  clientId: string
): Promise<PlanRow | null> {
  await ensureTables()
  const rows = await query<PlanRow>(
    `SELECT TOP 1
       CAST(id AS VARCHAR(36))                         AS id,
       client_id, credit_id, type,
       CONVERT(VARCHAR(10), new_maturity_date, 23)     AS new_maturity_date,
       holiday_duration_months, new_interest_rate, forgiven_amount,
       status, approved_by,
       CONVERT(VARCHAR(30), approved_at, 127)          AS approved_at,
       notes, created_by,
       CONVERT(VARCHAR(30), created_at, 127)           AS created_at,
       CONVERT(VARCHAR(30), updated_at, 127)           AS updated_at
     FROM [SPECTRA].[dbo].[RestructuringPlans] WITH (NOLOCK)
     WHERE client_id = @clientId
       AND status IN ('Proposed', 'Approved', 'Active')
     ORDER BY created_at DESC`,
    { clientId }
  )
  return rows[0] ?? null
}

export async function updateRestructuringPlan(
  id: string,
  updates: {
    status?:     'Proposed' | 'Approved' | 'Rejected' | 'Active' | 'Completed'
    approvedBy?: string | null
    notes?:      string
  }
): Promise<void> {
  await ensureTables()
  await query(
    `UPDATE [SPECTRA].[dbo].[RestructuringPlans]
     SET
       status      = COALESCE(@status,     status),
       approved_by = CASE WHEN @status = 'Approved' THEN @approvedBy ELSE approved_by END,
       approved_at = CASE WHEN @status = 'Approved' THEN GETDATE()   ELSE approved_at END,
       notes       = COALESCE(@notes,      notes),
       updated_at  = GETDATE()
     WHERE CAST(id AS VARCHAR(36)) = @id`,
    {
      id,
      status:     updates.status     ?? null,
      approvedBy: updates.approvedBy ?? null,
      notes:      updates.notes      ?? null,
    }
  )
}
