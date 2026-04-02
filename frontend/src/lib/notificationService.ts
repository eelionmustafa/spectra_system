/**
 * SPECTRA Notification Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages two tables created on first use (DDL-on-first-use pattern, same as
 * ClientActions in queries.ts):
 *
 *   SystemActions   — immutable audit log of every system-initiated event
 *                     (stage changes, risk score updates, EWI triggers).
 *                     Written by: classificationEngine.ts
 *                     Read by:    /api/clients/[id]/system-actions
 *
 *   Notifications   — RM inbox; one row per alert, marked read in place.
 *                     Written by: classificationEngine.ts
 *                     Read by:    /api/notifications (polled by NotificationBell)
 */

import { query } from '@/lib/db.server'

// ─── DDL ──────────────────────────────────────────────────────────────────

const ENSURE_SYSTEM_ACTIONS = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'SystemActions' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[SystemActions] (
  id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id       NVARCHAR(50)     NOT NULL,
  credit_id       NVARCHAR(50)     NULL,
  -- 'stage_change' | 'risk_score_update' | 'ewi_trigger'
  event_type      NVARCHAR(50)     NOT NULL,
  old_stage       INT              NULL,
  new_stage       INT              NULL,
  old_risk_score  FLOAT            NULL,
  new_risk_score  FLOAT            NULL,
  -- JSON: { reason, signals[], triggeredBy }
  trigger_reason  NVARCHAR(MAX)    NULL,
  performed_by    NVARCHAR(100)    NOT NULL DEFAULT 'SYSTEM',
  created_at      DATETIME         NOT NULL DEFAULT GETDATE()
)
`

const ENSURE_NOTIFICATIONS = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'Notifications' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[Notifications] (
  id                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id         NVARCHAR(50)     NOT NULL,
  credit_id         NVARCHAR(50)     NULL,
  -- 'stage_change' | 'ewi_alert' | 'risk_escalation'
  notification_type NVARCHAR(50)     NOT NULL,
  -- 'critical' | 'high' | 'medium' | 'low'
  priority          NVARCHAR(20)     NOT NULL DEFAULT 'medium',
  title             NVARCHAR(200)    NOT NULL,
  message           NVARCHAR(MAX)    NOT NULL,
  -- NULL = broadcast to all RM users
  assigned_rm       NVARCHAR(100)    NULL,
  created_at        DATETIME         NOT NULL DEFAULT GETDATE(),
  -- NULL = unread
  read_at           DATETIME         NULL
)
`

const ENSURE_IDX_NOTIFICATIONS_RM = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_Notifications_AssignedRM_CreatedAt'
    AND object_id = OBJECT_ID('SPECTRA.dbo.Notifications')
)
CREATE INDEX IX_Notifications_AssignedRM_CreatedAt
  ON [dbo].[Notifications] (assigned_rm, created_at DESC)
  INCLUDE (priority, notification_type, read_at)
`

const ENSURE_IDX_SYSACTIONS_CLIENT = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_SystemActions_ClientID_CreatedAt'
    AND object_id = OBJECT_ID('SPECTRA.dbo.SystemActions')
)
CREATE INDEX IX_SystemActions_ClientID_CreatedAt
  ON [dbo].[SystemActions] (client_id, created_at DESC)
  INCLUDE (event_type, old_stage, new_stage, old_risk_score, new_risk_score)
`

// ─── One-time DDL guard ────────────────────────────────────────────────────
// Same pattern as ensureActionsTable() in queries.ts.

let _tablesReady    = false
let _tablesInFlight: Promise<void> | null = null

async function ensureTables(): Promise<void> {
  if (_tablesReady) return
  if (_tablesInFlight) return _tablesInFlight
  _tablesInFlight = (async () => {
    await query(ENSURE_SYSTEM_ACTIONS)
    await query(ENSURE_NOTIFICATIONS)
    // Indexes are best-effort — ignore failure on older SQL Server versions
    try { await query(ENSURE_IDX_NOTIFICATIONS_RM)  } catch { /* non-fatal */ }
    try { await query(ENSURE_IDX_SYSACTIONS_CLIENT) } catch { /* non-fatal */ }
    _tablesReady = true
  })().finally(() => { _tablesInFlight = null })
  return _tablesInFlight
}

// ─── SystemActions ─────────────────────────────────────────────────────────

export interface SystemActionRecord {
  clientId:      string
  creditId:      string | null
  eventType:     string          // 'stage_change' | 'risk_score_update' | 'ewi_trigger'
  oldStage:      number | null
  newStage:      number | null
  oldRiskScore:  number | null
  newRiskScore:  number | null
  triggerReason: string | null   // JSON blob
  performedBy?:  string          // defaults to 'SYSTEM'
}

export interface SystemActionRow {
  id:             string
  client_id:      string
  credit_id:      string | null
  event_type:     string
  old_stage:      number | null
  new_stage:      number | null
  old_risk_score: number | null
  new_risk_score: number | null
  trigger_reason: string | null
  performed_by:   string
  created_at:     string
}

