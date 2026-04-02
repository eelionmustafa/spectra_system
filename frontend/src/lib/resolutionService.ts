/**
 * SPECTRA Resolution Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the ClientResolutions table — tracks which clients have had their
 * credit risk concern manually marked as resolved by a risk officer.
 * Does NOT modify RiskPortfolio or any real bank data.
 */

import { query } from '@/lib/db.server'

// ─── DDL ──────────────────────────────────────────────────────────────────

const ENSURE_TABLE = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'ClientResolutions' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[ClientResolutions] (
  id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id    NVARCHAR(50)     NOT NULL,
  resolved_by  NVARCHAR(100)    NOT NULL,
  resolved_at  DATETIME         NOT NULL DEFAULT GETDATE(),
  notes        NVARCHAR(MAX)    NULL
)
`

const ENSURE_IDX = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_ClientResolutions_ClientID'
    AND object_id = OBJECT_ID('SPECTRA.dbo.ClientResolutions')
)
CREATE UNIQUE INDEX IX_ClientResolutions_ClientID
  ON [dbo].[ClientResolutions] (client_id)
`

// ─── One-time DDL guard ────────────────────────────────────────────────────

let _ready    = false
let _inFlight: Promise<void> | null = null

export async function ensureResolutionsTable(): Promise<void> {
  if (_ready) return
  if (_inFlight) return _inFlight
  _inFlight = query(ENSURE_TABLE)
    .then(() => query(ENSURE_IDX))
    .then(() => { _ready = true })
    .finally(() => { _inFlight = null })
  return _inFlight
}

// ─── Write ────────────────────────────────────────────────────────────────

export async function resolveClient(
  clientId:   string,
  resolvedBy: string,
  notes?:     string | null
): Promise<void> {
  await ensureResolutionsTable()
  await query(
    `MERGE [dbo].[ClientResolutions] AS target
     USING (VALUES (@clientId, @resolvedBy, @notes))
       AS source (client_id, resolved_by, notes)
     ON target.client_id = source.client_id
     WHEN MATCHED THEN UPDATE SET
       resolved_by = source.resolved_by,
       resolved_at = GETDATE(),
       notes       = source.notes
     WHEN NOT MATCHED THEN INSERT (client_id, resolved_by, notes)
       VALUES (source.client_id, source.resolved_by, source.notes);`,
    { clientId, resolvedBy, notes: notes ?? null }
  )
}

export async function unresolveClient(clientId: string): Promise<void> {
  await ensureResolutionsTable()
  await query(
    `DELETE FROM [dbo].[ClientResolutions] WHERE client_id = @clientId`,
    { clientId }
  )
}

// ─── Read ─────────────────────────────────────────────────────────────────

export async function isClientResolved(clientId: string): Promise<boolean> {
  await ensureResolutionsTable()
  const rows = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[ClientResolutions] WITH (NOLOCK)
     WHERE client_id = @clientId`,
    { clientId }
  )
  return (rows[0]?.cnt ?? 0) > 0
}
