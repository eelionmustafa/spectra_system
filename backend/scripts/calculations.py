"""
SPECTRA — Advanced Calculations
All 11 calculations required by the portfolio monitoring system.
Each function accepts a DataFrame and returns a DataFrame with flag_* column added.
SQL queries for each calculation live in /sql/kpi_metrics.sql.
"""

import logging
import numpy as np
import pandas as pd
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("spectra.calculations")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _require_cols(df: pd.DataFrame, cols: list[str], fn: str) -> None:
    """Validate that required columns exist in the DataFrame."""
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"{fn}: missing columns {missing}. Got: {list(df.columns)}")


# ─── 1. Rollrate Matrix ───────────────────────────────────────────────────────

def build_rollrate_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """
    Pivot the rollrate transition result into a matrix.
    Flag if the '0 - Current' → '30-59 DPD' transition rate increases MoM by >10%.

    Input columns: from_bucket, to_bucket, transitions
    Returns: pivot table (DataFrame) with flag appended as attribute
    """
    _require_cols(df, ["from_bucket", "to_bucket", "transitions"], "build_rollrate_matrix")

    matrix = df.pivot_table(
        index="from_bucket",
        columns="to_bucket",
        values="transitions",
        fill_value=0,
        aggfunc="sum",
    )

    bucket_order = ["0 - Current", "1-29 DPD", "30-59 DPD", "60-89 DPD", "90+ DPD"]
    matrix = matrix.reindex(index=bucket_order, columns=bucket_order, fill_value=0)

    # Convert to row-pct rates
    row_totals = matrix.sum(axis=1).replace(0, np.nan)
    rate_matrix = matrix.div(row_totals, axis=0).fillna(0).round(4)

    log.info("Rollrate matrix built: %s buckets", len(rate_matrix))
    return rate_matrix


def flag_rollrate_increase(
    current: pd.DataFrame,
    previous: pd.DataFrame,
    threshold: float = 0.10,
) -> bool:
    """
    Flag True if 0→30-59 DPD transition rate increased by more than threshold MoM.

    Args:
        current: rollrate rate matrix for current period
        previous: rollrate rate matrix for prior period
        threshold: absolute increase threshold (default 0.10 = 10pp)
    """
    try:
        curr_rate = current.loc["0 - Current", "30-59 DPD"]
        prev_rate = previous.loc["0 - Current", "30-59 DPD"]
        increase = curr_rate - prev_rate
        if increase > threshold:
            log.warning("Rollrate flag: 0→30-59 DPD rate up %.1f pp (%.1f%% → %.1f%%)",
                        increase * 100, prev_rate * 100, curr_rate * 100)
            return True
    except KeyError:
        log.warning("Rollrate flag: bucket not found in matrix")
    return False


# ─── 2. Vintage Analysis ─────────────────────────────────────────────────────

def flag_vintage_deterioration(
    df: pd.DataFrame,
    threshold_pct: float = 10.0,
    within_months: int = 12,
) -> pd.DataFrame:
    """
    Flag vintages where delinquency_rate_pct exceeds threshold within N months of issuance.
    Adds flag_vintage_deterioration column (bool).

    Input columns: vintage_year, snapshot_date, loan_count, avg_due_days, delinquency_rate_pct
    """
    _require_cols(df, ["vintage_year", "delinquency_rate_pct"], "flag_vintage_deterioration")

    df = df.copy()
    df["flag_vintage_deterioration"] = df["delinquency_rate_pct"] > threshold_pct

    flagged = df.loc[df["flag_vintage_deterioration"], "vintage_year"].unique()
    if len(flagged):
        log.warning("Vintages exceeding %.1f%% delinquency within %dM: %s",
                    threshold_pct, within_months, list(flagged))
    return df


# ─── 3. NPL Ratio ─────────────────────────────────────────────────────────────

