-- SPECTRA Computed Metrics: Database-side pre-computation layer
-- Run once against SPECTRA database. Safe to re-run (IF NOT EXISTS guards).

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = N'PortfolioKPISnapshot' AND schema_id = SCHEMA_ID(N'dbo')
)
BEGIN
  CREATE TABLE [dbo].[PortfolioKPISnapshot] (
    SnapshotID      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    CalculationDate VARCHAR(30) NOT NULL,
    total_clients   INT NOT NULL DEFAULT 0,
    total_exposure  FLOAT NOT NULL DEFAULT 0,
    stage1_count    INT NOT NULL DEFAULT 0,
    stage2_count    INT NOT NULL DEFAULT 0,
    stage3_count    INT NOT NULL DEFAULT 0,
    stage1_pct      FLOAT NOT NULL DEFAULT 0,
    stage2_pct      FLOAT NOT NULL DEFAULT 0,
    stage3_pct      FLOAT NOT NULL DEFAULT 0,
    health_score    INT NOT NULL DEFAULT 0,
    health_label    NVARCHAR(20) NOT NULL DEFAULT N'Unknown',
    npl_ratio_pct   FLOAT NOT NULL DEFAULT 0,
    hhi_client      FLOAT NOT NULL DEFAULT 0,
    avg_ltv         FLOAT NOT NULL DEFAULT 0,
    RefreshedAt     DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_PortfolioKPI_CalcDate UNIQUE (CalculationDate)
  );
  PRINT N'Created dbo.PortfolioKPISnapshot';
END ELSE
  PRINT N'dbo.PortfolioKPISnapshot already exists -- skipping';
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = N'ClientMetricsCache' AND schema_id = SCHEMA_ID(N'dbo')
)
BEGIN
  CREATE TABLE [dbo].[ClientMetricsCache] (
    CacheID         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    clientID        NVARCHAR(50) NOT NULL,
    CalculationDate VARCHAR(30) NOT NULL,
    ifrs_stage      INT NOT NULL DEFAULT 1,
    total_exposure  FLOAT NOT NULL DEFAULT 0,
    current_due_days FLOAT NOT NULL DEFAULT 0,
    -- risk_tier: DPD+Stage-only tier (not ML tier). Values: 'default-imminent' | 'deteriorating' | 'stable-watch'
    risk_tier       NVARCHAR(30) NOT NULL DEFAULT N'stable-watch',
    -- sicr_flagged: 1 when Stage >= 2 OR DueDays >= 30 (IFRS 9 backstop)
    sicr_flagged    BIT NOT NULL DEFAULT 0,
    RefreshedAt     DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_ClientMetrics_ClientDate UNIQUE (clientID, CalculationDate)
  );
  CREATE INDEX IX_ClientMetricsCache_clientID ON [dbo].[ClientMetricsCache] (clientID);
  CREATE INDEX IX_ClientMetricsCache_CalcDate ON [dbo].[ClientMetricsCache] (CalculationDate);
  PRINT N'Created dbo.ClientMetricsCache';
END ELSE
  PRINT N'dbo.ClientMetricsCache already exists -- skipping';
GO

-- sp_RefreshPortfolioKPI
IF OBJECT_ID(N'dbo.sp_RefreshPortfolioKPI', N'P') IS NOT NULL
  DROP PROCEDURE [dbo].[sp_RefreshPortfolioKPI];
GO

