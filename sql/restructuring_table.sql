-- ─────────────────────────────────────────────────────────────────────────────
-- SPECTRA — RestructuringPlans Table DDL
-- Formal restructuring proposals raised against a client.
--
-- Status lifecycle: Proposed → Approved | Rejected → Active → Completed
--
-- Note: The Next.js application creates this table automatically on first use
-- via DDL-on-first-use guard in restructuringService.ts.
-- Run this script manually only when provisioning a new database or when you
-- want to pre-create the table before first app startup.
-- ─────────────────────────────────────────────────────────────────────────────

USE [SPECTRA];
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'RestructuringPlans' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[RestructuringPlans] (
    id                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    client_id                NVARCHAR(50)     NOT NULL,
    credit_id                NVARCHAR(50)     NULL,
    -- 'LoanExtension' | 'PaymentHoliday' | 'RateReduction' | 'DebtConsolidation' | 'PartialWriteOff'
    type                     NVARCHAR(50)     NOT NULL,
    new_maturity_date        DATE             NULL,
    holiday_duration_months  INT              NULL,
    new_interest_rate        FLOAT            NULL,
    forgiven_amount          FLOAT            NULL,
    -- 'Proposed' | 'Approved' | 'Rejected' | 'Active' | 'Completed'
    status                   NVARCHAR(20)     NOT NULL DEFAULT 'Proposed',
    approved_by              NVARCHAR(100)    NULL,
    approved_at              DATETIME         NULL,
    notes                    NVARCHAR(MAX)    NULL,
    created_by               NVARCHAR(100)    NOT NULL,
    created_at               DATETIME         NOT NULL DEFAULT GETDATE(),
    updated_at               DATETIME         NOT NULL DEFAULT GETDATE()
  );
  PRINT 'Created table: RestructuringPlans';
END
ELSE
  PRINT 'Table already exists: RestructuringPlans';
GO

-- Index: per-client plan history, newest first
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_RestructuringPlans_ClientID_CreatedAt'
    AND object_id = OBJECT_ID('dbo.RestructuringPlans')
)
BEGIN
  CREATE INDEX IX_RestructuringPlans_ClientID_CreatedAt
    ON [dbo].[RestructuringPlans] (client_id, created_at DESC)
    INCLUDE (type, status);
  PRINT 'Created index: IX_RestructuringPlans_ClientID_CreatedAt';
END
GO


-- ─── Sample verification queries ──────────────────────────────────────────────

-- All open plans (Proposed / Approved / Active)
-- SELECT client_id, type, status, created_by, created_at
-- FROM [dbo].[RestructuringPlans]
-- WHERE status IN ('Proposed', 'Approved', 'Active')
-- ORDER BY created_at DESC;

-- Active plan per client (most recent open plan)
-- SELECT TOP 1 *
-- FROM [dbo].[RestructuringPlans]
-- WHERE client_id = '1234567890'
--   AND status IN ('Proposed', 'Approved', 'Active')
-- ORDER BY created_at DESC;
