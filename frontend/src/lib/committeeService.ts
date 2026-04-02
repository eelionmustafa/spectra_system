/**
 * SPECTRA Credit Committee Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the CreditCommitteeLog table (DDL-on-first-use).
 *
 * Lifecycle:
 *   POST /api/clients/[id]/committee  → createCommitteeEscalation()  (Decision = 'Pending')
 *   PATCH /api/clients/[id]/committee/[logId] → updateCommitteeDecision()
 *
 * Every write also records a ClientActions entry so committee events appear
 * automatically in the Actions Log tab without additional UI work.
 */

import { query } from '@/lib/db.server'
import { recordRichClientAction } from '@/lib/queries'

// ─── DDL ──────────────────────────────────────────────────────────────────

const ENSURE_COMMITTEE_LOG = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'CreditCommitteeLog' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[CreditCommitteeLog] (
  id             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id      NVARCHAR(50)     NOT NULL,
  credit_id      NVARCHAR(50)     NULL,
  escalated_by   NVARCHAR(100)    NOT NULL,
  escalated_at   DATETIME         NOT NULL DEFAULT GETDATE(),
  -- 'Restructure' | 'LegalAction' | 'WriteOff' | 'Pending'
  decision       NVARCHAR(30)     NOT NULL DEFAULT 'Pending',
  decision_date  DATE             NULL,
  decided_by     NVARCHAR(100)    NULL,
  notes          NVARCHAR(MAX)    NULL,
  updated_at     DATETIME         NOT NULL DEFAULT GETDATE()
)
`

const ENSURE_IDX_COMMITTEE_CLIENT = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_CreditCommitteeLog_ClientID_EscalatedAt'
    AND object_id = OBJECT_ID('SPECTRA.dbo.CreditCommitteeLog')
)
CREATE INDEX IX_CreditCommitteeLog_ClientID_EscalatedAt
  ON [dbo].[CreditCommitteeLog] (client_id, escalated_at DESC)
  INCLUDE (decision, escalated_by)
`

// ─── One-time DDL guard ────────────────────────────────────────────────────

let _tablesReady    = false
let _tablesInFlight: Promise<void> | null = null

async function ensureTables(): Promise<void> {
  if (_tablesReady) return
  if (_tablesInFlight) return _tablesInFlight
  _tablesInFlight = (async () => {
    await query(ENSURE_COMMITTEE_LOG)
    try { await query(ENSURE_IDX_COMMITTEE_CLIENT) } catch { /* non-fatal */ }
    _tablesReady = true
  })().finally(() => { _tablesInFlight = null })
  return _tablesInFlight
}

// ─── Types ────────────────────────────────────────────────────────────────

export type CommitteeDecision = 'Restructure' | 'LegalAction' | 'WriteOff' | 'Pending'

export interface CommitteeRow {
  id:            string
  client_id:     string
  credit_id:     string | null
  escalated_by:  string
  escalated_at:  string
  decision:      CommitteeDecision
  decision_date: string | null
  decided_by:    string | null
  notes:         string | null
  updated_at:    string
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createCommitteeEscalation(
  clientId:    string,
  escalatedBy: string,
  opts: {
    creditId?: string | null
    notes?:    string | null
  } = {}
): Promise<string> {
  await ensureTables()

  const rows = await query<{ id: string }>(
    `INSERT INTO [dbo].[CreditCommitteeLog]
       (client_id, credit_id, escalated_by, notes)
     OUTPUT CAST(inserted.id AS VARCHAR(36)) AS id
     VALUES (@clientId, @creditId, @escalatedBy, @notes)`,
    {
      clientId,
      creditId:    opts.creditId   ?? null,
      escalatedBy,
      notes:       opts.notes      ?? null,
    }
  )

  const logId = rows[0].id

  // Mirror in ClientActions so it appears in the Actions Log tab automatically
  await recordRichClientAction(
    clientId,
    'Escalated to Credit Committee',
    escalatedBy,
    opts.notes ?? undefined,
    { committee_log_id: logId, decision: 'Pending' }
  )

  return logId
}

// ─── Update decision ──────────────────────────────────────────────────────

export async function updateCommitteeDecision(
  logId:    string,
  clientId: string,
  decidedBy: string,
  decision: 'Restructure' | 'LegalAction' | 'WriteOff',
  opts: {
    decisionDate?: string | null   // 'YYYY-MM-DD'
    notes?:        string | null
  } = {}
): Promise<void> {
  await ensureTables()

  await query(
    `UPDATE [dbo].[CreditCommitteeLog]
     SET
       decision      = @decision,
       decision_date = @decisionDate,
       decided_by    = @decidedBy,
       notes         = COALESCE(@notes, notes),
       updated_at    = GETDATE()
     WHERE CAST(id AS VARCHAR(36)) = @logId`,
    {
      logId,
      decision,
      decisionDate: opts.decisionDate ?? null,
      decidedBy,
      notes:        opts.notes        ?? null,
    }
  )

  // Mirror the decision in ClientActions for the audit log
  const decisionLabel: Record<string, string> = {
    Restructure: 'Restructure',
    LegalAction: 'Legal Action',
    WriteOff:    'Write-Off',
  }
  await recordRichClientAction(
    clientId,
    `Credit Committee Decision: ${decisionLabel[decision] ?? decision}`,
    decidedBy,
    opts.notes ?? undefined,
    {
      committee_log_id: logId,
      decision,
      decision_date: opts.decisionDate ?? null,
    }
  )
}

// ─── Read ─────────────────────────────────────────────────────────────────

export async function getCommitteeLog(clientId: string): Promise<CommitteeRow[]> {
  await ensureTables()
  return query<CommitteeRow>(
    `SELECT TOP 50
       CAST(id AS VARCHAR(36))                              AS id,
       client_id, credit_id, escalated_by,
       CONVERT(VARCHAR(30), escalated_at, 127)              AS escalated_at,
       decision,
       CONVERT(VARCHAR(10), decision_date, 23)              AS decision_date,
       decided_by, notes,
       CONVERT(VARCHAR(30), updated_at, 127)                AS updated_at
     FROM [dbo].[CreditCommitteeLog] WITH (NOLOCK)
     WHERE client_id = @clientId
     ORDER BY escalated_at DESC`,
    { clientId }
  )
}
