-- Description: Per-customer risk profile — full snapshot for underwriter review
-- Scope: Single client identified by @PersonalID parameter
-- Source tables: Customer, Credits, DueDaysDaily, RiskPortfolio, AmortizationPlan
-- Usage: Called per client from Client Risk Profile dashboard
-- Parameters: Replace @PersonalID with the target client ID

DECLARE @PersonalID NVARCHAR(50) = '88421'  -- Replace with actual PersonalID

;WITH customer_data AS (
    SELECT
        c.PersonalID,
        c.name                                                              AS first_name,
        c.surname                                                           AS last_name,
        c.City                                                              AS city,
        c.DOB,
        DATEDIFF(YEAR, c.DOB, GETDATE())                                    AS age,
        c.Occupation                                                        AS occupation,
        c.Status                                                            AS employment_status,
        c.CustomerType                                                      AS customer_type,
        c.Branch                                                            AS branch,
        c.Gender                                                            AS gender,
        c.DateOfRegister,
        DATEDIFF(YEAR, c.DateOfRegister, GETDATE())                        AS tenure_years
    FROM [SPECTRA].[dbo].[Customer] c WITH (NOLOCK)
    WHERE c.PersonalID = @PersonalID
),
credit_data AS (
    SELECT
        cr.CreditAccount,
        cr.Currency,
        cr.Amount                                                           AS approved_amount,
        cr.InstallmentsAmount                                               AS installment_amount,
        cr.Interes                                                          AS interest_rate,
        cr.STATUS                                                           AS credit_status,
        cr.Branch,
        cr.KAMGRUPA                                                         AS product_group
    FROM [SPECTRA].[dbo].[Credits] cr WITH (NOLOCK)
    WHERE cr.PersonalID = @PersonalID
        AND cr.STATUS = 'A'
),
due_days AS (
    SELECT
        d.CreditAccount,
        d.DueDays                                                           AS current_dpd,
        d.DueMax6M                                                          AS max_dpd_6m,
        d.DueMax1Y                                                          AS max_dpd_1y,
        d.DueMax2Y                                                          AS max_dpd_2y,
        ROW_NUMBER() OVER (PARTITION BY d.CreditAccount ORDER BY d.dateID DESC) AS rn
    FROM [SPECTRA].[dbo].[DueDaysDaily] d WITH (NOLOCK)
    WHERE d.PersonalID = @PersonalID
),
risk_data AS (
    SELECT
        r.BankCurrentRating                                                 AS current_rating,
        r.BankPreviousMonthRating                                           AS prev_rating,
        r.Stage,
        r.stageDescr                                                        AS stage_description,
        r.totalExposure                                                     AS total_exposure,
        r.onBalanceExposure                                                 AS on_balance,
        r.TotalOffBalance                                                   AS off_balance,
        r.CalculatedProvision                                               AS provision,
        r.Restructuring                                                     AS is_restructured,
        ROW_NUMBER() OVER (ORDER BY r.CalculationDate DESC)                AS rn
    FROM [SPECTRA].[dbo].[RiskPortfolio] r WITH (NOLOCK)
    WHERE r.clientID = @PersonalID
),
missed_payments AS (
    SELECT
        COUNT(*)                                                            AS total_installments,
        SUM(CASE WHEN ap.ZADOLZENO > 0 THEN 1 ELSE 0 END)                 AS missed_count
    FROM [SPECTRA].[dbo].[AmortizationPlan] ap WITH (NOLOCK)
    JOIN credit_data cr ON ap.PARTIJA = cr.CreditAccount
    WHERE ap.DATUMDOSPECA <= CAST(GETDATE() AS DATE)
)
SELECT
    cd.*,
    rd.current_rating,
    rd.prev_rating,
    rd.Stage                                                                AS risk_stage,
    rd.stage_description,
    rd.total_exposure,
    rd.on_balance,
    rd.off_balance,
    rd.provision,
    rd.is_restructured,
    dd.current_dpd,
    dd.max_dpd_6m,
    dd.max_dpd_1y,
    dd.max_dpd_2y,
    mp.total_installments,
    mp.missed_count,
    CAST(mp.missed_count AS FLOAT) / NULLIF(mp.total_installments, 0) * 100  AS missed_payment_pct
FROM customer_data cd
LEFT JOIN risk_data rd    ON rd.rn = 1
LEFT JOIN due_days dd     ON dd.CreditAccount = (SELECT TOP 1 CreditAccount FROM credit_data) AND dd.rn = 1
LEFT JOIN missed_payments mp ON 1 = 1;
