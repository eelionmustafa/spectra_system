/**
 * SPECTRA ECL Provision Service
 * ─────────────────────────────────────────────────────────────────────────────
 * IFRS 9 Expected Credit Loss provisioning.
 * Manages the ECLProvisions table (DDL-on-first-use, same pattern as
 * restructuringService.ts and notificationService.ts).
 *
 * Provision rates (per spec):
 *   Stage 1 → 1%  of outstanding balance  (12-month ECL)
 *   Stage 2 → 5%  of outstanding balance  (Lifetime ECL)
 *   Stage 3 → 20% of outstanding balance  (Lifetime ECL + specific provision)
 *
 * Written by:  classificationEngine.ts (on every stage change)
 * Read by:     /app/portfolio/page.tsx, /app/analytics/page.tsx
 */

import { query, getPool } from '@/lib/db.server'

// ─── ECL Rate constants ────────────────────────────────────────────────────

export const ECL_RATES: Record<1 | 2 | 3, number> = {
  1: 0.01,  // 12-month ECL
  2: 0.05,  // Lifetime ECL
  3: 0.20,  // Lifetime ECL + specific provision
}

export function eclTypeForStage(stage: 1 | 2 | 3): '12Month' | 'Lifetime' {
  return stage === 1 ? '12Month' : 'Lifetime'
}

/** Returns the provision amount rounded to 2 decimal places. */
export function computeECLAmount(stage: 1 | 2 | 3, outstandingBalance: number): number {
  return Math.round(outstandingBalance * ECL_RATES[stage] * 100) / 100
}

// ─── DDL ──────────────────────────────────────────────────────────────────

const ENSURE_ECL_PROVISIONS = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'ECLProvisions' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[ECLProvisions] (
  id                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id            NVARCHAR(50)     NOT NULL,
  credit_id            NVARCHAR(50)     NULL,
  -- 1 | 2 | 3
  stage                INT              NOT NULL,
  -- '12Month' | 'Lifetime'
  ecl_type             NVARCHAR(20)     NOT NULL,
  -- Outstanding loan balance at time of calculation
  outstanding_balance  FLOAT            NOT NULL,
  -- Flat rate applied: 0.01 | 0.05 | 0.20
  provision_rate       FLOAT            NOT NULL,
  -- outstanding_balance * provision_rate
  provision_amount     FLOAT            NOT NULL,
  calculated_at        DATETIME         NOT NULL DEFAULT GETDATE()
)
`

// ─── Column migration ─────────────────────────────────────────────────────────
// Uses a SELECT TOP 0 probe as the ground truth: if SQL Server can compile
// `SELECT calculated_at FROM ECLProvisions`, the column is genuinely queryable.
// INFORMATION_SCHEMA / OBJECT_ID checks are unreliable on this ODBC config.
// ALTER TABLE is issued directly through the pool to avoid polluting the
// [SPECTRA QUERY ERROR] log with the expected "column already exists" error.
// Only caches true (confirmed working); failure is not cached so every request
// retries until the migration eventually succeeds.

let _colVerified = false

async function ensureCalculatedAt(): Promise<boolean> {
  if (_colVerified) return true

  // 1. Direct probe — same engine path as the real query
  try {
    await query(
      `SELECT TOP 0 calculated_at FROM [SPECTRA].[dbo].[ECLProvisions] WITH (NOLOCK)`
    )
    _colVerified = true
    return true
  } catch { /* column not yet queryable — attempt ADD below */ }

  // 2. ADD via pool.request() so "column already exists" is silently swallowed
  try {
    const p = await getPool()
    await p.request().query(
      `ALTER TABLE [SPECTRA].[dbo].[ECLProvisions]
         ADD calculated_at DATETIME NOT NULL DEFAULT GETDATE()`
    )
  } catch { /* already exists or other DDL error */ }

  // 3. Re-probe after the ADD attempt
  try {
    await query(
      `SELECT TOP 0 calculated_at FROM [SPECTRA].[dbo].[ECLProvisions] WITH (NOLOCK)`
    )
    _colVerified = true
    return true
  } catch { /* still not queryable — caller will use fallback */ }

  return false  // not cached: next request will retry the full sequence
}

// Two-part object names only — three-part (SPECTRA.dbo.*) returns NULL in
// OBJECT_ID() when the session is already connected to the SPECTRA database.
const ENSURE_IDX_ECL_CLIENT = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_ECLProvisions_ClientID_CalculatedAt'
    AND object_id = OBJECT_ID(N'dbo.ECLProvisions')
)
CREATE INDEX IX_ECLProvisions_ClientID_CalculatedAt
  ON [dbo].[ECLProvisions] (client_id, calculated_at DESC)
  INCLUDE (stage, ecl_type, provision_amount)
`

