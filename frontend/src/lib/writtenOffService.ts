/**
 * SPECTRA Written-Off Clients Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the WrittenOffClients table.
 * Intentionally thin — imports ONLY from @/lib/db so it can be safely
 * imported by both recoveryService.ts and queries.ts without circular deps.
 *
 * Written by: recoveryService.writeOffClient()
 * Read by:    queries.getPortfolioKPIs() (exclusion from active KPIs)
 *             recoveryService.getActiveRecoveryCase() (is_written_off flag)
 */

import { query } from '@/lib/db.server'

// ─── DDL ──────────────────────────────────────────────────────────────────

const ENSURE_WRITTEN_OFF = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'WrittenOffClients' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[WrittenOffClients] (
  id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id       NVARCHAR(50)     NOT NULL UNIQUE,
  recovery_case_id NVARCHAR(36)    NULL,
  written_off_by  NVARCHAR(100)    NOT NULL,
  written_off_at  DATETIME         NOT NULL DEFAULT GETDATE(),
  notes           NVARCHAR(MAX)    NULL
)
`

// ─── One-time DDL guard ────────────────────────────────────────────────────

let _ready    = false
let _inFlight: Promise<void> | null = null

export async function ensureWrittenOffTable(): Promise<void> {
  if (_ready) return
  if (_inFlight) return _inFlight
  _inFlight = query(ENSURE_WRITTEN_OFF)
    .then(() => { _ready = true })
    .finally(() => { _inFlight = null })
  return _inFlight
}

// ─── Write ────────────────────────────────────────────────────────────────

export async function markClientWrittenOff(
  clientId:      string,
  writtenOffBy:  string,
  recoveryCaseId?: string | null,
  notes?:         string | null
): Promise<void> {
  await ensureWrittenOffTable()
  // Use MERGE so re-running a write-off (e.g. correction) is idempotent
  await query(
    `MERGE [SPECTRA].[dbo].[WrittenOffClients] AS target
     USING (VALUES (@clientId, @recoveryCaseId, @writtenOffBy, @notes))
       AS source (client_id, recovery_case_id, written_off_by, notes)
     ON target.client_id = source.client_id
     WHEN MATCHED THEN UPDATE SET
       recovery_case_id = source.recovery_case_id,
       written_off_by   = source.written_off_by,
       written_off_at   = GETDATE(),
       notes            = source.notes
     WHEN NOT MATCHED THEN INSERT
       (client_id, recovery_case_id, written_off_by, notes)
       VALUES (source.client_id, source.recovery_case_id, source.written_off_by, source.notes);`,
    { clientId, recoveryCaseId: recoveryCaseId ?? null, writtenOffBy, notes: notes ?? null }
  )
}

// ─── Read ─────────────────────────────────────────────────────────────────

export async function isClientWrittenOff(clientId: string): Promise<boolean> {
  await ensureWrittenOffTable()
  const rows = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [SPECTRA].[dbo].[WrittenOffClients] WITH (NOLOCK)
     WHERE client_id = @clientId`,
    { clientId }
  )
  return (rows[0]?.cnt ?? 0) > 0
}

export interface WrittenOffStats {
  written_off_count:    number
  written_off_exposure: number   // requires join with RiskPortfolio — 0 if not available
}