def flag_npl_ratio(
    df: pd.DataFrame,
    npl_threshold: float = 5.0,
    mom_threshold: float = 1.0,
) -> pd.DataFrame:
    """
    Calculate monthly NPL ratio and flag if it exceeds threshold or jumps >1pp MoM.
    Adds flag_npl_high and flag_npl_spike columns (bool).

    Input columns: month (YYYY-MM or period), npl_ratio_pct
    """
    _require_cols(df, ["npl_ratio_pct"], "flag_npl_ratio")

    df = df.copy().sort_values("month").reset_index(drop=True)
    df["flag_npl_high"] = df["npl_ratio_pct"] > npl_threshold
    df["npl_mom_change"] = df["npl_ratio_pct"].diff()
    df["flag_npl_spike"] = df["npl_mom_change"] > mom_threshold

    highs = df.loc[df["flag_npl_high"], "month"].tolist()
    spikes = df.loc[df["flag_npl_spike"], "month"].tolist()
    if highs:
        log.warning("NPL ratio above %.1f%% in: %s", npl_threshold, highs)
    if spikes:
        log.warning("NPL spike >%.1f pp in: %s", mom_threshold, spikes)
    return df


# ─── 4. ECL — Expected Credit Loss ────────────────────────────────────────────

def flag_ecl_provision_gap(df: pd.DataFrame) -> pd.DataFrame:
    """
    Flag stages where provision_gap is negative (under-provisioned).
    Adds flag_under_provisioned column (bool).

    Input columns: Stage, total_exposure, bank_provision, calculated_ecl, provision_gap
    """
    _require_cols(df, ["Stage", "provision_gap"], "flag_ecl_provision_gap")

    df = df.copy()
    df["flag_under_provisioned"] = df["provision_gap"] < 0

    under = df.loc[df["flag_under_provisioned"], "Stage"].tolist()
    if under:
        log.warning("UNDER-PROVISIONED stages: %s — check bank provision vs ECL", under)
    return df


# ─── 5. Repayment Rate ────────────────────────────────────────────────────────

def flag_low_repayment(
    df: pd.DataFrame,
    rate_threshold: float = 0.8,
    consecutive_n: int = 3,
) -> pd.DataFrame:
    """
    Flag CreditAccounts where repayment_rate < threshold for N+ consecutive installments.
    Adds flag_low_repayment column (bool).

    Input columns: credit_account, due_date, repayment_rate
    """
    _require_cols(df, ["credit_account", "due_date", "repayment_rate"], "flag_low_repayment")

    df = df.copy().sort_values(["credit_account", "due_date"]).reset_index(drop=True)
    df["below_threshold"] = df["repayment_rate"] < rate_threshold

    def _consec_flag(group: pd.DataFrame) -> pd.Series:
        flag = pd.Series(False, index=group.index)
        count = 0
        for idx in group.index:
            if group.loc[idx, "below_threshold"]:
                count += 1
                if count >= consecutive_n:
                    flag.loc[idx] = True
            else:
                count = 0
        return flag

    row_flags = (
        df.groupby("credit_account", group_keys=False)
        .apply(_consec_flag, include_groups=False)
        .astype(bool)
    )
    df["_consec_flag_row"] = row_flags
    # Account-level flag: True if any row in the account was flagged (not just the final streak row)
    account_flags = df.groupby("credit_account")["_consec_flag_row"].any().reset_index()
    account_flags.columns = ["credit_account", "flag_low_repayment"]
    df = df.drop(columns=["_consec_flag_row", "flag_low_repayment"], errors="ignore").merge(
        account_flags, on="credit_account", how="left"
    )
    df["flag_low_repayment"] = df["flag_low_repayment"].fillna(False).astype(bool)

    n_flagged = df.loc[df["flag_low_repayment"], "credit_account"].nunique()
    log.info("flag_low_repayment: %d accounts with %d+ consecutive low payments", n_flagged, consecutive_n)
    return df


