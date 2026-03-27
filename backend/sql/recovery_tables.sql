-- ─────────────────────────────────────────────────────────────────────────────
-- SPECTRA — Recovery Tables DDL
-- RecoveryCases: formal recovery case per client.
-- WrittenOffClients: immutable registry of written-off clients; used to
--                    exclude them from active portfolio KPIs.
--
-- Stage lifecycle:
--   DebtCollection → CollateralEnforcement → LegalProceedings → DebtSale | WriteOff
--
-- Note: The Next.js application creates these tables automatically on first use
-- via DDL-on-first-use guards in recoveryService.ts / writtenOffService.ts.
-- ─────────────────────────────────────────────────────────────────────────────

USE [SPECTRA];
GO

-- ─── RecoveryCases ────────────────────────────────────────────────────────────

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'RecoveryCases' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[RecoveryCases] (
    id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    client_id       NVARCHAR(50)     NOT NULL,
    credit_id       NVARCHAR(50)     NULL,
    -- 'DebtCollection' | 'CollateralEnforcement' | 'LegalProceedings' | 'DebtSale' | 'WriteOff'
    stage           NVARCHAR(30)     NOT NULL,
    assigned_to     NVARCHAR(100)    NULL,
    -- 'Open' | 'Closed'
    status          NVARCHAR(20)     NOT NULL DEFAULT 'Open',
    notes           NVARCHAR(MAX)    NULL,
    opened_at       DATETIME         NOT NULL DEFAULT GETDATE(),
    updated_at      DATETIME         NOT NULL DEFAULT GETDATE()
  );
  PRINT 'Created table: RecoveryCases';
END
ELSE
  PRINT 'Table already exists: RecoveryCases';
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_RecoveryCases_ClientID_OpenedAt'
    AND object_id = OBJECT_ID('dbo.RecoveryCases')
)
BEGIN
  CREATE INDEX IX_RecoveryCases_ClientID_OpenedAt
    ON [dbo].[RecoveryCases] (client_id, opened_at DESC)
    INCLUDE (stage, status, assigned_to);
  PRINT 'Created index: IX_RecoveryCases_ClientID_OpenedAt';
END
GO


-- ─── WrittenOffClients ────────────────────────────────────────────────────────
-- One row per written-off client (UNIQUE on client_id — idempotent re-runs via MERGE).
-- getPortfolioKPIs() LEFT JOINs this table to exclude written-off clients from
-- total_exposure, total_clients, and stage composition percentages.

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'WrittenOffClients' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[WrittenOffClients] (
    id               UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    client_id        NVARCHAR(50)     NOT NULL UNIQUE,
    recovery_case_id NVARCHAR(36)     NULL,
    written_off_by   NVARCHAR(100)    NOT NULL,
    written_off_at   DATETIME         NOT NULL DEFAULT GETDATE(),
    notes            NVARCHAR(MAX)    NULL
  );
  PRINT 'Created table: WrittenOffClients';
END
ELSE
  PRINT 'Table already exists: WrittenOffClients';
GO


-- ─── Sample verification queries ──────────────────────────────────────────────

-- All open recovery cases by stage
-- SELECT stage, COUNT(*) AS cnt
-- FROM [dbo].[RecoveryCases]
-- WHERE status = 'Open'
-- GROUP BY stage ORDER BY cnt DESC;

-- Written-off clients with exposure
-- SELECT wo.client_id, wo.written_off_by, wo.written_off_at,
--        SUM(TRY_CAST(rp.totalExposure AS FLOAT)) AS total_exposure
-- FROM [dbo].[WrittenOffClients] wo
-- LEFT JOIN [dbo].[RiskPortfolio] rp ON rp.clientID = wo.client_id
-- GROUP BY wo.client_id, wo.written_off_by, wo.written_off_at
-- ORDER BY wo.written_off_at DESC;
