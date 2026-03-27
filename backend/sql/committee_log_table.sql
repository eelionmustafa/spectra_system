-- ─────────────────────────────────────────────────────────────────────────────
-- SPECTRA — CreditCommitteeLog Table DDL
-- Formal credit committee escalations and decisions.
--
-- Lifecycle:
--   Escalation created  → Decision = 'Pending'  (via POST /api/clients/[id]/committee)
--   Committee decides   → Decision updated       (via PATCH /api/clients/[id]/committee/[logId])
--
-- Every write is also mirrored to ClientActions so committee events appear
-- in the Actions Log tab without additional queries.
--
-- Note: The Next.js application creates this table automatically on first use
-- via DDL-on-first-use guard in committeeService.ts.
-- ─────────────────────────────────────────────────────────────────────────────

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'CreditCommitteeLog' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[CreditCommitteeLog] (
    id             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    client_id      NVARCHAR(50)     NOT NULL,
    credit_id      NVARCHAR(50)     NULL,
    escalated_by   NVARCHAR(100)    NOT NULL,
    escalated_at   DATETIME         NOT NULL DEFAULT GETDATE(),
    -- 'Restructure' | 'LegalAction' | 'WriteOff' | 'Pending'
    decision       NVARCHAR(30)     NOT NULL DEFAULT 'Pending',
    -- NULL until committee makes a decision
    decision_date  DATE             NULL,
    decided_by     NVARCHAR(100)    NULL,
    notes          NVARCHAR(MAX)    NULL,
    updated_at     DATETIME         NOT NULL DEFAULT GETDATE()
  );
  PRINT 'Created table: CreditCommitteeLog';
END
ELSE
  PRINT 'Table already exists: CreditCommitteeLog';
GO

-- Index: per-client committee history (most recent first)
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_CreditCommitteeLog_ClientID_EscalatedAt'
    AND object_id = OBJECT_ID('dbo.CreditCommitteeLog')
)
BEGIN
  CREATE INDEX IX_CreditCommitteeLog_ClientID_EscalatedAt
    ON [dbo].[CreditCommitteeLog] (client_id, escalated_at DESC)
    INCLUDE (decision, escalated_by);
  PRINT 'Created index: IX_CreditCommitteeLog_ClientID_EscalatedAt';
END
GO


-- ─── Sample verification queries ──────────────────────────────────────────────

-- All pending escalations (awaiting committee decision)
-- SELECT client_id, escalated_by, escalated_at, notes
-- FROM [dbo].[CreditCommitteeLog]
-- WHERE decision = 'Pending'
-- ORDER BY escalated_at DESC;

-- Decision breakdown
-- SELECT decision, COUNT(*) AS cnt
-- FROM [dbo].[CreditCommitteeLog]
-- GROUP BY decision
-- ORDER BY cnt DESC;