# ─── 6. Interest Income at Risk ───────────────────────────────────────────────

def flag_interest_income_at_risk(
    df: pd.DataFrame,
    portfolio_total_interest: Optional[float] = None,
    threshold_pct: float = 5.0,
) -> pd.DataFrame:
    """
    Flag if total interest_income_at_risk (Stage 2+3) exceeds 5% of total portfolio interest.
    Adds flag_interest_at_risk column (bool) to each row.

    Input columns: Stage, client_count, at_risk_exposure, avg_interest_rate, interest_income_at_risk
    """
    _require_cols(df, ["interest_income_at_risk"], "flag_interest_income_at_risk")

    df = df.copy()
    total_at_risk = df["interest_income_at_risk"].sum()

    if portfolio_total_interest and portfolio_total_interest > 0:
        pct_at_risk = (total_at_risk / portfolio_total_interest) * 100
        flag_val = pct_at_risk > threshold_pct
        df["flag_interest_at_risk"] = flag_val
        if flag_val:
            log.warning(
                "Interest income at risk: %.1f%% of total (%.0f) — threshold %.1f%%",
                pct_at_risk, total_at_risk, threshold_pct,
            )
    else:
        df["flag_interest_at_risk"] = False
        log.info("Interest at risk total: %.0f (no portfolio benchmark provided)", total_at_risk)

    return df


# ─── 7. Probability of Default (PD) by Rating ────────────────────────────────

def flag_pd_increase(
    df: pd.DataFrame,
    current_col: str = "pd_pct",
    previous_col: str = "pd_pct_prev",
    threshold: float = 5.0,
) -> pd.DataFrame:
    """
    Flag rating bands where PD increased more than threshold vs prior period.
    Adds flag_pd_increase column (bool).

    Input columns: rating_last_month, pd_pct, pd_pct_prev (prior period)
    """
    _require_cols(df, ["rating_last_month", current_col], "flag_pd_increase")

    df = df.copy()
    if previous_col in df.columns:
        df["pd_change"] = df[current_col] - df[previous_col]
        df["flag_pd_increase"] = df["pd_change"] > threshold
        flagged = df.loc[df["flag_pd_increase"], "rating_last_month"].tolist()
        if flagged:
            log.warning("PD increase >%.1f%% in ratings: %s", threshold, flagged)
    else:
        df["flag_pd_increase"] = False
        log.info("flag_pd_increase: prior period column '%s' not provided", previous_col)

    return df


# ─── 8. Coverage Ratio ────────────────────────────────────────────────────────

def flag_coverage_decline(
    df: pd.DataFrame,
    stage_filter: Optional[list[int]] = None,
    decline_threshold: float = 2.0,
) -> pd.DataFrame:
    """
    Flag months where coverage_ratio_pct for Stage 2 or 3 drops >2pp vs prior month.
    Adds flag_coverage_decline column (bool).

    Input columns: CalculationDate, Stage, coverage_ratio_pct
    """
    _require_cols(df, ["CalculationDate", "Stage", "coverage_ratio_pct"], "flag_coverage_decline")

    stages = stage_filter or [2, 3]
    df = df.copy().sort_values(["Stage", "CalculationDate"]).reset_index(drop=True)

    df["coverage_mom_change"] = (
        df.groupby("Stage")["coverage_ratio_pct"]
        .diff()
    )
    df["flag_coverage_decline"] = (
        df["Stage"].isin(stages) & (df["coverage_mom_change"] < -decline_threshold)
    )

    flagged = df.loc[df["flag_coverage_decline"], ["CalculationDate", "Stage"]].to_dict("records")
    if flagged:
        log.warning("Coverage ratio declined >%.1f pp: %s", decline_threshold, flagged)
    return df


# ─── 9. Time to First Delinquency ────────────────────────────────────────────

