-- ═══════════════════════════════════════════════════════════════════════════
-- SPECTRA — Portfolio KPI Metrics
-- Database: [SPECTRA].[dbo]
-- Usage: Run monthly or on-demand; export to /data/processed/kpi_metrics.csv
-- All queries: read-only, WITH (NOLOCK), no SELECT *, fully qualified names
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 0. PORTFOLIO SUMMARY KPIs ──────────────────────────────────────────────
-- Description: Portfolio-level KPI metrics — delinquency rate, avg DPD, exposure by stage
-- Scope: All active credits; summarizes portfolio health at a point in time
-- Source tables: DueDaysDaily, Credits, RiskPortfolio

WITH latest_due AS (
    SELECT
        d.CreditAccount,
        d.PersonalID,
        d.DueDays,
        d.DueMax6M,
        d.DueMax1Y,
        d.DueMax2Y,
        ROW_NUMBER() OVER (PARTITION BY d.CreditAccount ORDER BY d.dateID DESC) AS rn
    FROM [SPECTRA].[dbo].[DueDaysDaily] d WITH (NOLOCK)
),
delinquency_flags AS (
    SELECT
        ld.CreditAccount,
        ld.PersonalID,
        ld.DueDays                                                          AS current_due_days,
        ld.DueMax6M                                                         AS max_due_6m,
        ld.DueMax1Y                                                         AS max_due_1y,
        ld.DueMax2Y                                                         AS max_due_2y,
        CASE WHEN ld.DueDays >= 30 THEN 1 ELSE 0 END                       AS is_delinquent,
        CASE WHEN ld.DueDays > 0  THEN 1 ELSE 0 END                        AS has_any_delay
    FROM latest_due ld
    WHERE ld.rn = 1
),
risk_snapshot AS (
    SELECT
        r.clientID,
        r.BankCurrentRating,
        r.Stage,
        r.totalExposure,
        r.onBalanceExposure,
        r.TotalOffBalance,
        ROW_NUMBER() OVER (PARTITION BY r.clientID ORDER BY r.CalculationDate DESC) AS rn
    FROM [SPECTRA].[dbo].[RiskPortfolio] r WITH (NOLOCK)
)
SELECT
    COUNT(DISTINCT df.PersonalID)                                           AS total_clients,
    COUNT(DISTINCT df.CreditAccount)                                        AS total_credits,
    AVG(CAST(df.current_due_days AS FLOAT))                                 AS avg_due_days,
    SUM(df.is_delinquent)                                                   AS delinquent_count,
    CAST(SUM(df.is_delinquent) AS FLOAT) / NULLIF(COUNT(*), 0) * 100       AS delinquency_rate_pct,
    CAST(SUM(df.has_any_delay)  AS FLOAT) / NULLIF(COUNT(*), 0) * 100      AS late_payment_ratio_pct,
    SUM(rs.totalExposure)                                                   AS total_exposure,
    SUM(rs.onBalanceExposure)                                               AS on_balance_exposure,
    SUM(rs.TotalOffBalance)                                                 AS off_balance_exposure
FROM delinquency_flags df
LEFT JOIN risk_snapshot rs
    ON  df.PersonalID = rs.clientID
    AND rs.rn = 1;


-- ─── 1. ROLLRATE MATRIX ─────────────────────────────────────────────────────
-- Description: Rollrate matrix — customer movement between DPD buckets MoM
-- Source: DueDaysDaily (dateID, CreditAccount, PersonalID, DueDays)
-- Python: Pivot into matrix heatmap; flag if 0→30-59 DPD rate increases >10pp MoM

