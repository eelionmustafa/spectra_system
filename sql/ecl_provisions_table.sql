-- ─────────────────────────────────────────────────────────────────────────────
-- SPECTRA — ECLProvisions Table DDL
-- IFRS 9 Expected Credit Loss provision snapshots.
--
-- One row is written every time the classification engine reclassifies a client
-- to a different stage. The most-recent row per client represents the current
-- provision obligation.
--
-- Provision formula: ECL = PD × LGD × EAD  (IFRS 9 §5.5)
-- Rates are derived in eclProvisionService.ts from config.ts ECL parameters:
--   Stage 1 →  1%  (PD_12M=2.22%      × LGD=45%)  12-month ECL          (IFRS 9 §5.5.5)
--   Stage 2 →  5%  (PD_Lifetime=11.1% × LGD=45%)  Lifetime ECL — SICR   (IFRS 9 §5.5.3)
--   Stage 3 → 20%  (PD_Impaired=100%  × LGD_Impaired=20%) Lifetime ECL, credit-impaired (IFRS 9 §5.5.3, §B5.5.17)
--
-- Note: The Next.js application creates this table automatically on first use
-- via DDL-on-first-use guard in eclProvisionService.ts.
-- Run this script manually only when provisioning a new database or when you
-- want to pre-create the table before first app startup.
-- ─────────────────────────────────────────────────────────────────────────────

USE [SPECTRA];
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'ECLProvisions' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[ECLProvisions] (
    id                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    client_id            NVARCHAR(50)     NOT NULL,
    credit_id            NVARCHAR(50)     NULL,
    -- 1 | 2 | 3
    stage                INT              NOT NULL,
    -- '12Month' | 'Lifetime'
    ecl_type             NVARCHAR(20)     NOT NULL,
    -- Outstanding loan balance at time of calculation
    outstanding_balance  FLOAT            NOT NULL,
    -- Flat rate applied: 0.01 | 0.05 | 0.20
    provision_rate       FLOAT            NOT NULL,
    -- outstanding_balance × provision_rate  (rounded to 2 dp)
    provision_amount     FLOAT            NOT NULL,
    calculated_at        DATETIME         NOT NULL DEFAULT GETDATE()
  );
  PRINT 'Created table: ECLProvisions';
END
ELSE
  PRINT 'Table already exists: ECLProvisions';
GO

-- Index: per-client provision history (most recent first)
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_ECLProvisions_ClientID_CalculatedAt'
    AND object_id = OBJECT_ID('dbo.ECLProvisions')
)
BEGIN
  CREATE INDEX IX_ECLProvisions_ClientID_CalculatedAt
    ON [dbo].[ECLProvisions] (client_id, calculated_at DESC)
    INCLUDE (stage, ecl_type, provision_amount);
  PRINT 'Created index: IX_ECLProvisions_ClientID_CalculatedAt';
END
GO

-- Index: portfolio-wide aggregation by stage
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_ECLProvisions_Stage_CalculatedAt'
    AND object_id = OBJECT_ID('dbo.ECLProvisions')
)
BEGIN
  CREATE INDEX IX_ECLProvisions_Stage_CalculatedAt
    ON [dbo].[ECLProvisions] (stage, calculated_at DESC)
    INCLUDE (provision_amount, outstanding_balance);
  PRINT 'Created index: IX_ECLProvisions_Stage_CalculatedAt';
END
GO


-- ─── Sample verification queries ──────────────────────────────────────────────

-- Total SPECTRA-computed ECL by stage (latest row per client)
-- WITH latest AS (
--   SELECT client_id, stage, ecl_type, provision_amount,
--          ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY calculated_at DESC) AS rn
--   FROM [dbo].[ECLProvisions]
-- )
-- SELECT
--   stage,
--   ecl_type,
--   COUNT(*)               AS clients,
--   SUM(provision_amount)  AS total_provision
-- FROM latest WHERE rn = 1
-- GROUP BY stage, ecl_type
-- ORDER BY stage;

-- Latest provision for a specific client
-- SELECT TOP 1 *
-- FROM [dbo].[ECLProvisions]
-- WHERE client_id = '1234567890'
-- ORDER BY calculated_at DESC;
