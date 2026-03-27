-- ─────────────────────────────────────────────────────────────────────────────
-- SPECTRA — System Tables DDL
-- System-initiated events: stage reclassification audit log + RM notifications.
--
-- Note: The Next.js application creates these tables automatically on first use
-- via DDL-on-first-use guards in notificationService.ts.
-- Run this script manually only when provisioning a new database or when you
-- want to pre-create the tables before first app startup.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── SystemActions ────────────────────────────────────────────────────────────
-- Immutable audit log of every system-initiated event.
-- One row per event; never updated after insert.
--
-- event_type values:
--   'stage_change'      — IFRS stage reclassified (e.g. Stage 1 → Stage 2)
--   'risk_score_update' — Composite risk score drifted ≥5 pts without stage change
--   'ewi_trigger'       — EWI signal fired but did not change stage or score enough

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'SystemActions' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[SystemActions] (
    id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    client_id       NVARCHAR(50)     NOT NULL,
    credit_id       NVARCHAR(50)     NULL,
    event_type      NVARCHAR(50)     NOT NULL,
    old_stage       INT              NULL,
    new_stage       INT              NULL,
    old_risk_score  FLOAT            NULL,
    new_risk_score  FLOAT            NULL,
    -- JSON: { "reason": "...", "signals": [...], "triggeredBy": "ewi_signal:salary_stopped" }
    trigger_reason  NVARCHAR(MAX)    NULL,
    performed_by    NVARCHAR(100)    NOT NULL DEFAULT 'SYSTEM',
    created_at      DATETIME         NOT NULL DEFAULT GETDATE()
  );
  PRINT 'Created table: SystemActions';
END
ELSE
  PRINT 'Table already exists: SystemActions';
GO

-- Index: per-client history lookup (client profile page stage change tab)
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_SystemActions_ClientID_CreatedAt'
    AND object_id = OBJECT_ID('dbo.SystemActions')
)
BEGIN
  CREATE INDEX IX_SystemActions_ClientID_CreatedAt
    ON [dbo].[SystemActions] (client_id, created_at DESC)
    INCLUDE (event_type, old_stage, new_stage, old_risk_score, new_risk_score);
  PRINT 'Created index: IX_SystemActions_ClientID_CreatedAt';
END
GO

-- Index: portfolio-wide recent events (audit page)
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_SystemActions_CreatedAt'
    AND object_id = OBJECT_ID('dbo.SystemActions')
)
BEGIN
  CREATE INDEX IX_SystemActions_CreatedAt
    ON [dbo].[SystemActions] (created_at DESC)
    INCLUDE (client_id, event_type, old_stage, new_stage);
  PRINT 'Created index: IX_SystemActions_CreatedAt';
END
GO


-- ─── Notifications ────────────────────────────────────────────────────────────
-- RM inbox: one row per alert. read_at is NULL until the RM reads it.
-- assigned_rm = NULL means the notification is broadcast to all RM users.
--
-- notification_type values:
--   'stage_change'    — IFRS stage reclassified
--   'ewi_alert'       — EWI signal reached a threshold
--   'risk_escalation' — Risk score crossed a tier boundary
--
-- priority values: 'critical' | 'high' | 'medium' | 'low'

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'Notifications' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[Notifications] (
    id                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    client_id         NVARCHAR(50)     NOT NULL,
    credit_id         NVARCHAR(50)     NULL,
    notification_type NVARCHAR(50)     NOT NULL,
    priority          NVARCHAR(20)     NOT NULL DEFAULT 'medium',
    title             NVARCHAR(200)    NOT NULL,
    message           NVARCHAR(MAX)    NOT NULL,
    -- NULL = broadcast to all authenticated RM users
    assigned_rm       NVARCHAR(100)    NULL,
    created_at        DATETIME         NOT NULL DEFAULT GETDATE(),
    -- NULL = unread; set by POST /api/notifications/[id]/read
    read_at           DATETIME         NULL
  );
  PRINT 'Created table: Notifications';
END
ELSE
  PRINT 'Table already exists: Notifications';
GO

-- Index: per-user inbox fetch (polled by NotificationBell every 60s)
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_Notifications_AssignedRM_CreatedAt'
    AND object_id = OBJECT_ID('dbo.Notifications')
)
BEGIN
  CREATE INDEX IX_Notifications_AssignedRM_CreatedAt
    ON [dbo].[Notifications] (assigned_rm, created_at DESC)
    INCLUDE (priority, notification_type, read_at);
  PRINT 'Created index: IX_Notifications_AssignedRM_CreatedAt';
END
GO

-- Index: unread count query (used by NotificationBell badge)
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_Notifications_AssignedRM_ReadAt'
    AND object_id = OBJECT_ID('dbo.Notifications')
)
BEGIN
  CREATE INDEX IX_Notifications_AssignedRM_ReadAt
    ON [dbo].[Notifications] (assigned_rm, read_at)
    WHERE read_at IS NULL;
  PRINT 'Created index: IX_Notifications_AssignedRM_ReadAt';
END
GO


-- ─── Sample verification queries ──────────────────────────────────────────────

-- Count rows in both new tables
-- SELECT 'SystemActions' AS tbl, COUNT(*) AS rows FROM [dbo].[SystemActions]
-- UNION ALL
-- SELECT 'Notifications',        COUNT(*) FROM [dbo].[Notifications];

-- Show recent stage changes
-- SELECT TOP 10 client_id, old_stage, new_stage, trigger_reason, created_at
-- FROM [dbo].[SystemActions]
-- WHERE event_type = 'stage_change'
-- ORDER BY created_at DESC;

-- Show unread notifications per RM
-- SELECT assigned_rm, COUNT(*) AS unread
-- FROM [dbo].[Notifications]
-- WHERE read_at IS NULL
-- GROUP BY assigned_rm
-- ORDER BY unread DESC;
