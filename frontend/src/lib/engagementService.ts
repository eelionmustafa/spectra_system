/**
 * SPECTRA Engagement Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages two tables created on first use (DDL-on-first-use, same pattern as
 * ClientActions in queries.ts):
 *
 *   ClientEngagements — log of every RM meeting and call with a client.
 *                       Created by: quick actions on Client Profile page.
 *                       Read by:    /api/clients/[id]/engagements
 *
 *   CovenantWaivers   — formal waiver requests raised against credit covenants.
 *                       Status lifecycle: Pending → Approved | Rejected.
 *                       Read by:    /api/clients/[id]/covenant-waivers
 */

import { query } from '@/lib/db.server'

// ─── DDL ──────────────────────────────────────────────────────────────────

const ENSURE_CLIENT_ENGAGEMENTS = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'ClientEngagements' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[ClientEngagements] (
  id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id    NVARCHAR(50)     NOT NULL,
  credit_id    NVARCHAR(50)     NULL,
  -- 'call' | 'meeting'
  type         NVARCHAR(20)     NOT NULL,
  scheduled_at DATETIME         NOT NULL,
  -- 'scheduled' | 'completed' | 'cancelled'
  status       NVARCHAR(20)     NOT NULL DEFAULT 'scheduled',
  -- 'reached' | 'no_answer' | 'rescheduled' — for calls
  -- 'productive' | 'inconclusive' | 'cancelled' — for meetings
  outcome      NVARCHAR(50)     NULL,
  notes        NVARCHAR(MAX)    NULL,
  logged_by    NVARCHAR(100)    NOT NULL,
  created_at   DATETIME         NOT NULL DEFAULT GETDATE(),
  updated_at   DATETIME         NOT NULL DEFAULT GETDATE()
)
`

const ENSURE_COVENANT_WAIVERS = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'CovenantWaivers' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[CovenantWaivers] (
  id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id       NVARCHAR(50)     NOT NULL,
  credit_id       NVARCHAR(50)     NULL,
  -- 'financial_covenant' | 'reporting_covenant' | 'maintenance_covenant' | 'other'
  waiver_type     NVARCHAR(100)    NOT NULL,
  requested_date  DATE             NOT NULL,
  requested_by    NVARCHAR(100)    NOT NULL,
  reason          NVARCHAR(MAX)    NULL,
  -- 'Pending' | 'Approved' | 'Rejected'
  status          NVARCHAR(20)     NOT NULL DEFAULT 'Pending',
  approved_by     NVARCHAR(100)    NULL,
  approved_at     DATETIME         NULL,
  decision_notes  NVARCHAR(MAX)    NULL,
  created_at      DATETIME         NOT NULL DEFAULT GETDATE()
)
`

const ENSURE_IDX_ENGAGEMENTS_CLIENT = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_ClientEngagements_ClientID_ScheduledAt'
    AND object_id = OBJECT_ID('SPECTRA.dbo.ClientEngagements')
)
CREATE INDEX IX_ClientEngagements_ClientID_ScheduledAt
  ON [dbo].[ClientEngagements] (client_id, scheduled_at DESC)
  INCLUDE (type, status, outcome)
`

const ENSURE_IDX_WAIVERS_CLIENT = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_CovenantWaivers_ClientID_RequestedDate'
    AND object_id = OBJECT_ID('SPECTRA.dbo.CovenantWaivers')
)
CREATE INDEX IX_CovenantWaivers_ClientID_RequestedDate
  ON [dbo].[CovenantWaivers] (client_id, requested_date DESC)
  INCLUDE (waiver_type, status)
`

// ─── One-time DDL guard ────────────────────────────────────────────────────

let _tablesReady    = false
let _tablesInFlight: Promise<void> | null = null

async function ensureTables(): Promise<void> {
  if (_tablesReady) return
  if (_tablesInFlight) return _tablesInFlight
  _tablesInFlight = (async () => {
    await query(ENSURE_CLIENT_ENGAGEMENTS)
    await query(ENSURE_COVENANT_WAIVERS)
    try { await query(ENSURE_IDX_ENGAGEMENTS_CLIENT) } catch { /* non-fatal */ }
    try { await query(ENSURE_IDX_WAIVERS_CLIENT)     } catch { /* non-fatal */ }
    _tablesReady = true
  })().finally(() => { _tablesInFlight = null })
  return _tablesInFlight
}

// ─── ClientEngagements ────────────────────────────────────────────────────

export interface EngagementRecord {
  clientId:     string
  creditId?:    string | null
  type:         'call' | 'meeting'
  scheduledAt:  string    // ISO datetime
  notes?:       string | null
  loggedBy:     string
}

export interface EngagementRow {
  id:           string
  client_id:    string
  credit_id:    string | null
  type:         'call' | 'meeting'
  scheduled_at: string
  status:       'scheduled' | 'completed' | 'cancelled'
  outcome:      string | null
  notes:        string | null
  logged_by:    string
  created_at:   string
  updated_at:   string
}