export async function recordSystemAction(rec: SystemActionRecord): Promise<void> {
  await ensureTables()
  await query(
    `INSERT INTO [dbo].[SystemActions]
       (client_id, credit_id, event_type, old_stage, new_stage,
        old_risk_score, new_risk_score, trigger_reason, performed_by)
     VALUES
       (@clientId, @creditId, @eventType, @oldStage, @newStage,
        @oldRiskScore, @newRiskScore, @triggerReason, @performedBy)`,
    {
      clientId:      rec.clientId,
      creditId:      rec.creditId ?? null,
      eventType:     rec.eventType,
      oldStage:      rec.oldStage  ?? null,
      newStage:      rec.newStage  ?? null,
      oldRiskScore:  rec.oldRiskScore ?? null,
      newRiskScore:  rec.newRiskScore ?? null,
      triggerReason: rec.triggerReason ?? null,
      performedBy:   rec.performedBy ?? 'SYSTEM',
    }
  )
}

export async function getSystemActions(
  clientId: string,
  limit = 20
): Promise<SystemActionRow[]> {
  await ensureTables()
  return query<SystemActionRow>(
    `SELECT TOP (@limit)
       CAST(id AS VARCHAR(36))                 AS id,
       client_id, credit_id, event_type,
       old_stage, new_stage,
       old_risk_score, new_risk_score,
       trigger_reason, performed_by,
       CONVERT(VARCHAR(30), created_at, 127)   AS created_at
     FROM [dbo].[SystemActions] WITH (NOLOCK)
     WHERE client_id = @clientId
     ORDER BY created_at DESC`,
    { clientId, limit }
  )
}

/** Recent system actions portfolio-wide — used for the audit page. */
export async function getRecentSystemActions(limit = 50): Promise<SystemActionRow[]> {
  await ensureTables()
  return query<SystemActionRow>(
    `SELECT TOP (@limit)
       CAST(id AS VARCHAR(36))                 AS id,
       client_id, credit_id, event_type,
       old_stage, new_stage,
       old_risk_score, new_risk_score,
       trigger_reason, performed_by,
       CONVERT(VARCHAR(30), created_at, 127)   AS created_at
     FROM [dbo].[SystemActions] WITH (NOLOCK)
     ORDER BY created_at DESC`,
    { limit }
  )
}

// ─── Notifications ─────────────────────────────────────────────────────────

export interface NotificationRecord {
  clientId:         string
  creditId:         string | null
  notificationType: string
  priority:         'critical' | 'high' | 'medium' | 'low'
  title:            string
  message:          string
  assignedRM:       string | null  // NULL = broadcast to all RM users
}

export interface NotificationRow {
  id:                string
  client_id:         string
  credit_id:         string | null
  notification_type: string
  priority:          string
  title:             string
  message:           string
  assigned_rm:       string | null
  created_at:        string
  read_at:           string | null
}

export async function createNotification(rec: NotificationRecord): Promise<void> {
  await ensureTables()
  await query(
    `INSERT INTO [dbo].[Notifications]
       (client_id, credit_id, notification_type, priority, title, message, assigned_rm)
     VALUES
       (@clientId, @creditId, @notificationType, @priority, @title, @message, @assignedRM)`,
    {
      clientId:         rec.clientId,
      creditId:         rec.creditId ?? null,
      notificationType: rec.notificationType,
      priority:         rec.priority,
      title:            rec.title,
      message:          rec.message,
      assignedRM:       rec.assignedRM ?? null,
    }
  )
}

/**
 * Fetch notifications for a given RM user.
 * Returns notifications addressed to them plus any broadcast notifications
 * (assigned_rm IS NULL).
 */
export async function getNotificationsForUser(
  username: string,
  limit = 50
): Promise<NotificationRow[]> {
  await ensureTables()
  return query<NotificationRow>(
    `SELECT TOP (@limit)
       CAST(id AS VARCHAR(36))                AS id,
       client_id, credit_id, notification_type,
       priority, title, message, assigned_rm,
       CONVERT(VARCHAR(30), created_at, 127)  AS created_at,
       CONVERT(VARCHAR(30), read_at,    127)  AS read_at
     FROM [dbo].[Notifications] WITH (NOLOCK)
     WHERE assigned_rm = @username OR assigned_rm IS NULL
     ORDER BY created_at DESC`,
    { username, limit }
  )
}

export async function getUnreadCountForUser(username: string): Promise<number> {
  await ensureTables()
  const rows = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt
     FROM [dbo].[Notifications] WITH (NOLOCK)
     WHERE (assigned_rm = @username OR assigned_rm IS NULL)
       AND read_at IS NULL`,
    { username }
  )
  return rows[0]?.cnt ?? 0
}

export async function markNotificationRead(id: string, username: string): Promise<void> {
  await ensureTables()
  await query(
    `UPDATE [dbo].[Notifications]
     SET read_at = GETDATE()
     WHERE CAST(id AS VARCHAR(36)) = @id
       AND (assigned_rm = @username OR assigned_rm IS NULL)
       AND read_at IS NULL`,
    { id, username }
  )
}

export async function markAllReadForUser(username: string): Promise<void> {
  await ensureTables()
  await query(
    `UPDATE [dbo].[Notifications]
     SET read_at = GETDATE()
     WHERE (assigned_rm = @username OR assigned_rm IS NULL)
       AND read_at IS NULL`,
    { username }
  )
}