const ENSURE_IDX_ECL_STAGE = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_ECLProvisions_Stage_CalculatedAt'
    AND object_id = OBJECT_ID(N'dbo.ECLProvisions')
)
CREATE INDEX IX_ECLProvisions_Stage_CalculatedAt
  ON [dbo].[ECLProvisions] (stage, calculated_at DESC)
  INCLUDE (provision_amount, outstanding_balance)
`

// ─── One-time DDL guard ────────────────────────────────────────────────────

let _tablesReady    = false
let _tablesInFlight: Promise<void> | null = null

async function ensureTables(): Promise<void> {
  if (_tablesReady) return
  if (_tablesInFlight) return _tablesInFlight
  _tablesInFlight = (async () => {
    await query(ENSURE_ECL_PROVISIONS)
    try { await query(ENSURE_IDX_ECL_CLIENT) } catch { /* non-fatal */ }
    try { await query(ENSURE_IDX_ECL_STAGE)  } catch { /* non-fatal */ }
    _tablesReady = true
  })().finally(() => { _tablesInFlight = null })
  return _tablesInFlight
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface ECLProvisionRecord {
  clientId:           string
  creditId?:          string | null
  stage:              1 | 2 | 3
  outstandingBalance: number
}

export interface ECLProvisionRow {
  id:                  string
  client_id:           string
  credit_id:           string | null
  stage:               number
  ecl_type:            string
  outstanding_balance: number
  provision_rate:      number
  provision_amount:    number
  calculated_at:       string
}

export interface ECLTotals {
  total_provision:  number
  stage1_provision: number
  stage2_provision: number
  stage3_provision: number
  provision_count:  number
  last_calculated:  string | null
}

// ─── Write ────────────────────────────────────────────────────────────────

/** Insert a new provision snapshot. Called on every stage change. */
export async function recordECLProvision(rec: ECLProvisionRecord): Promise<string> {
  await ensureTables()
  const stage          = rec.stage
  const rate           = ECL_RATES[stage]
  const eclType        = eclTypeForStage(stage)
  const provisionAmt   = computeECLAmount(stage, rec.outstandingBalance)

  const rows = await query<{ id: string }>(
    `INSERT INTO [SPECTRA].[dbo].[ECLProvisions]
       (client_id, credit_id, stage, ecl_type,
        outstanding_balance, provision_rate, provision_amount)
     OUTPUT CAST(inserted.id AS VARCHAR(36)) AS id
     VALUES
       (@clientId, @creditId, @stage, @eclType,
        @outstandingBalance, @rate, @provisionAmount)`,
    {
      clientId:          rec.clientId,
      creditId:          rec.creditId ?? null,
      stage,
      eclType,
      outstandingBalance: rec.outstandingBalance,
      rate,
      provisionAmount:   provisionAmt,
    }
  )
  return rows[0].id
}

// ─── Read ─────────────────────────────────────────────────────────────────

/**
 * Returns portfolio-wide ECL totals.
 * Uses the most-recent provision row per client to avoid double-counting
 * when a client has been re-classified multiple times.
 */
export async function getTotalECLProvisions(): Promise<ECLTotals> {
  await ensureTables()
  const hasTs = await ensureCalculatedAt()

  const defaults = {
    total_provision: 0, stage1_provision: 0, stage2_provision: 0,
    stage3_provision: 0, provision_count: 0, last_calculated: null,
  }

  if (hasTs) {
    // Full query: deduplicate to most-recent provision per client.
    // calculated_at must appear in the CTE SELECT list so the outer
    // MAX(calculated_at) can reference it from the CTE's output columns.
    const rows = await query<ECLTotals>(`
      WITH latest AS (
        SELECT
          client_id, stage, provision_amount, calculated_at,
          ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY calculated_at DESC) AS rn
        FROM [SPECTRA].[dbo].[ECLProvisions] WITH (NOLOCK)
      )
      SELECT
        ISNULL(ROUND(SUM(provision_amount), 0), 0)                                      AS total_provision,
        ISNULL(ROUND(SUM(CASE WHEN stage = 1 THEN provision_amount ELSE 0 END), 0), 0)  AS stage1_provision,
        ISNULL(ROUND(SUM(CASE WHEN stage = 2 THEN provision_amount ELSE 0 END), 0), 0)  AS stage2_provision,
        ISNULL(ROUND(SUM(CASE WHEN stage = 3 THEN provision_amount ELSE 0 END), 0), 0)  AS stage3_provision,
        COUNT(*)                                                                          AS provision_count,
        CONVERT(VARCHAR(30), MAX(calculated_at), 127)                                    AS last_calculated
      FROM latest WHERE rn = 1
    `)
    return rows[0] ?? defaults
  }

  // Fallback: calculated_at not yet available — sum all rows (no deduplication)
  const rows = await query<ECLTotals>(`
    SELECT
      ISNULL(ROUND(SUM(provision_amount), 0), 0)                                      AS total_provision,
      ISNULL(ROUND(SUM(CASE WHEN stage = 1 THEN provision_amount ELSE 0 END), 0), 0)  AS stage1_provision,
      ISNULL(ROUND(SUM(CASE WHEN stage = 2 THEN provision_amount ELSE 0 END), 0), 0)  AS stage2_provision,
      ISNULL(ROUND(SUM(CASE WHEN stage = 3 THEN provision_amount ELSE 0 END), 0), 0)  AS stage3_provision,
      COUNT(*)                                                                          AS provision_count,
      NULL                                                                              AS last_calculated
    FROM [SPECTRA].[dbo].[ECLProvisions] WITH (NOLOCK)
  `)
  return rows[0] ?? defaults
}

/** Latest provision snapshot for a single client (for client profile page). */
export async function getLatestProvisionForClient(
  clientId: string
): Promise<ECLProvisionRow | null> {
  await ensureTables()
  const hasTs = await ensureCalculatedAt()
  const rows = await query<ECLProvisionRow>(
    hasTs
      ? `SELECT TOP 1
           CAST(id AS VARCHAR(36)) AS id,
           client_id, credit_id, stage, ecl_type,
           outstanding_balance, provision_rate, provision_amount,
           CONVERT(VARCHAR(30), calculated_at, 127) AS calculated_at
         FROM [SPECTRA].[dbo].[ECLProvisions] WITH (NOLOCK)
         WHERE client_id = @clientId
         ORDER BY calculated_at DESC`
      : `SELECT TOP 1
           CAST(id AS VARCHAR(36)) AS id,
           client_id, credit_id, stage, ecl_type,
           outstanding_balance, provision_rate, provision_amount,
           NULL AS calculated_at
         FROM [SPECTRA].[dbo].[ECLProvisions] WITH (NOLOCK)
         WHERE client_id = @clientId`,
    { clientId }
  )
  return rows[0] ?? null
}