export async function createEngagement(rec: EngagementRecord): Promise<string> {
  await ensureTables()
  const rows = await query<{ id: string }>(
    `INSERT INTO [dbo].[ClientEngagements]
       (client_id, credit_id, type, scheduled_at, notes, logged_by)
     OUTPUT CAST(inserted.id AS VARCHAR(36)) AS id
     VALUES (@clientId, @creditId, @type, @scheduledAt, @notes, @loggedBy)`,
    {
      clientId:    rec.clientId,
      creditId:    rec.creditId   ?? null,
      type:        rec.type,
      scheduledAt: rec.scheduledAt,
      notes:       rec.notes      ?? null,
      loggedBy:    rec.loggedBy,
    }
  )
  return rows[0].id
}

export async function getEngagements(
  clientId: string,
  limit = 50
): Promise<EngagementRow[]> {
  await ensureTables()
  return query<EngagementRow>(
    `SELECT TOP (@limit)
       CAST(id AS VARCHAR(36))                   AS id,
       client_id, credit_id, type, status, outcome, notes, logged_by,
       CONVERT(VARCHAR(30), scheduled_at, 127)   AS scheduled_at,
       CONVERT(VARCHAR(30), created_at,   127)   AS created_at,
       CONVERT(VARCHAR(30), updated_at,   127)   AS updated_at
     FROM [dbo].[ClientEngagements] WITH (NOLOCK)
     WHERE client_id = @clientId
     ORDER BY scheduled_at DESC`,
    { clientId, limit }
  )
}

export async function updateEngagement(
  id:      string,
  updates: { status?: 'scheduled' | 'completed' | 'cancelled'; outcome?: string; notes?: string }
): Promise<void> {
  await ensureTables()
  await query(
    `UPDATE [dbo].[ClientEngagements]
     SET
       status     = COALESCE(@status,  status),
       outcome    = COALESCE(@outcome, outcome),
       notes      = COALESCE(@notes,   notes),
       updated_at = GETDATE()
     WHERE CAST(id AS VARCHAR(36)) = @id`,
    {
      id,
      status:  updates.status  ?? null,
      outcome: updates.outcome ?? null,
      notes:   updates.notes   ?? null,
    }
  )
}

// ─── CovenantWaivers ──────────────────────────────────────────────────────

export interface WaiverRecord {
  clientId:      string
  creditId?:     string | null
  waiverType:    string   // 'financial_covenant' | 'reporting_covenant' | 'maintenance_covenant' | 'other'
  requestedDate: string   // ISO date 'YYYY-MM-DD'
  requestedBy:   string
  reason?:       string | null
}

export interface WaiverRow {
  id:             string
  client_id:      string
  credit_id:      string | null
  waiver_type:    string
  requested_date: string
  requested_by:   string
  reason:         string | null
  status:         'Pending' | 'Approved' | 'Rejected'
  approved_by:    string | null
  approved_at:    string | null
  decision_notes: string | null
  created_at:     string
}

export async function createWaiver(rec: WaiverRecord): Promise<string> {
  await ensureTables()
  const rows = await query<{ id: string }>(
    `INSERT INTO [dbo].[CovenantWaivers]
       (client_id, credit_id, waiver_type, requested_date, requested_by, reason)
     OUTPUT CAST(inserted.id AS VARCHAR(36)) AS id
     VALUES (@clientId, @creditId, @waiverType, @requestedDate, @requestedBy, @reason)`,
    {
      clientId:      rec.clientId,
      creditId:      rec.creditId  ?? null,
      waiverType:    rec.waiverType,
      requestedDate: rec.requestedDate,
      requestedBy:   rec.requestedBy,
      reason:        rec.reason    ?? null,
    }
  )
  return rows[0].id
}

export async function getWaivers(
  clientId: string,
  limit = 50
): Promise<WaiverRow[]> {
  await ensureTables()
  return query<WaiverRow>(
    `SELECT TOP (@limit)
       CAST(id AS VARCHAR(36))                       AS id,
       client_id, credit_id, waiver_type,
       CONVERT(VARCHAR(10), requested_date, 23)      AS requested_date,
       requested_by, reason, status, approved_by,
       CONVERT(VARCHAR(30), approved_at, 127)        AS approved_at,
       decision_notes,
       CONVERT(VARCHAR(30), created_at, 127)         AS created_at
     FROM [dbo].[CovenantWaivers] WITH (NOLOCK)
     WHERE client_id = @clientId
     ORDER BY requested_date DESC, created_at DESC`,
    { clientId, limit }
  )
}

/**
 * Approve or reject a waiver request.
 * Sets approved_by + approved_at when approving; clears them when rejecting.
 */
export async function decideWaiver(
  id:            string,
  status:        'Approved' | 'Rejected',
  decidedBy:     string,
  decisionNotes?: string
): Promise<void> {
  await ensureTables()
  await query(
    `UPDATE [dbo].[CovenantWaivers]
     SET
       status         = @status,
       approved_by    = CASE WHEN @status = 'Approved' THEN @decidedBy  ELSE NULL END,
       approved_at    = CASE WHEN @status = 'Approved' THEN GETDATE()   ELSE NULL END,
       decision_notes = @decisionNotes
     WHERE CAST(id AS VARCHAR(36)) = @id
       AND status = 'Pending'`,
    { id, status, decidedBy, decisionNotes: decisionNotes ?? null }
  )
}
