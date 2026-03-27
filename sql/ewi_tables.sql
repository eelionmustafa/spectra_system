-- ─────────────────────────────────────────────────────────────────────────────
-- SPECTRA — EWI Tables DDL
-- EWIPredictions:    ML-driven deterioration predictions per client, generated
--                    by the pipeline or /api/ewi/fire endpoint.
-- EWIRecommendations: Actionable items generated from EWI signals / ML rules;
--                    tracked with is_actioned flag.
--
-- Note: The Next.js application creates these tables automatically on first use
-- via DDL-on-first-use guards in ewiPredictionsService.ts /
-- ewiRecommendationsService.ts.
-- ─────────────────────────────────────────────────────────────────────────────

USE [SPECTRA];
GO

-- ─── EWIPredictions ──────────────────────────────────────────────────────────

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'EWIPredictions' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[EWIPredictions] (
    id                 UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    client_id          NVARCHAR(50)     NOT NULL,
    -- 0–1 ML deterioration probability (higher = worse)
    risk_score         FLOAT            NOT NULL,
    -- 'Critical' | 'High' | 'Medium' | 'Low'
    deterioration_risk NVARCHAR(20)     NOT NULL,
    -- JSON array of signal strings, e.g. ["Salary stopped","DPD rising"]
    key_signals        NVARCHAR(MAX)    NULL,
    ai_reasoning       NVARCHAR(MAX)    NULL,
    run_date           DATETIME         NOT NULL DEFAULT GETDATE()
  );
  PRINT 'Created table: EWIPredictions';
END
ELSE
  PRINT 'Table already exists: EWIPredictions';
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_EWIPredictions_ClientID'
    AND object_id = OBJECT_ID('dbo.EWIPredictions')
)
BEGIN
  CREATE NONCLUSTERED INDEX [IX_EWIPredictions_ClientID]
    ON [dbo].[EWIPredictions] (client_id)
    INCLUDE (risk_score, deterioration_risk, run_date);
  PRINT 'Created index: IX_EWIPredictions_ClientID';
END
GO


-- ─── EWIRecommendations ──────────────────────────────────────────────────────

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'EWIRecommendations' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[EWIRecommendations] (
    id                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    client_id            NVARCHAR(50)     NOT NULL,
    credit_id            NVARCHAR(50)     NULL,
    -- 'Urgent' | 'High' | 'Medium' | 'Low'
    priority             NVARCHAR(20)     NOT NULL DEFAULT 'Medium',
    -- e.g. 'Contact Client' | 'Restructure' | 'Escalate' | 'Monitor' | 'Legal Action'
    recommendation_type  NVARCHAR(50)     NOT NULL,
    description          NVARCHAR(MAX)    NULL,
    is_actioned          BIT              NOT NULL DEFAULT 0,
    actioned_by          NVARCHAR(100)    NULL,
    actioned_at          DATETIME         NULL,
    created_at           DATETIME         NOT NULL DEFAULT GETDATE()
  );
  PRINT 'Created table: EWIRecommendations';
END
ELSE
  PRINT 'Table already exists: EWIRecommendations';
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_EWIRecommendations_ClientID_IsActioned'
    AND object_id = OBJECT_ID('dbo.EWIRecommendations')
)
BEGIN
  CREATE NONCLUSTERED INDEX [IX_EWIRecommendations_ClientID_IsActioned]
    ON [dbo].[EWIRecommendations] (client_id, is_actioned)
    INCLUDE (recommendation_type, created_at);
  PRINT 'Created index: IX_EWIRecommendations_ClientID_IsActioned';
END
GO


-- ─── Sample verification queries ──────────────────────────────────────────────

-- Latest prediction per client, ranked by risk_score
-- SELECT TOP 20 client_id, risk_score, deterioration_risk, run_date
-- FROM (
--   SELECT *, ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY run_date DESC) AS rn
--   FROM [dbo].[EWIPredictions]
-- ) t WHERE rn = 1 ORDER BY risk_score DESC;

-- Open recommendations by priority
-- SELECT priority, COUNT(*) AS cnt
-- FROM [dbo].[EWIRecommendations]
-- WHERE is_actioned = 0
-- GROUP BY priority ORDER BY cnt DESC;
