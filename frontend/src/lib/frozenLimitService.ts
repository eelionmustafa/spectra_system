/**
 * SPECTRA Frozen Limit Service
 * Manages the FrozenLimits table (DDL-on-first-use).
 *
 * Freeze lifecycle: active = 1 (frozen) → unfrozen_at set, active = 0
 */

import { query } from '@/lib/db.server'

const ENSURE_FROZEN_LIMITS = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'FrozenLimits' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[FrozenLimits] (
  id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id    NVARCHAR(50)     NOT NULL,
  frozen_by    NVARCHAR(100)    NOT NULL,
  reason       NVARCHAR(MAX)    NULL,
  frozen_at    DATETIME         NOT NULL DEFAULT GETDATE(),
  unfrozen_at  DATETIME         NULL,
  unfrozen_by  NVARCHAR(100)    NULL,
  -- 1 = active freeze, 0 = lifted
  active       BIT              NOT NULL DEFAULT 1
)
`

const ENSURE_IDX_FROZEN_CLIENT = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_FrozenLimits_ClientID_Active'
    AND object_id = OBJECT_ID('SPECTRA.dbo.FrozenLimits')
)
CREATE INDEX IX_FrozenLimits_ClientID_Active
  ON [dbo].[FrozenLimits] (client_id, active)
  INCLUDE (frozen_by, frozen_at)
`

let _ready    = false
let _inflight: Promise<void> | null = null

async function ensureTable(): Promise<void> {
  if (_ready) return
  if (_inflight) return _inflight
  _inflight = (async () => {
    await query(ENSURE_FROZEN_LIMITS)
    try { await query(ENSURE_IDX_FROZEN_CLIENT) } catch { /* non-fatal */ }
    _ready = true
  })().finally(() => { _inflight = null })
  return _inflight
}

export interface FreezeRow {
  id:          string
  client_id:   string
  frozen_by:   string
  reason:      string | null
  frozen_at:   string
  unfrozen_at: string | null
  unfrozen_by: string | null
  active:      boolean
}

export async function freezeClientLimit(
  clientId: string,
  frozenBy: string,
  reason?:  string | null
): Promise<string> {
  await ensureTable()
  const rows = await query<{ id: string }>(
    `INSERT INTO [dbo].[FrozenLimits] (client_id, frozen_by, reason)
     OUTPUT CAST(inserted.id AS VARCHAR(36)) AS id
     VALUES (@clientId, @frozenBy, @reason)`,
    { clientId, frozenBy, reason: reason ?? null }
  )
  return rows[0].id
}

export async function unfreezeClientLimit(
  clientId:   string,
  unfrozenBy: string
): Promise<void> {
  await ensureTable()
  await query(
    `UPDATE [dbo].[FrozenLimits]
     SET active = 0, unfrozen_at = GETDATE(), unfrozen_by = @unfrozenBy
     WHERE client_id = @clientId AND active = 1`,
    { clientId, unfrozenBy }
  )
}

export async function getActiveFreezeLimit(clientId: string): Promise<FreezeRow | null> {
  await ensureTable()
  const rows = await query<FreezeRow>(
    `SELECT TOP 1
       CAST(id AS VARCHAR(36))                  AS id,
       client_id, frozen_by, reason,
       CONVERT(VARCHAR(30), frozen_at,   127)   AS frozen_at,
       CONVERT(VARCHAR(30), unfrozen_at, 127)   AS unfrozen_at,
       unfrozen_by,
       CAST(active AS BIT)                      AS active
     FROM [dbo].[FrozenLimits] WITH (NOLOCK)
     WHERE client_id = @clientId AND active = 1
     ORDER BY frozen_at DESC`,
    { clientId }
  )
  return rows[0] ?? null
}
