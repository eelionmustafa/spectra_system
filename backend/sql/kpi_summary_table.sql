-- ═══════════════════════════════════════════════════════════════════════════
-- SPECTRA — KPI Summary Table + Refresh Stored Procedure
-- Run once to create the table and procedure.
-- The SQL Agent job (kpi_agent_job.sql) calls usp_RefreshKPISummary nightly.
-- Dashboard reads from kpi_summary instead of computing live.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Summary table ────────────────────────────────────────────────────────

IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'kpi_summary' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE [dbo].[kpi_summary] (
        id                      INT IDENTITY(1,1) PRIMARY KEY,
        computed_at             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        calc_date               VARCHAR(30) NOT NULL,   -- CalculationDate from RiskPortfolio

        -- Dashboard KPIs
        total_clients           INT           NOT NULL DEFAULT 0,
        delinquency_rate_pct    FLOAT         NOT NULL DEFAULT 0,
        avg_due_days            FLOAT         NOT NULL DEFAULT 0,
        total_exposure          FLOAT         NOT NULL DEFAULT 0,
        npl_ratio_pct           FLOAT         NOT NULL DEFAULT 0,
        health_score            FLOAT         NOT NULL DEFAULT 0,
        health_label            VARCHAR(20)   NOT NULL DEFAULT 'Unknown',

        -- Stage distribution (stored as JSON for simplicity)
        stage_distribution_json NVARCHAR(MAX) NULL,     -- [{stage,count,exposure}]

        -- Monthly exposure trend (last 12 months, JSON)
        monthly_exposure_json   NVARCHAR(MAX) NULL,     -- [{month,exposure}]
    )
END
GO

-- Keep only the last 90 snapshots (3 months of nightly runs)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_kpi_summary_computed_at'
)
    CREATE INDEX IX_kpi_summary_computed_at ON [dbo].[kpi_summary] (computed_at DESC)
GO

-- ─── 2. Refresh stored procedure ─────────────────────────────────────────────

