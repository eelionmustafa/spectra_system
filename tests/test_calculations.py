"""
Unit tests for scripts/calculations.py
All 11 portfolio calculation / flagging functions.
"""
import pytest
import pandas as pd
import numpy as np

from calculations import (
    build_rollrate_matrix,
    flag_rollrate_increase,
    flag_vintage_deterioration,
    flag_npl_ratio,
    flag_ecl_provision_gap,
    flag_low_repayment,
    flag_interest_income_at_risk,
    flag_pd_increase,
    flag_coverage_decline,
    flag_fast_default,
    flag_card_acceleration,
    flag_overdraft_dependent,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _rollrate_df(current_to_30_pct: float) -> pd.DataFrame:
    """Build a simple rollrate input where 0→30-59 DPD rate = current_to_30_pct."""
    n_30 = int(current_to_30_pct * 100)
    n_curr = 100 - n_30
    rows = [
        {"from_bucket": "0 - Current", "to_bucket": "30-59 DPD", "transitions": n_30},
        {"from_bucket": "0 - Current", "to_bucket": "0 - Current", "transitions": n_curr},
    ]
    return pd.DataFrame(rows)


# ─── 1. Rollrate Matrix ───────────────────────────────────────────────────────

class TestBuildRollrateMatrix:
    def test_rate_row_sums_to_one(self):
        df = _rollrate_df(0.20)
        matrix = build_rollrate_matrix(df)
        total = matrix.loc["0 - Current"].sum()
        assert abs(total - 1.0) < 1e-9

    def test_correct_rate_value(self):
        df = _rollrate_df(0.25)
        matrix = build_rollrate_matrix(df)
        assert abs(matrix.loc["0 - Current", "30-59 DPD"] - 0.25) < 1e-9

    def test_missing_columns_raises(self):
        with pytest.raises(ValueError, match="missing columns"):
            build_rollrate_matrix(pd.DataFrame({"from_bucket": ["A"], "to_bucket": ["B"]}))

    def test_all_buckets_present(self):
        df = _rollrate_df(0.10)
        matrix = build_rollrate_matrix(df)
        expected = {"0 - Current", "1-29 DPD", "30-59 DPD", "60-89 DPD", "90+ DPD"}
        assert expected == set(matrix.index)


class TestFlagRollrateIncrease:
    def test_flags_when_increase_above_threshold(self):
        curr = build_rollrate_matrix(_rollrate_df(0.30))
        prev = build_rollrate_matrix(_rollrate_df(0.10))
        assert flag_rollrate_increase(curr, prev) is True

    def test_no_flag_when_below_threshold(self):
        curr = build_rollrate_matrix(_rollrate_df(0.12))
        prev = build_rollrate_matrix(_rollrate_df(0.10))
        assert flag_rollrate_increase(curr, prev) is False

    def test_no_flag_when_rate_decreased(self):
        curr = build_rollrate_matrix(_rollrate_df(0.05))
        prev = build_rollrate_matrix(_rollrate_df(0.20))
        assert flag_rollrate_increase(curr, prev) is False

    def test_exact_threshold_not_flagged(self):
        curr = build_rollrate_matrix(_rollrate_df(0.20))
        prev = build_rollrate_matrix(_rollrate_df(0.10))
        # increase = 0.10, threshold default = 0.10 → not strictly greater
        assert flag_rollrate_increase(curr, prev) is False


# ─── 2. Vintage Deterioration ─────────────────────────────────────────────────

class TestFlagVintageDeterioration:
    def _df(self):
        return pd.DataFrame({
            "vintage_year": [2020, 2021, 2022],
            "delinquency_rate_pct": [5.0, 12.0, 3.0],
        })

    def test_flags_above_threshold(self):
        result = flag_vintage_deterioration(self._df(), threshold_pct=10.0)
        assert result.loc[result.vintage_year == 2021, "flag_vintage_deterioration"].iloc[0]

    def test_no_flag_below_threshold(self):
        result = flag_vintage_deterioration(self._df(), threshold_pct=10.0)
        assert not result.loc[result.vintage_year == 2020, "flag_vintage_deterioration"].iloc[0]

    def test_missing_columns_raises(self):
        with pytest.raises(ValueError):
            flag_vintage_deterioration(pd.DataFrame({"vintage_year": [2020]}))

    def test_does_not_mutate_input(self):
        df = self._df()
        original_cols = set(df.columns)
        flag_vintage_deterioration(df)
        assert set(df.columns) == original_cols


# ─── 3. NPL Ratio ─────────────────────────────────────────────────────────────

class TestFlagNplRatio:
    def _df(self):
        return pd.DataFrame({
            "month": ["2026-01", "2026-02", "2026-03"],
            "npl_ratio_pct": [4.0, 6.5, 8.0],
        })

    def test_flags_high_npl(self):
        result = flag_npl_ratio(self._df(), npl_threshold=5.0)
        assert result.loc[result.month == "2026-02", "flag_npl_high"].iloc[0]
        assert not result.loc[result.month == "2026-01", "flag_npl_high"].iloc[0]

    def test_flags_npl_spike(self):
        result = flag_npl_ratio(self._df(), npl_threshold=5.0, mom_threshold=1.0)
        # Jan→Feb: +2.5pp spike; Feb→Mar: +1.5pp spike
        assert result["flag_npl_spike"].sum() == 2

    def test_no_spike_when_stable(self):
        df = pd.DataFrame({
            "month": ["2026-01", "2026-02", "2026-03"],
            "npl_ratio_pct": [4.0, 4.3, 4.5],
        })
        result = flag_npl_ratio(df, mom_threshold=1.0)
        assert result["flag_npl_spike"].sum() == 0


# ─── 4. ECL Provision Gap ─────────────────────────────────────────────────────

class TestFlagEclProvisionGap:
    def _df(self):
        return pd.DataFrame({
            "Stage": [1, 2, 3],
            "provision_gap": [100.0, -50.0, 200.0],
        })

    def test_flags_negative_gap(self):
        result = flag_ecl_provision_gap(self._df())
        assert result.loc[result.Stage == 2, "flag_under_provisioned"].iloc[0]

    def test_no_flag_positive_gap(self):
        result = flag_ecl_provision_gap(self._df())
        assert not result.loc[result.Stage == 1, "flag_under_provisioned"].iloc[0]

    def test_zero_gap_not_flagged(self):
        df = pd.DataFrame({"Stage": [1], "provision_gap": [0.0]})
        result = flag_ecl_provision_gap(df)
        assert not result["flag_under_provisioned"].iloc[0]


# ─── 5. Low Repayment ─────────────────────────────────────────────────────────

class TestFlagLowRepayment:
    def _df(self):
        # Account A: 3 consecutive below threshold → should be flagged
        # Account B: mixed → should not be flagged
        return pd.DataFrame({
            "credit_account": ["A", "A", "A", "A", "B", "B", "B"],
            "due_date": pd.to_datetime([
                "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01",
                "2026-01-01", "2026-02-01", "2026-03-01",
            ]),
            "repayment_rate": [0.5, 0.6, 0.7, 0.9, 0.5, 0.95, 0.5],
        })

    def test_flags_consecutive_low_account(self):
        result = flag_low_repayment(self._df(), rate_threshold=0.8, consecutive_n=3)
        flagged_accounts = result.loc[result["flag_low_repayment"], "credit_account"].unique()
        assert "A" in flagged_accounts

    def test_no_flag_non_consecutive(self):
        result = flag_low_repayment(self._df(), rate_threshold=0.8, consecutive_n=3)
        flagged_accounts = result.loc[result["flag_low_repayment"], "credit_account"].unique()
        assert "B" not in flagged_accounts

    def test_missing_columns_raises(self):
        with pytest.raises(ValueError):
            flag_low_repayment(pd.DataFrame({"credit_account": ["A"]}))


# ─── 6. Interest Income at Risk ───────────────────────────────────────────────

class TestFlagInterestIncomeAtRisk:
    def test_flags_when_above_threshold(self):
        df = pd.DataFrame({"interest_income_at_risk": [60.0, 40.0]})
        result = flag_interest_income_at_risk(df, portfolio_total_interest=1000.0, threshold_pct=5.0)
        assert result["flag_interest_at_risk"].all()

    def test_no_flag_below_threshold(self):
        df = pd.DataFrame({"interest_income_at_risk": [10.0, 20.0]})
        result = flag_interest_income_at_risk(df, portfolio_total_interest=1000.0, threshold_pct=5.0)
        assert not result["flag_interest_at_risk"].any()

    def test_no_flag_without_benchmark(self):
        df = pd.DataFrame({"interest_income_at_risk": [999.0]})
        result = flag_interest_income_at_risk(df)
        assert not result["flag_interest_at_risk"].any()


# ─── 7. PD Increase ───────────────────────────────────────────────────────────

class TestFlagPdIncrease:
    def _df(self):
        return pd.DataFrame({
            "rating_last_month": ["A", "B", "C"],
            "pd_pct": [2.0, 12.0, 5.0],
            "pd_pct_prev": [1.5, 5.0, 4.5],
        })

    def test_flags_large_increase(self):
        result = flag_pd_increase(self._df(), threshold=5.0)
        assert result.loc[result.rating_last_month == "B", "flag_pd_increase"].iloc[0]

    def test_no_flag_small_increase(self):
        result = flag_pd_increase(self._df(), threshold=5.0)
        assert not result.loc[result.rating_last_month == "A", "flag_pd_increase"].iloc[0]

    def test_no_flag_without_prior_col(self):
        df = pd.DataFrame({"rating_last_month": ["A"], "pd_pct": [10.0]})
        result = flag_pd_increase(df)
        assert not result["flag_pd_increase"].any()


# ─── 8. Coverage Decline ──────────────────────────────────────────────────────

class TestFlagCoverageDecline:
    def _df(self):
        return pd.DataFrame({
            "CalculationDate": pd.to_datetime(["2026-01-01", "2026-02-01", "2026-03-01"] * 2),
            "Stage": [2, 2, 2, 3, 3, 3],
            "coverage_ratio_pct": [60.0, 55.0, 52.0, 80.0, 79.5, 77.0],
        })

    def test_flags_significant_decline(self):
        result = flag_coverage_decline(self._df(), decline_threshold=2.0)
        assert result["flag_coverage_decline"].any()

    def test_no_flag_small_decline(self):
        df = pd.DataFrame({
            "CalculationDate": pd.to_datetime(["2026-01-01", "2026-02-01"]),
            "Stage": [2, 2],
            "coverage_ratio_pct": [60.0, 59.5],
        })
        result = flag_coverage_decline(df, decline_threshold=2.0)
        assert not result["flag_coverage_decline"].any()


# ─── 9. Fast Default ──────────────────────────────────────────────────────────

class TestFlagFastDefault:
    def _df(self):
        return pd.DataFrame({
            "CreditAccount": ["L001", "L002", "L003"],
            "days_to_first_delinquency": [45, 120, 200],
        })

    def test_flags_fast_default(self):
        result = flag_fast_default(self._df(), threshold_days=90)
        assert result.loc[result.CreditAccount == "L001", "flag_fast_default"].iloc[0]

    def test_no_flag_slow_default(self):
        result = flag_fast_default(self._df(), threshold_days=90)
        assert not result.loc[result.CreditAccount == "L002", "flag_fast_default"].iloc[0]

    def test_missing_columns_raises(self):
        with pytest.raises(ValueError):
            flag_fast_default(pd.DataFrame({"CreditAccount": ["L001"]}))


# ─── 10. Card Acceleration ────────────────────────────────────────────────────

class TestFlagCardAcceleration:
    def _df(self):
        # Account X: 2 consecutive months >30% growth → flagged
        # Account Y: only 1 month → not flagged
        return pd.DataFrame({
            "Account": ["X", "X", "X", "Y", "Y"],
            "spend_month": ["2026-01", "2026-02", "2026-03", "2026-01", "2026-02"],
            "mom_growth_pct": [50.0, 40.0, 10.0, 60.0, 5.0],
        })

    def test_flags_consecutive_growth(self):
        result = flag_card_acceleration(self._df(), growth_threshold=30.0, consecutive_months=2)
        flagged = result.loc[result["flag_card_acceleration"], "Account"].unique()
        assert "X" in flagged

    def test_no_flag_single_month_spike(self):
        result = flag_card_acceleration(self._df(), growth_threshold=30.0, consecutive_months=2)
        flagged = result.loc[result["flag_card_acceleration"], "Account"].unique()
        assert "Y" not in flagged

    def test_missing_columns_raises(self):
        with pytest.raises(ValueError):
            flag_card_acceleration(pd.DataFrame({"Account": ["X"]}))


# ─── 11. Overdraft Dependency ─────────────────────────────────────────────────

class TestFlagOverdraftDependent:
    def _df(self):
        return pd.DataFrame({
            "PersonalID": ["P1", "P2", "P3", "P4"],
            "months_with_overdraft": [1, 4, 7, 2],
        })

    def test_amber_severity(self):
        result = flag_overdraft_dependent(self._df(), amber_threshold=3, red_threshold=6)
        assert result.loc[result.PersonalID == "P2", "overdraft_severity"].iloc[0] == "amber"

    def test_red_severity(self):
        result = flag_overdraft_dependent(self._df(), amber_threshold=3, red_threshold=6)
        assert result.loc[result.PersonalID == "P3", "overdraft_severity"].iloc[0] == "red"

    def test_no_flag_below_amber(self):
        result = flag_overdraft_dependent(self._df(), amber_threshold=3, red_threshold=6)
        assert not result.loc[result.PersonalID == "P1", "flag_overdraft_dependent"].iloc[0]
        assert pd.isna(result.loc[result.PersonalID == "P1", "overdraft_severity"].iloc[0])

    def test_flag_set_from_amber(self):
        result = flag_overdraft_dependent(self._df(), amber_threshold=3, red_threshold=6)
        assert result.loc[result.PersonalID == "P2", "flag_overdraft_dependent"].iloc[0]
