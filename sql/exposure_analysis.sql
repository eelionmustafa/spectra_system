-- Description: Exposure breakdown by product type, region, and risk stage
-- Scope: Full portfolio; aggregated for Power BI slicers
-- Source tables: RiskPortfolio, Credits, Customer
-- Usage: Export to /data/processed/exposure_analysis.csv for Power BI Import mode

WITH latest_risk AS (
    SELECT
        r.clientID,
        r.arrangementID,
        r.TypeOfProduct                                                     AS product_type,
        r.ProductDesc                                                       AS product_desc,
        r.Stage,
        r.stageDescr,
        r.BankCurrentRating,
        r.totalExposure,
        r.onBalanceExposure,
        r.TotalOffBalance,
        r.CalculatedProvision,
        r.CalculationDate,
        ROW_NUMBER() OVER (PARTITION BY r.arrangementID ORDER BY r.CalculationDate DESC) AS rn
    FROM [dbo].[RiskPortfolio] r WITH (NOLOCK)
),
customer_geo AS (
    SELECT
        c.PersonalID,
        c.City,
        c.Branch,
        c.CustomerType,
        c.Occupation
    FROM [dbo].[Customer] c WITH (NOLOCK)
)
SELECT
    lr.product_type,
    lr.product_desc,
    lr.Stage,
    lr.stageDescr                                                           AS stage_description,
    lr.BankCurrentRating                                                    AS risk_rating,
    cg.City                                                                 AS region,
    cg.Branch,
    cg.CustomerType                                                         AS customer_type,
    COUNT(DISTINCT lr.clientID)                                             AS client_count,
    COUNT(DISTINCT lr.arrangementID)                                        AS arrangement_count,
    SUM(TRY_CAST(lr.totalExposure AS FLOAT))                                                   AS total_exposure,
    SUM(TRY_CAST(lr.onBalanceExposure AS FLOAT))                                               AS on_balance_exposure,
    SUM(TRY_CAST(lr.TotalOffBalance AS FLOAT))                                                 AS off_balance_exposure,
    SUM(TRY_CAST(lr.CalculatedProvision AS FLOAT))                                             AS total_provision,
    CAST(SUM(TRY_CAST(lr.CalculatedProvision AS FLOAT)) AS FLOAT) /
        NULLIF(SUM(TRY_CAST(lr.onBalanceExposure AS FLOAT)), 0) * 100                         AS provision_coverage_pct
FROM latest_risk lr
LEFT JOIN customer_geo cg ON lr.clientID = cg.PersonalID
WHERE lr.rn = 1
GROUP BY
    lr.product_type,
    lr.product_desc,
    lr.Stage,
    lr.stageDescr,
    lr.BankCurrentRating,
    cg.City,
    cg.Branch,
    cg.CustomerType
ORDER BY total_exposure DESC;