CREATE OR ALTER PROCEDURE [dbo].[usp_RefreshKPISummary]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @mcd VARCHAR(30)
    SELECT @mcd = CAST(MAX(CalculationDate) AS VARCHAR(30))
    FROM [dbo].[RiskPortfolio] WITH (NOLOCK)

    IF @mcd IS NULL
    BEGIN
        RAISERROR('usp_RefreshKPISummary: RiskPortfolio is empty — skipping.', 10, 1)
        RETURN
    END

    -- ── Dashboard KPIs ────────────────────────────────────────────────────────
    DECLARE
        @total_clients        INT,
        @delinquency_rate_pct FLOAT,
        @avg_due_days         FLOAT,
        @total_exposure       FLOAT,
        @npl_ratio_pct        FLOAT,
        @health_score         FLOAT,
        @health_label         VARCHAR(20)

    ;WITH latest_dpd_per_client AS (
        SELECT PersonalID,
            TRY_CAST(DueDays AS FLOAT) AS current_dpd,
            ROW_NUMBER() OVER (PARTITION BY PersonalID ORDER BY dateID DESC) AS rn
        FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
    ),
    dpd_deduped AS (
        SELECT PersonalID, current_dpd AS max_dpd
        FROM latest_dpd_per_client WHERE rn = 1
    ),
    dpd_base AS (
        SELECT
            ROUND(100.0 * COUNT(DISTINCT CASE WHEN COALESCE(d.max_dpd, 0) >= 30 THEN rp.clientID END)
                  / NULLIF(COUNT(DISTINCT rp.clientID), 0), 1) AS delinquency_rate_pct,
            ROUND(AVG(COALESCE(d.max_dpd, 0)), 1)               AS avg_due_days
        FROM [dbo].[RiskPortfolio] rp WITH (NOLOCK)
        LEFT JOIN dpd_deduped d ON d.PersonalID = rp.clientID
        WHERE rp.CalculationDate = @mcd
    ),
    client_worst_stage AS (
        SELECT clientID,
            MAX(COALESCE(Stage, 1))                       AS worst_stage,
            SUM(TRY_CAST(totalExposure AS FLOAT))         AS client_exposure
        FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
        WHERE CalculationDate = @mcd
        GROUP BY clientID
    ),
    rp_base AS (
        SELECT
            COUNT(*)                                                                      AS total_clients,
            COALESCE(SUM(client_exposure), 0)                                            AS total_exposure,
            ROUND(100.0 * SUM(CASE WHEN worst_stage = 2 THEN client_exposure ELSE 0 END)
                  / NULLIF(SUM(client_exposure), 0), 1)                                  AS stage2_pct,
            ROUND(100.0 * SUM(CASE WHEN worst_stage = 3 THEN client_exposure ELSE 0 END)
                  / NULLIF(SUM(client_exposure), 0), 1)                                  AS stage3_pct
        FROM client_worst_stage
    )
    SELECT
        @total_clients        = r.total_clients,
        @delinquency_rate_pct = d.delinquency_rate_pct,
        @avg_due_days         = d.avg_due_days,
        @total_exposure       = r.total_exposure,
        @npl_ratio_pct        = ROUND(r.stage3_pct, 1),
        @health_score         = CASE
            WHEN 100 - r.stage2_pct * 1 - r.stage3_pct * 3 < 0   THEN 0
            WHEN 100 - r.stage2_pct * 1 - r.stage3_pct * 3 > 100 THEN 100
            ELSE ROUND(100 - r.stage2_pct * 1 - r.stage3_pct * 3, 0)
        END,
        @health_label         = CASE
            WHEN 100 - r.stage2_pct * 1 - r.stage3_pct * 3 >= 85 THEN 'Healthy'
            WHEN 100 - r.stage2_pct * 1 - r.stage3_pct * 3 >= 70 THEN 'Watch'
            WHEN 100 - r.stage2_pct * 1 - r.stage3_pct * 3 >= 50 THEN 'Stressed'
            ELSE 'Critical'
        END
    FROM dpd_base d, rp_base r

    -- ── Stage distribution JSON ───────────────────────────────────────────────
    DECLARE @stage_json NVARCHAR(MAX)
    ;WITH client_worst_stage2 AS (
        SELECT clientID, MAX(COALESCE(Stage, 1)) AS worst_stage
        FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
        WHERE CalculationDate = @mcd
        GROUP BY clientID
    ),
    stage_exposure AS (
        SELECT COALESCE(Stage, 1) AS stage, SUM(TRY_CAST(totalExposure AS FLOAT)) AS exposure
        FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
        WHERE CalculationDate = @mcd
        GROUP BY COALESCE(Stage, 1)
    ),
    stage_agg AS (
        SELECT
            'Stage ' + CAST(c.worst_stage AS VARCHAR) AS stage,
            COUNT(*)                                   AS cnt,
            e.exposure
        FROM client_worst_stage2 c
        JOIN stage_exposure e ON e.stage = c.worst_stage
        GROUP BY c.worst_stage, e.exposure
    )
    SELECT @stage_json = (
        SELECT stage, cnt AS [count], ISNULL(exposure, 0) AS exposure
        FROM stage_agg
        ORDER BY stage
        FOR JSON PATH
    )

    -- ── Monthly exposure trend JSON (last 12 months) ──────────────────────────
    DECLARE @trend_json NVARCHAR(MAX)
    DECLARE @startDate VARCHAR(10) = CAST(DATEADD(MONTH, -12, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)) AS VARCHAR(10))
    ;WITH monthly AS (
        SELECT TOP 12
            LEFT(CalculationDate, 7)              AS month,
            SUM(TRY_CAST(totalExposure AS FLOAT)) AS exposure
        FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
        WHERE CalculationDate >= @startDate
        GROUP BY LEFT(CalculationDate, 7)
        ORDER BY LEFT(CalculationDate, 7)
    )
    SELECT @trend_json = (
        SELECT month, ISNULL(exposure, 0) AS exposure
        FROM monthly
        ORDER BY month
        FOR JSON PATH
    )

    -- ── Insert new snapshot ───────────────────────────────────────────────────
    INSERT INTO [dbo].[kpi_summary] (
        calc_date, total_clients, delinquency_rate_pct, avg_due_days,
        total_exposure, npl_ratio_pct, health_score, health_label,
        stage_distribution_json, monthly_exposure_json
    ) VALUES (
        @mcd, @total_clients, @delinquency_rate_pct, @avg_due_days,
        @total_exposure, @npl_ratio_pct, @health_score, @health_label,
        @stage_json, @trend_json
    )

    -- ── Prune old snapshots (keep last 90) ────────────────────────────────────
    DELETE FROM [dbo].[kpi_summary]
    WHERE id NOT IN (
        SELECT TOP 90 id FROM [dbo].[kpi_summary] ORDER BY computed_at DESC
    )

    PRINT 'usp_RefreshKPISummary: completed for calc_date=' + @mcd
END
GO