CREATE PROCEDURE [dbo].[sp_RefreshPortfolioKPI] AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @mcd VARCHAR(30);
  SELECT TOP 1 @mcd = CAST(CalculationDate AS VARCHAR(30))
  FROM [dbo].[RiskPortfolio] WITH (NOLOCK) ORDER BY CalculationDate DESC;
  IF @mcd IS NULL RETURN;

  WITH base AS (
    SELECT
      COUNT(*) AS total_clients,
      COALESCE(SUM(TRY_CAST(totalExposure AS FLOAT)), 0) AS total_exposure,
      SUM(CASE WHEN Stage = 1 THEN 1 ELSE 0 END) AS stage1_count,
      SUM(CASE WHEN Stage = 2 THEN 1 ELSE 0 END) AS stage2_count,
      SUM(CASE WHEN Stage = 3 THEN 1 ELSE 0 END) AS stage3_count,
      ROUND(100.0 * SUM(CASE WHEN Stage = 2 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS stage2_pct,
      ROUND(100.0 * SUM(CASE WHEN Stage = 3 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS stage3_pct,
      ROUND(100.0 * SUM(CASE WHEN Stage = 3 THEN TRY_CAST(totalExposure AS FLOAT) ELSE 0 END)
            / NULLIF(SUM(TRY_CAST(totalExposure AS FLOAT)), 0), 1) AS npl_ratio_pct
    FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE CalculationDate = @mcd
  ),
  derived AS (
    SELECT total_clients, total_exposure, stage1_count, stage2_count, stage3_count,
      stage2_pct, stage3_pct, npl_ratio_pct,
      ROUND(CASE WHEN 100.0 - stage2_pct - stage3_pct < 0 THEN 0.0 ELSE 100.0 - stage2_pct - stage3_pct END, 1) AS stage1_pct,
      CASE WHEN 100 - stage2_pct * 1 - stage3_pct * 3 < 0 THEN 0
           WHEN 100 - stage2_pct * 1 - stage3_pct * 3 > 100 THEN 100
           ELSE ROUND(100 - stage2_pct * 1 - stage3_pct * 3, 0) END AS health_score
    FROM base
  )
  MERGE [dbo].[PortfolioKPISnapshot] AS tgt
  USING (
    SELECT @mcd AS CalculationDate, d.total_clients, d.total_exposure,
      d.stage1_count, d.stage2_count, d.stage3_count,
      d.stage1_pct, d.stage2_pct, d.stage3_pct, d.health_score,
      CASE WHEN d.health_score >= 85 THEN N'Healthy'
           WHEN d.health_score >= 70 THEN N'Watch'
           WHEN d.health_score >= 50 THEN N'Stressed'
           ELSE N'Critical' END AS health_label,
      d.npl_ratio_pct, 0.0 AS avg_ltv,
      (SELECT ROUND(SUM(POWER(100.0 * exp_c / NULLIF(d.total_exposure, 0.0), 2.0)), 0)
       FROM (SELECT SUM(TRY_CAST(totalExposure AS FLOAT)) AS exp_c
             FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
             WHERE CalculationDate = @mcd AND TRY_CAST(totalExposure AS FLOAT) > 0
             GROUP BY clientID) hhi_sub) AS hhi_client
    FROM derived d
  ) AS src
  ON tgt.CalculationDate = src.CalculationDate
  WHEN MATCHED THEN UPDATE SET
    total_clients=src.total_clients, total_exposure=src.total_exposure,
    stage1_count=src.stage1_count, stage2_count=src.stage2_count, stage3_count=src.stage3_count,
    stage1_pct=src.stage1_pct, stage2_pct=src.stage2_pct, stage3_pct=src.stage3_pct,
    health_score=src.health_score, health_label=src.health_label,
    npl_ratio_pct=src.npl_ratio_pct, hhi_client=src.hhi_client, avg_ltv=src.avg_ltv, RefreshedAt=GETDATE()
  WHEN NOT MATCHED THEN
    INSERT (CalculationDate, total_clients, total_exposure, stage1_count, stage2_count, stage3_count,
            stage1_pct, stage2_pct, stage3_pct, health_score, health_label, npl_ratio_pct, hhi_client, avg_ltv)
    VALUES (src.CalculationDate, src.total_clients, src.total_exposure, src.stage1_count, src.stage2_count, src.stage3_count,
            src.stage1_pct, src.stage2_pct, src.stage3_pct, src.health_score, src.health_label, src.npl_ratio_pct, src.hhi_client, src.avg_ltv);

  PRINT N'sp_RefreshPortfolioKPI: refreshed for ' + @mcd;
END
GO

-- sp_RefreshClientMetrics
IF OBJECT_ID(N'dbo.sp_RefreshClientMetrics', N'P') IS NOT NULL
  DROP PROCEDURE [dbo].[sp_RefreshClientMetrics];
GO

CREATE PROCEDURE [dbo].[sp_RefreshClientMetrics] AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @mcd VARCHAR(30);
  SELECT TOP 1 @mcd = CAST(CalculationDate AS VARCHAR(30))
  FROM [dbo].[RiskPortfolio] WITH (NOLOCK) ORDER BY CalculationDate DESC;
  IF @mcd IS NULL RETURN;

  DECLARE @mdid VARCHAR(30);
  SELECT TOP 1 @mdid = CAST(dateID AS VARCHAR(30))
  FROM [dbo].[DueDaysDaily] WITH (NOLOCK) ORDER BY dateID DESC;

  MERGE [dbo].[ClientMetricsCache] AS tgt
  USING (
    WITH latest_dpd AS (
      SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS current_due_days
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK) WHERE dateID = @mdid GROUP BY PersonalID
    )
    SELECT rp.clientID, @mcd AS CalculationDate,
      COALESCE(rp.Stage, 1) AS ifrs_stage,
      COALESCE(TRY_CAST(rp.totalExposure AS FLOAT), 0.0) AS total_exposure,
      COALESCE(ld.current_due_days, 0.0) AS current_due_days,
      CASE
        WHEN COALESCE(ld.current_due_days, 0) >= 90 OR COALESCE(rp.Stage, 1) = 3
          THEN N'default-imminent'
        WHEN COALESCE(ld.current_due_days, 0) >= 30 OR COALESCE(rp.Stage, 1) = 2
          THEN N'deteriorating'
        ELSE N'stable-watch'
      END AS risk_tier,
      CASE WHEN COALESCE(rp.Stage, 1) >= 2 OR COALESCE(ld.current_due_days, 0) >= 30 THEN 1 ELSE 0 END AS sicr_flagged
    FROM [dbo].[RiskPortfolio] rp WITH (NOLOCK)
    LEFT JOIN latest_dpd ld ON ld.PersonalID = rp.clientID
    WHERE rp.CalculationDate = @mcd
  ) AS src
  ON tgt.clientID = src.clientID AND tgt.CalculationDate = src.CalculationDate
  WHEN MATCHED THEN UPDATE SET
    ifrs_stage=src.ifrs_stage, total_exposure=src.total_exposure,
    current_due_days=src.current_due_days, risk_tier=src.risk_tier,
    sicr_flagged=src.sicr_flagged, RefreshedAt=GETDATE()
  WHEN NOT MATCHED THEN
    INSERT (clientID, CalculationDate, ifrs_stage, total_exposure, current_due_days, risk_tier, sicr_flagged)
    VALUES (src.clientID, src.CalculationDate, src.ifrs_stage, src.total_exposure, src.current_due_days, src.risk_tier, src.sicr_flagged);

  PRINT N'sp_RefreshClientMetrics: refreshed for ' + @mcd;
END
GO

-- trg_RiskPortfolio_AfterInsert: auto-refresh on bulk INSERT
-- 0x53504543545241 = ASCII bytes for SPECTRA (re-entrancy guard)
IF OBJECT_ID(N'dbo.trg_RiskPortfolio_AfterInsert', N'TR') IS NOT NULL
  DROP TRIGGER [dbo].[trg_RiskPortfolio_AfterInsert];
GO

CREATE TRIGGER [dbo].[trg_RiskPortfolio_AfterInsert]
ON [dbo].[RiskPortfolio]
AFTER INSERT
AS
BEGIN
  SET NOCOUNT ON;
  IF CONTEXT_INFO() = 0x53504543545241 RETURN;

  DECLARE @saved VARBINARY(128) = CONTEXT_INFO();
  SET CONTEXT_INFO 0x53504543545241;

  BEGIN TRY
    EXEC [dbo].[sp_RefreshPortfolioKPI];
    EXEC [dbo].[sp_RefreshClientMetrics];
  END TRY
  BEGIN CATCH
    PRINT N'SPECTRA trigger: refresh failed -- ' + ERROR_MESSAGE();
  END CATCH

  IF @saved IS NULL SET CONTEXT_INFO 0x0; ELSE SET CONTEXT_INFO @saved;
END
GO

-- Initial population: seed both tables immediately after setup
EXEC [dbo].[sp_RefreshPortfolioKPI];
EXEC [dbo].[sp_RefreshClientMetrics];
GO

PRINT N'=== SPECTRA computed metrics setup complete ===';
GO
