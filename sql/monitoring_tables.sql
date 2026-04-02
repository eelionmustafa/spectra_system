-- ─────────────────────────────────────────────────────────────────────────────
-- SPECTRA — Enhanced Monitoring Tables DDL
-- Review cadence, document requests, and collateral revaluations.
--
-- Note: The Next.js application creates these tables automatically on first use
-- via DDL-on-first-use guards in monitoringService.ts.
-- Run this script manually only when provisioning a new database or when you
-- want to pre-create the tables before first app startup.
-- ─────────────────────────────────────────────────────────────────────────────

USE [SPECTRA];
GO

-- ─── ClientMonitoring ─────────────────────────────────────────────────────────
-- One row per client. Stores the review cadence (auto-set from IFRS stage) and
-- a credit-freeze flag set automatically when the client escalates to Stage 2 or 3.
--
-- review_frequency values: 'Monthly' | 'Weekly' | 'Daily'
--   Stage 1 → Monthly  (standard watch)
--   Stage 2 → Weekly   (SICR — Significant Increase in Credit Risk)
--   Stage 3 → Daily    (NPL — Non-Performing Loan)
--
-- is_freezed: BIT — 1 = credit disbursements frozen; set automatically on
--             stage escalation; can be manually overridden via
--             PATCH /api/monitoring/[id]

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'ClientMonitoring' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[ClientMonitoring] (
    client_id         NVARCHAR(50)  NOT NULL PRIMARY KEY,
    review_frequency  NVARCHAR(20)  NOT NULL DEFAULT 'Monthly',
    is_freezed        BIT           NOT NULL DEFAULT 0,
    frozen_at         DATETIME      NULL,
    updated_at        DATETIME      NOT NULL DEFAULT GETDATE()
  );
  PRINT 'Created table: ClientMonitoring';
END
ELSE
  PRINT 'Table already exists: ClientMonitoring';
GO


-- ─── DocumentRequests ─────────────────────────────────────────────────────────
-- Track RM-initiated requests for financial documents.
-- One row per request. status transitions: Pending → Received.
--
-- document_type values:
--   'financial_statement' — Annual / quarterly P&L, balance sheet
--   'bank_statement'      — Salary and current account statements
--   'tax_return'          — Income tax filing
--   'other'               — Any other supporting document

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'DocumentRequests' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[DocumentRequests] (
    id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    client_id       NVARCHAR(50)     NOT NULL,
    credit_id       NVARCHAR(50)     NULL,
    document_type   NVARCHAR(50)     NOT NULL,
    -- 'Pending' | 'Received'
    status          NVARCHAR(20)     NOT NULL DEFAULT 'Pending',
    requested_by    NVARCHAR(100)    NOT NULL,
    notes           NVARCHAR(MAX)    NULL,
    requested_at    DATETIME         NOT NULL DEFAULT GETDATE(),
    -- NULL until marked received via PATCH /api/monitoring/[id]/documents/[docId]
    received_at     DATETIME         NULL
  );
  PRINT 'Created table: DocumentRequests';
END
ELSE
  PRINT 'Table already exists: DocumentRequests';
GO

-- Index: per-client document history
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_DocumentRequests_ClientID_RequestedAt'
    AND object_id = OBJECT_ID('dbo.DocumentRequests')
)
BEGIN
  CREATE INDEX IX_DocumentRequests_ClientID_RequestedAt
    ON [dbo].[DocumentRequests] (client_id, requested_at DESC)
    INCLUDE (document_type, status);
  PRINT 'Created index: IX_DocumentRequests_ClientID_RequestedAt';
END
GO


-- ─── CollateralReview ─────────────────────────────────────────────────────────
-- Collateral revaluation records. One row per revaluation event.
-- ltv_recalculated is computed server-side as:
--   current_exposure / new_value * 100  (rounded to 2 decimal places)
--
-- Used for mortgage and secured-loan clients where collateral value directly
-- affects ECL staging under IFRS 9 §B5.5.17 (secured assets).

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'CollateralReview' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[CollateralReview] (
    id                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    client_id           NVARCHAR(50)     NOT NULL,
    credit_id           NVARCHAR(50)     NULL,
    revaluation_date    DATE             NOT NULL,
    -- Market value before revaluation (NULL on first review)
    old_value           FLOAT            NULL,
    -- Updated market value (required)
    new_value           FLOAT            NOT NULL,
    -- Outstanding loan balance at time of review
    current_exposure    FLOAT            NULL,
    reviewed_by         NVARCHAR(100)    NOT NULL,
    notes               NVARCHAR(MAX)    NULL,
    created_at          DATETIME         NOT NULL DEFAULT GETDATE()
  );
  PRINT 'Created table: CollateralReview';
END
ELSE
  PRINT 'Table already exists: CollateralReview';
GO

-- Index: per-client collateral history (most recent first)
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_CollateralReview_ClientID_RevalDate'
    AND object_id = OBJECT_ID('dbo.CollateralReview')
)
BEGIN
  CREATE INDEX IX_CollateralReview_ClientID_RevalDate
    ON [dbo].[CollateralReview] (client_id, revaluation_date DESC)
    INCLUDE (new_value, current_exposure);
  PRINT 'Created index: IX_CollateralReview_ClientID_RevalDate';
END
GO


-- ── Migration: drop dead columns (existing deployments) ───────────────────────
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.ClientMonitoring') AND name = N'freeze_reason'
)
BEGIN
  ALTER TABLE [dbo].[ClientMonitoring] DROP COLUMN [freeze_reason];
  PRINT N'Dropped dead column: ClientMonitoring.freeze_reason';
END
GO

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.CollateralReview') AND name = N'ltv_recalculated'
)
BEGIN
  -- Rebuild the index without the dropped column first
  IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.CollateralReview') AND name = N'IX_CollateralReview_ClientID_RevalDate'
  )
    DROP INDEX [IX_CollateralReview_ClientID_RevalDate] ON [dbo].[CollateralReview];

  ALTER TABLE [dbo].[CollateralReview] DROP COLUMN [ltv_recalculated];

  CREATE INDEX [IX_CollateralReview_ClientID_RevalDate]
    ON [dbo].[CollateralReview] (client_id, revaluation_date DESC)
    INCLUDE (new_value, current_exposure);

  PRINT N'Dropped dead column: CollateralReview.ltv_recalculated';
END
GO

-- ─── Sample verification queries ──────────────────────────────────────────────

-- Count rows in all three tables
-- SELECT 'ClientMonitoring' AS tbl,  COUNT(*) AS rows FROM [dbo].[ClientMonitoring]
-- UNION ALL
-- SELECT 'DocumentRequests',          COUNT(*) FROM [dbo].[DocumentRequests]
-- UNION ALL
-- SELECT 'CollateralReview',          COUNT(*) FROM [dbo].[CollateralReview];

-- Show currently frozen clients
-- SELECT client_id, review_frequency, freeze_reason, frozen_at
-- FROM [dbo].[ClientMonitoring]
-- WHERE is_freezed = 1
-- ORDER BY frozen_at DESC;

-- Show pending document requests
-- SELECT dr.client_id, dr.document_type, dr.requested_by, dr.requested_at
-- FROM [dbo].[DocumentRequests] dr
-- WHERE dr.status = 'Pending'
-- ORDER BY dr.requested_at DESC;

-- Show latest collateral LTV per client
-- SELECT client_id, revaluation_date, new_value, ltv_recalculated, reviewed_by
-- FROM [dbo].[CollateralReview]
-- WHERE ltv_recalculated IS NOT NULL
-- ORDER BY revaluation_date DESC;