WITH bucketed AS (
    SELECT
        PersonalID, CreditAccount, dateID,
        CASE
            WHEN DueDays = 0               THEN '0 - Current'
            WHEN DueDays BETWEEN 1 AND 29  THEN '1-29 DPD'
            WHEN DueDays BETWEEN 30 AND 59 THEN '30-59 DPD'
            WHEN DueDays BETWEEN 60 AND 89 THEN '60-89 DPD'
            ELSE '90+ DPD'
        END AS dpd_bucket,
        LAG(CASE
            WHEN DueDays = 0               THEN '0 - Current'
            WHEN DueDays BETWEEN 1 AND 29  THEN '1-29 DPD'
            WHEN DueDays BETWEEN 30 AND 59 THEN '30-59 DPD'
            WHEN DueDays BETWEEN 60 AND 89 THEN '60-89 DPD'
            ELSE '90+ DPD'
        END) OVER (PARTITION BY CreditAccount ORDER BY dateID) AS prev_bucket
    FROM [SPECTRA].[dbo].[DueDaysDaily] WITH (NOLOCK)
)
SELECT
    prev_bucket  AS from_bucket,
    dpd_bucket   AS to_bucket,
    COUNT(*)     AS transitions
FROM bucketed
WHERE prev_bucket IS NOT NULL
GROUP BY prev_bucket, dpd_bucket
ORDER BY prev_bucket, dpd_bucket;


-- ─── 2. VINTAGE ANALYSIS ────────────────────────────────────────────────────
-- Description: Vintage analysis — avg DPD per loan cohort (issuance year) over time
-- Source: Credits (CreditAccount, PersonalID, FromYear), DueDaysDaily (CreditAccount, dateID, DueDays)
-- Python: Plot each vintage as a line; flag cohorts where delinquency_rate_pct > 10% within 12M

SELECT
    c.FromYear                              AS vintage_year,
    d.dateID                                AS snapshot_date,
    COUNT(DISTINCT d.CreditAccount)         AS loan_count,
    AVG(CAST(d.DueDays AS FLOAT))           AS avg_due_days,
    SUM(CASE WHEN d.DueDays >= 30 THEN 1 ELSE 0 END) * 100.0
        / NULLIF(COUNT(*), 0)               AS delinquency_rate_pct
FROM [SPECTRA].[dbo].[Credits] c WITH (NOLOCK)
JOIN [SPECTRA].[dbo].[DueDaysDaily] d WITH (NOLOCK)
    ON c.CreditAccount = d.CreditAccount
GROUP BY c.FromYear, d.dateID
ORDER BY c.FromYear, d.dateID;


-- ─── 3. NPL RATIO ───────────────────────────────────────────────────────────
-- Description: NPL ratio — loans with DPD >= 90 as % of total active portfolio
-- Source: DueDaysDaily (DueDays, dateID, CreditAccount)
-- Python: Calculate monthly; flag if >5% or increases >1pp in a single month

WITH latest_dpd AS (
    SELECT
        CreditAccount, DueDays,
        ROW_NUMBER() OVER (PARTITION BY CreditAccount ORDER BY dateID DESC) AS rn
    FROM [SPECTRA].[dbo].[DueDaysDaily] WITH (NOLOCK)
)
SELECT
    COUNT(*)                                                AS total_loans,
    SUM(CASE WHEN DueDays >= 90 THEN 1 ELSE 0 END)         AS npl_count,
    SUM(CASE WHEN DueDays >= 90 THEN 1 ELSE 0 END) * 100.0
        / NULLIF(COUNT(*), 0)                               AS npl_ratio_pct
FROM latest_dpd
WHERE rn = 1;


-- ─── 4. ECL — EXPECTED CREDIT LOSS (IFRS 9) ─────────────────────────────────
-- Description: ECL by stage using SPECTRA flat rates (Stage 1=1%, Stage 2=5%, Stage 3=20%)
-- Rates match eclProvisionService.ts ECL_RATES constants
-- Source: RiskPortfolio (Stage, totalExposure, CalculatedProvision, [Effective Interest Rate])
-- Python: Flag stages where provision_gap < 0 (under-provisioned) as red alert

