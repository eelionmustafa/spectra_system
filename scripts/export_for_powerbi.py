"""
SPECTRA — Power BI Export Script
==================================
Connects to the SSMS database, runs all KPI queries, applies all 11 risk
calculations + 5 risk flags, and exports enriched CSVs to /data/processed/.

Read-only queries only — no UPDATE, DELETE, or DROP.
Credentials loaded via db_connect.py (Windows Auth or SQL Auth from .env).
"""

import logging
import warnings
from pathlib import Path

import pandas as pd
from db_connect import get_conn, _PROJECT_ROOT

from flag_risks import (
    flag_consecutive_lates,
    flag_exposure_spike,
    flag_rising_delay_trend,
    flag_score_deterioration,
    flag_zscore_anomaly,
)
from calculations import (
    build_rollrate_matrix,
    flag_card_acceleration,
    flag_coverage_decline,
    flag_ecl_provision_gap,
    flag_fast_default,
    flag_interest_income_at_risk,
    flag_low_repayment,
    flag_npl_ratio,
    flag_overdraft_dependent,
    flag_pd_increase,
    flag_vintage_deterioration,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("spectra.export")

PROCESSED_DIR = _PROJECT_ROOT / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


def _sql(query: str, conn) -> pd.DataFrame:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return pd.read_sql(query, conn)


# ─── Base table queries ───────────────────────────────────────────────────────

def _load_due_days(conn) -> pd.DataFrame:
    log.info("Loading DueDaysDaily...")
    df = _sql("""
        SELECT dateID, CreditAccount, PersonalID,
               DueDays, DueMax6M, DueMax1Y, DueMax2Y
        FROM [SPECTRA].[dbo].[DueDaysDaily] WITH (NOLOCK)
    """, conn)
    log.info("DueDaysDaily: %d rows", len(df))
    return df


def _load_risk_portfolio(conn) -> pd.DataFrame:
    log.info("Loading RiskPortfolio...")
    df = _sql("""
        SELECT clientID, arrangementID, CalculationDate, TypeOfProduct,
               Stage, stageDescr, BankCurrentRating, BankPreviousMonthRating,
               totalExposure, onBalanceExposure, TotalOffBalance,
               CalculatedProvision, [Effective Interest Rate],
               duePrincipal, penaltyInterest, Restructuring,
               lastClassificationChangeDate
        FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
    """, conn)
    log.info("RiskPortfolio: %d rows", len(df))
    return df


def _load_customers(conn) -> pd.DataFrame:
    log.info("Loading Customer...")
    df = _sql("""
        SELECT PersonalID, City, Branch, Gender, Occupation,
               CustomerType, DateOfRegister
        FROM [SPECTRA].[dbo].[Customer] WITH (NOLOCK)
    """, conn)
    log.info("Customer: %d rows", len(df))
    return df


def _load_credits(conn) -> pd.DataFrame:
    log.info("Loading Credits...")
    df = _sql("""
        SELECT CreditAccount, PersonalID, FromYear, Amount,
               STATUS, Branch, Period
        FROM [SPECTRA].[dbo].[Credits] WITH (NOLOCK)
    """, conn)
    log.info("Credits: %d rows", len(df))
    return df


def _load_amortization(conn) -> pd.DataFrame:
    log.info("Loading AmortizationPlan (sample for repayment rate)...")
    df = _sql("""
        SELECT TOP 500000
            PARTIJA  AS credit_account,
            DATUMDOSPECA AS due_date,
            TRY_CAST(OTPLATA AS FLOAT) AS amount_paid,
            TRY_CAST(ANUITET AS FLOAT) AS amount_due,
            TRY_CAST(OTPLATA AS FLOAT) / NULLIF(TRY_CAST(ANUITET AS FLOAT), 0) AS repayment_rate
        FROM [SPECTRA].[dbo].[AmortizationPlan] WITH (NOLOCK)
        WHERE TRY_CAST(ANUITET AS FLOAT) > 0
    """, conn)
    log.info("AmortizationPlan: %d rows", len(df))
    return df


def _load_card_spend(conn) -> pd.DataFrame:
    log.info("Loading CC_Event_LOG (monthly card spend)...")
    df = _sql("""
        WITH monthly AS (
            SELECT Account,
                   FORMAT(TRY_CAST(trans_date AS DATETIME), 'yyyy-MM') AS spend_month,
                   SUM(Ammount) AS monthly_spend
            FROM [SPECTRA].[dbo].[CC_Event_LOG] WITH (NOLOCK)
            GROUP BY Account, FORMAT(TRY_CAST(trans_date AS DATETIME), 'yyyy-MM')
        )
        SELECT Account, spend_month, monthly_spend,
               LAG(monthly_spend) OVER (
                   PARTITION BY Account ORDER BY spend_month
               ) AS prev_spend,
               (monthly_spend - LAG(monthly_spend) OVER (
                   PARTITION BY Account ORDER BY spend_month
               )) * 100.0 / NULLIF(LAG(monthly_spend) OVER (
                   PARTITION BY Account ORDER BY spend_month
               ), 0) AS mom_growth_pct
        FROM monthly
    """, conn)
    log.info("Card spend: %d rows", len(df))
    return df


def _load_overdraft(conn) -> pd.DataFrame:
    log.info("Loading overdraft dependency (TAccounts)...")
    df = _sql("""
        WITH monthly_od AS (
            SELECT a.PersonalID, t.NoAccount,
                   FORMAT(t.Date, 'yyyy-MM') AS usage_month,
                   SUM(t.Amount) AS net_amount
            FROM [SPECTRA].[dbo].[TAccounts] t WITH (NOLOCK)
            JOIN [SPECTRA].[dbo].[Accounts]  a WITH (NOLOCK)
                ON t.NoAccount = a.NoAccount
            GROUP BY a.PersonalID, t.NoAccount, FORMAT(t.Date, 'yyyy-MM')
        )
        SELECT PersonalID,
               COUNT(CASE WHEN net_amount < 0 THEN 1 END) AS months_with_overdraft
        FROM monthly_od
        GROUP BY PersonalID
    """, conn)
    log.info("Overdraft dependency: %d rows", len(df))
    return df


# ─── Computed / aggregated queries ───────────────────────────────────────────

def _load_rollrate(conn) -> pd.DataFrame:
    log.info("Loading rollrate transitions...")
    return _sql("""
        WITH bucketed AS (
            SELECT PersonalID, CreditAccount, dateID,
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
        SELECT prev_bucket AS from_bucket, dpd_bucket AS to_bucket, COUNT(*) AS transitions
        FROM bucketed
        WHERE prev_bucket IS NOT NULL
        GROUP BY prev_bucket, dpd_bucket
    """, conn)


def _load_vintage(conn) -> pd.DataFrame:
    log.info("Loading vintage analysis...")
    return _sql("""
        SELECT c.FromYear AS vintage_year,
               d.dateID   AS snapshot_date,
               COUNT(DISTINCT d.CreditAccount) AS loan_count,
               AVG(CAST(d.DueDays AS FLOAT))   AS avg_due_days,
               SUM(CASE WHEN d.DueDays >= 30 THEN 1 ELSE 0 END) * 100.0
                   / NULLIF(COUNT(*), 0)        AS delinquency_rate_pct
        FROM [SPECTRA].[dbo].[Credits] c WITH (NOLOCK)
        JOIN [SPECTRA].[dbo].[DueDaysDaily] d WITH (NOLOCK)
            ON c.CreditAccount = d.CreditAccount
        GROUP BY c.FromYear, d.dateID
    """, conn)


def _load_npl_monthly(conn) -> pd.DataFrame:
    log.info("Loading monthly NPL ratio...")
    return _sql("""
        SELECT FORMAT(dateID, 'yyyy-MM') AS month,
               COUNT(*) AS total_loans,
               SUM(CASE WHEN DueDays >= 90 THEN 1 ELSE 0 END) AS npl_count,
               SUM(CASE WHEN DueDays >= 90 THEN 1 ELSE 0 END) * 100.0
                   / NULLIF(COUNT(*), 0) AS npl_ratio_pct
        FROM [SPECTRA].[dbo].[DueDaysDaily] WITH (NOLOCK)
        GROUP BY FORMAT(dateID, 'yyyy-MM')
    """, conn)


def _load_ecl(conn) -> pd.DataFrame:
    log.info("Loading ECL provision gap...")
    return _sql("""
        SELECT Stage, stageDescr,
               COUNT(*)                  AS loan_count,
               SUM(totalExposure)        AS total_exposure,
               SUM(CalculatedProvision)  AS bank_provision,
               SUM(totalExposure *
                   CASE Stage WHEN 1 THEN 0.01 WHEN 2 THEN 0.05 ELSE 0.20 END
               )                         AS calculated_ecl,
               SUM(CalculatedProvision) - SUM(totalExposure *
                   CASE Stage WHEN 1 THEN 0.01 WHEN 2 THEN 0.05 ELSE 0.20 END
               )                         AS provision_gap
        FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
        GROUP BY Stage, stageDescr
    """, conn)


def _load_interest_at_risk(conn) -> pd.DataFrame:
    log.info("Loading interest income at risk...")
    return _sql("""
        SELECT Stage, stageDescr,
               COUNT(*)                AS client_count,
               SUM(totalExposure)      AS at_risk_exposure,
               AVG([Effective Interest Rate]) AS avg_interest_rate,
               SUM(totalExposure * [Effective Interest Rate] / 100) AS interest_income_at_risk
        FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
        WHERE Stage IN (2, 3)
        GROUP BY Stage, stageDescr
    """, conn)


def _load_pd_by_rating(conn) -> pd.DataFrame:
    log.info("Loading PD by rating...")
    return _sql("""
        SELECT BankPreviousMonthRating AS rating_last_month,
               COUNT(*) AS total_clients,
               SUM(CASE WHEN Stage = 3 THEN 1 ELSE 0 END) AS defaulted,
               SUM(CASE WHEN Stage = 3 THEN 1 ELSE 0 END) * 100.0
                   / NULLIF(COUNT(*), 0) AS pd_pct
        FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
        WHERE BankPreviousMonthRating IS NOT NULL
        GROUP BY BankPreviousMonthRating
    """, conn)


def _load_coverage_by_stage(conn) -> pd.DataFrame:
    log.info("Loading coverage ratio by stage...")
    return _sql("""
        SELECT CalculationDate, Stage,
               SUM(CalculatedProvision) AS total_provision,
               SUM(totalExposure)       AS total_exposure,
               SUM(CalculatedProvision) * 100.0
                   / NULLIF(SUM(totalExposure), 0) AS coverage_ratio_pct
        FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
        GROUP BY CalculationDate, Stage
    """, conn)


def _load_fast_defaults(conn) -> pd.DataFrame:
    log.info("Loading time to first delinquency...")
    return _sql("""
        WITH first_late AS (
            SELECT CreditAccount, MIN(dateID) AS first_late_date
            FROM [SPECTRA].[dbo].[DueDaysDaily] WITH (NOLOCK)
            WHERE DueDays > 0
            GROUP BY CreditAccount
        )
        SELECT c.CreditAccount, c.PersonalID, c.FromYear, c.Amount,
               f.first_late_date,
               DATEDIFF(day,
                   CAST(CAST(c.FromYear AS VARCHAR) + '-01-01' AS DATE),
                   CAST(f.first_late_date AS DATE)
               ) AS days_to_first_delinquency
        FROM [SPECTRA].[dbo].[Credits] c WITH (NOLOCK)
        JOIN first_late f ON c.CreditAccount = f.CreditAccount
    """, conn)


# ─── Build enriched portfolio dataset ────────────────────────────────────────

def _build_flagged(due: pd.DataFrame, risk: pd.DataFrame, customers: pd.DataFrame) -> pd.DataFrame:
    due_r = due.rename(columns={
        "dateID": "due_date", "CreditAccount": "credit_account",
        "PersonalID": "personal_id", "DueDays": "due_days",
    })
    risk_r = risk.rename(columns={
        "clientID": "client_id", "CalculationDate": "calculation_date",
        "BankCurrentRating": "risk_rating", "totalExposure": "total_exposure",
    })

    log.info("Applying 5 risk flags (flag_risks.py)...")
    due_r = flag_rising_delay_trend(due_r, date_col="due_date", delay_col="due_days", id_col="credit_account")
    due_r = flag_zscore_anomaly(due_r, delay_col="due_days", id_col="credit_account")
    due_r = flag_consecutive_lates(due_r, date_col="due_date", delay_col="due_days", id_col="credit_account")
    risk_r = flag_score_deterioration(risk_r, rating_col="risk_rating", date_col="calculation_date", id_col="client_id")
    risk_r = flag_exposure_spike(risk_r, date_col="calculation_date", exposure_col="total_exposure", id_col="client_id")

    due_latest  = due_r.sort_values("due_date").groupby("credit_account").last().reset_index()
    risk_latest = risk_r.sort_values("calculation_date").groupby("client_id").last().reset_index()

    merged = due_latest.merge(
        risk_latest[["client_id", "Stage", "stageDescr", "risk_rating", "total_exposure",
                     "onBalanceExposure", "TotalOffBalance",
                     "flag_score_deterioration", "flag_exposure_spike"]],
        left_on="personal_id", right_on="client_id", how="left",
    )
    merged = merged.merge(
        customers.rename(columns={"PersonalID": "personal_id"}),
        on="personal_id", how="left",
    )
    log.info("Flagged portfolio: %d rows", len(merged))
    return merged


# ─── Save helper ─────────────────────────────────────────────────────────────

def _save(df: pd.DataFrame, filename: str) -> None:
    path = PROCESSED_DIR / filename
    df.to_csv(path, index=False)
    log.info("Saved %s (%d rows, %d cols)", path.name, len(df), len(df.columns))


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    conn = get_conn()
    try:
        # ── Base tables
        due_days       = _load_due_days(conn)
        risk_portfolio = _load_risk_portfolio(conn)
        customers      = _load_customers(conn)
        credits        = _load_credits(conn)
        amortization   = _load_amortization(conn)
        card_spend     = _load_card_spend(conn)
        overdraft      = _load_overdraft(conn)

        # ── Save raw exports
        _save(due_days,       "due_days_raw.csv")
        _save(risk_portfolio, "risk_portfolio_raw.csv")
        _save(customers,      "customers_raw.csv")
        _save(credits,        "credits_raw.csv")

        # ── Flagged portfolio (5 flags from flag_risks.py)
        flagged = _build_flagged(due_days, risk_portfolio, customers)
        _save(flagged, "flagged_portfolio.csv")

        # ── All 11 calculations (calculations.py) ──────────────────────────

        log.info("Running all 11 advanced calculations...")

        # 1. Rollrate matrix
        rollrate_raw = _load_rollrate(conn)
        rollrate_matrix = build_rollrate_matrix(rollrate_raw)
        rollrate_matrix.reset_index().to_csv(PROCESSED_DIR / "rollrate_matrix.csv")
        log.info("Rollrate matrix saved.")

        # 2. Vintage analysis
        vintage = _load_vintage(conn)
        vintage = flag_vintage_deterioration(vintage)
        _save(vintage, "vintage_analysis.csv")

        # 3. NPL ratio monthly
        npl = _load_npl_monthly(conn)
        npl = flag_npl_ratio(npl)
        _save(npl, "npl_ratio_monthly.csv")

        # 4. ECL provision gap
        ecl = _load_ecl(conn)
        ecl = flag_ecl_provision_gap(ecl)
        _save(ecl, "ecl_provision_gap.csv")

        # 5. Repayment rate
        repayment = flag_low_repayment(amortization)
        _save(repayment, "repayment_rate.csv")

        # 6. Interest income at risk
        interest = _load_interest_at_risk(conn)
        interest = flag_interest_income_at_risk(interest)
        _save(interest, "interest_at_risk.csv")

        # 7. PD by rating
        pd_rating = _load_pd_by_rating(conn)
        pd_rating = flag_pd_increase(pd_rating)
        _save(pd_rating, "pd_by_rating.csv")

        # 8. Coverage ratio
        coverage = _load_coverage_by_stage(conn)
        coverage = flag_coverage_decline(coverage)
        _save(coverage, "coverage_ratio.csv")

        # 9. Fast defaults
        fast_def = _load_fast_defaults(conn)
        fast_def = flag_fast_default(fast_def)
        _save(fast_def, "fast_defaults.csv")

        # 10. Card spend acceleration
        card_spend = flag_card_acceleration(card_spend)
        _save(card_spend, "card_spend_acceleration.csv")

        # 11. Overdraft dependency
        overdraft = flag_overdraft_dependent(overdraft)
        _save(overdraft, "overdraft_dependency.csv")

        log.info("All exports complete → %s", PROCESSED_DIR)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