def flag_fast_default(
    df: pd.DataFrame,
    threshold_days: int = 90,
) -> pd.DataFrame:
    """
    Flag loans where days_to_first_delinquency < threshold_days as fast defaults.
    Adds flag_fast_default column (bool).

    Input columns: CreditAccount, PersonalID, FromYear, Amount, first_late_date, days_to_first_delinquency
    """
    _require_cols(df, ["CreditAccount", "days_to_first_delinquency"], "flag_fast_default")

    df = df.copy()
    df["flag_fast_default"] = df["days_to_first_delinquency"] < threshold_days

    n = df["flag_fast_default"].sum()
    log.info("flag_fast_default: %d loans defaulted within %d days of issuance", n, threshold_days)

    # Segment by vintage year for quality trend
    if "FromYear" in df.columns:
        vintage_summary = (
            df.groupby("FromYear")["flag_fast_default"]
            .agg(["sum", "count"])
            .rename(columns={"sum": "fast_defaults", "count": "total"})
            .assign(fast_default_pct=lambda x: (x["fast_defaults"] / x["total"] * 100).round(1))
        )
        log.info("Fast default rate by vintage:\n%s", vintage_summary.to_string())

    return df


# ─── 10. Card Spend Acceleration ─────────────────────────────────────────────

def flag_card_acceleration(
    df: pd.DataFrame,
    growth_threshold: float = 30.0,
    consecutive_months: int = 2,
) -> pd.DataFrame:
    """
    Flag accounts with MoM card spend growth > threshold for N+ consecutive months.
    Adds flag_card_acceleration column (bool).

    Input columns: Account, spend_month, monthly_spend, prev_spend, mom_growth_pct
    """
    _require_cols(df, ["Account", "spend_month", "mom_growth_pct"], "flag_card_acceleration")

    df = df.copy().sort_values(["Account", "spend_month"]).reset_index(drop=True)
    df["above_threshold"] = df["mom_growth_pct"] > growth_threshold

    def _consec_flag(group: pd.DataFrame) -> pd.Series:
        flag = pd.Series(False, index=group.index)
        count = 0
        for idx in group.index:
            if group.loc[idx, "above_threshold"]:
                count += 1
                if count >= consecutive_months:
                    flag.loc[idx] = True
            else:
                count = 0
        return flag

    df["flag_card_acceleration"] = (
        df.groupby("Account", group_keys=False)
        .apply(_consec_flag, include_groups=False)
        .astype(bool)
    )

    n_flagged = df.loc[df["flag_card_acceleration"], "Account"].nunique()
    log.info(
        "flag_card_acceleration: %d accounts with %.0f%%+ growth for %d+ months",
        n_flagged, growth_threshold, consecutive_months,
    )
    return df


# ─── 11. Overdraft Dependency Score ──────────────────────────────────────────

def flag_overdraft_dependent(
    df: pd.DataFrame,
    amber_threshold: int = 3,
    red_threshold: int = 6,
) -> pd.DataFrame:
    """
    Score and flag overdraft dependency by consecutive months of usage.
    Adds flag_overdraft_dependent (bool) and overdraft_severity ('amber'|'red'|None).

    Input columns: PersonalID, NoAccount, months_with_overdraft
    """
    _require_cols(df, ["PersonalID", "months_with_overdraft"], "flag_overdraft_dependent")

    df = df.copy()
    df["flag_overdraft_dependent"] = df["months_with_overdraft"] >= amber_threshold
    df["overdraft_severity"] = df["months_with_overdraft"].apply(
        lambda m: "red" if m >= red_threshold else ("amber" if m >= amber_threshold else None)
    )

    red_count = (df["overdraft_severity"] == "red").sum()
    amber_count = (df["overdraft_severity"] == "amber").sum()
    log.info(
        "flag_overdraft_dependent: %d red (>=%dM), %d amber (%d–%dM)",
        red_count, red_threshold, amber_count, amber_threshold, red_threshold - 1,
    )
    return df