SELECT
    Stage, stageDescr,
    COUNT(*)                                            AS loan_count,
    SUM(totalExposure)                                  AS total_exposure,
    SUM(CalculatedProvision)                            AS bank_provision,
    SUM(totalExposure *
        CASE Stage WHEN 1 THEN 0.01 WHEN 2 THEN 0.05 ELSE 0.20 END
    )                                                   AS calculated_ecl,
    SUM(CalculatedProvision) - SUM(totalExposure *
        CASE Stage WHEN 1 THEN 0.01 WHEN 2 THEN 0.05 ELSE 0.20 END
    )                                                   AS provision_gap
FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
GROUP BY Stage, stageDescr
ORDER BY Stage;


-- ─── 5. REPAYMENT RATE ──────────────────────────────────────────────────────
-- Description: Repayment rate per installment — actual vs scheduled payment
-- Source: AmortizationPlan (PARTIJA, DATUMDOSPECA, OTPLATA, ANUITET)
-- Python: Flag CreditAccount with repayment_rate < 0.8 for 3+ consecutive installments

SELECT
    PARTIJA                                             AS credit_account,
    DATUMDOSPECA                                        AS due_date,
    OTPLATA                                             AS amount_paid,
    ANUITET                                             AS amount_due,
    CAST(OTPLATA AS FLOAT) / NULLIF(ANUITET, 0)        AS repayment_rate,
    CASE
        WHEN CAST(OTPLATA AS FLOAT) / NULLIF(ANUITET, 0) >= 1.0 THEN 'Full'
        WHEN CAST(OTPLATA AS FLOAT) / NULLIF(ANUITET, 0) >= 0.5 THEN 'Partial'
        ELSE 'Critical'
    END                                                 AS payment_status
FROM [SPECTRA].[dbo].[AmortizationPlan] WITH (NOLOCK)
WHERE ANUITET > 0
ORDER BY DATUMDOSPECA DESC;


-- ─── 6. INTEREST INCOME AT RISK ─────────────────────────────────────────────
-- Description: Interest income at risk — Stage 2 and Stage 3 exposure × interest rate
-- Source: RiskPortfolio (Stage, totalExposure, [Effective Interest Rate])
-- Python: Flag if total interest_income_at_risk > 5% of total portfolio interest

SELECT
    Stage, stageDescr,
    COUNT(*)                                              AS client_count,
    SUM(totalExposure)                                    AS at_risk_exposure,
    AVG([Effective Interest Rate])                        AS avg_interest_rate,
    SUM(totalExposure * [Effective Interest Rate] / 100)  AS interest_income_at_risk
FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
WHERE Stage IN (2, 3)
GROUP BY Stage, stageDescr
ORDER BY Stage;


-- ─── 7. PROBABILITY OF DEFAULT (PD) BY RATING ───────────────────────────────
-- Description: PD by rating — % of clients per rating that migrated to Stage 3
-- Source: RiskPortfolio (clientID, BankPreviousMonthRating, Stage)
-- Python: Flag any rating band where PD increased >5% vs prior calculation period

SELECT
    BankPreviousMonthRating                             AS rating_last_month,
    COUNT(*)                                            AS total_clients,
    SUM(CASE WHEN Stage = 3 THEN 1 ELSE 0 END)         AS defaulted,
    SUM(CASE WHEN Stage = 3 THEN 1 ELSE 0 END) * 100.0
        / NULLIF(COUNT(*), 0)                           AS pd_pct
FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
WHERE BankPreviousMonthRating IS NOT NULL
GROUP BY BankPreviousMonthRating
ORDER BY pd_pct DESC;


-- ─── 8. COVERAGE RATIO ──────────────────────────────────────────────────────
-- Description: Coverage ratio — provision vs exposure by stage and calculation date
-- Source: RiskPortfolio (CalculationDate, CalculatedProvision, totalExposure, Stage)
-- Python: Flag months where coverage_ratio_pct for Stage 2 or 3 drops >2pp MoM

SELECT
    CalculationDate,
    Stage,
    SUM(CalculatedProvision)                            AS total_provision,
    SUM(totalExposure)                                  AS total_exposure,
    SUM(CalculatedProvision) * 100.0
        / NULLIF(SUM(totalExposure), 0)                 AS coverage_ratio_pct
FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
GROUP BY CalculationDate, Stage
ORDER BY CalculationDate, Stage;


-- ─── 9. TIME TO FIRST DELINQUENCY ───────────────────────────────────────────
-- Description: Time to first delinquency per loan
-- Source: Credits (CreditAccount, PersonalID, FromYear), DueDaysDaily (CreditAccount, dateID, DueDays)
-- Python: Flag loans where days_to_first_delinquency < 90 as flag_fast_default

WITH first_late AS (
    SELECT CreditAccount, MIN(dateID) AS first_late_date
    FROM [SPECTRA].[dbo].[DueDaysDaily] WITH (NOLOCK)
    WHERE DueDays > 0
    GROUP BY CreditAccount
)
SELECT
    c.CreditAccount, c.PersonalID, c.FromYear, c.Amount,
    f.first_late_date,
    DATEDIFF(day,
        CAST(CAST(c.FromYear AS VARCHAR) + '-01-01' AS DATE),
        CAST(f.first_late_date AS DATE)
    )                                                   AS days_to_first_delinquency
FROM [SPECTRA].[dbo].[Credits] c WITH (NOLOCK)
JOIN first_late f ON c.CreditAccount = f.CreditAccount
ORDER BY days_to_first_delinquency ASC;


-- ─── 10. CARD SPEND ACCELERATION ────────────────────────────────────────────
-- Description: Monthly card spend per account with MoM growth rate
-- Source: CC_Event_LOG (Account, trans_date, Ammount)
-- Python: Flag accounts where mom_growth_pct > 30 for 2+ consecutive months

WITH monthly AS (
    SELECT
        Account,
        FORMAT(trans_date, 'yyyy-MM')   AS spend_month,
        SUM(Ammount)                    AS monthly_spend
    FROM [SPECTRA].[dbo].[CC_Event_LOG] WITH (NOLOCK)
    GROUP BY Account, FORMAT(trans_date, 'yyyy-MM')
)
SELECT
    Account, spend_month, monthly_spend,
    LAG(monthly_spend) OVER (PARTITION BY Account ORDER BY spend_month) AS prev_spend,
    (monthly_spend - LAG(monthly_spend) OVER (PARTITION BY Account ORDER BY spend_month))
        * 100.0 / NULLIF(LAG(monthly_spend) OVER (
            PARTITION BY Account ORDER BY spend_month), 0) AS mom_growth_pct
FROM monthly
ORDER BY Account, spend_month;


-- ─── 11. OVERDRAFT DEPENDENCY SCORE ─────────────────────────────────────────
-- Description: Overdraft dependency — consecutive months of overdraft use per customer
-- Source: TAccounts (NoAccount, Date, Amount, AccountType), Accounts (NoAccount, PersonalID)
-- Python: Flag PersonalID where months_with_overdraft >= 3; score amber (3–5) / red (6+)

WITH monthly_od AS (
    SELECT
        a.PersonalID, t.NoAccount,
        FORMAT(t.Date, 'yyyy-MM')   AS usage_month,
        SUM(t.Amount)               AS net_amount
    FROM [SPECTRA].[dbo].[TAccounts] t WITH (NOLOCK)
    JOIN [SPECTRA].[dbo].[Accounts] a WITH (NOLOCK)
        ON t.NoAccount = a.NoAccount
    WHERE t.AccountType LIKE '%overdraft%' OR t.AccountType LIKE '%OD%'
    GROUP BY a.PersonalID, t.NoAccount, FORMAT(t.Date, 'yyyy-MM')
)
SELECT
    PersonalID, NoAccount,
    COUNT(DISTINCT usage_month)     AS months_with_overdraft,
    MIN(usage_month)                AS first_od_month,
    MAX(usage_month)                AS last_od_month
FROM monthly_od
GROUP BY PersonalID, NoAccount
ORDER BY months_with_overdraft DESC;
