"""
Unit tests for scripts/flag_risks.py
All 5 early-warning flagging functions.
"""
import pytest
import pandas as pd
import numpy as np

from flag_risks import (
    flag_rising_delay_trend,
    flag_zscore_anomaly,
    flag_consecutive_lates,
    flag_score_deterioration,
    flag_exposure_spike,
)


# ─── 1. Rising Delay Trend ────────────────────────────────────────────────────

class TestFlagRisingDelayTrend:
    def _rising(self):
        return pd.DataFrame({
            "credit_account": ["A"] * 5,
            "due_date": pd.to_datetime(["2026-01-01", "2026-02-01", "2026-03-01",
                                        "2026-04-01", "2026-05-01"]),
            "due_days": [5, 10, 15, 20, 25],
        })

    def _flat(self):
        return pd.DataFrame({
            "credit_account": ["B"] * 5,
            "due_date": pd.to_datetime(["2026-01-01", "2026-02-01", "2026-03-01",
                                        "2026-04-01", "2026-05-01"]),
            "due_days": [10, 10, 10, 10, 10],
        })

    def test_flags_rising_account(self):
        result = flag_rising_delay_trend(self._rising())
        assert result["flag_rising_delay"].all()

    def test_no_flag_flat_trend(self):
        result = flag_rising_delay_trend(self._flat())
        assert not result["flag_rising_delay"].any()

    def test_insufficient_observations_not_flagged(self):
        df = pd.DataFrame({
            "credit_account": ["A"] * 3,
            "due_date": pd.to_datetime(["2026-01-01", "2026-02-01", "2026-03-01"]),
            "due_days": [5, 10, 15],
        })
        result = flag_rising_delay_trend(df, min_observations=4)
        assert not result["flag_rising_delay"].any()

    def test_missing_columns_raises(self):
        with pytest.raises(ValueError):
            flag_rising_delay_trend(pd.DataFrame({"credit_account": ["A"]}))

    def test_mixed_accounts(self):
        df = pd.concat([self._rising(), self._flat()], ignore_index=True)
        result = flag_rising_delay_trend(df)
        flagged = result.groupby("credit_account")["flag_rising_delay"].first()
        assert flagged["A"] is True or flagged["A"] == True
        assert flagged["B"] is False or flagged["B"] == False


# ─── 2. Z-Score Anomaly ───────────────────────────────────────────────────────

class TestFlagZscoreAnomaly:
    def _df(self):
        # 10 normal values + 1 extreme outlier — ensures outlier z-score >> 2.0
        normal = ["A"] * 5 + ["B"] * 5
        return pd.DataFrame({
            "credit_account": normal + ["C"],
            "due_days": [5, 6, 4, 5, 6, 4, 5, 6, 4, 5, 500],
        })

    def test_flags_outlier(self):
        result = flag_zscore_anomaly(self._df(), threshold=2.0)
        assert result.loc[result.credit_account == "C", "flag_zscore_anomaly"].iloc[0]

    def test_no_flag_normal_values(self):
        result = flag_zscore_anomaly(self._df(), threshold=2.0)
        normal = result.loc[result.credit_account == "A"]
        assert not normal["flag_zscore_anomaly"].any()

    def test_higher_threshold_reduces_flags(self):
        result_low = flag_zscore_anomaly(self._df(), threshold=1.0)
        result_high = flag_zscore_anomaly(self._df(), threshold=3.0)
        assert result_low["flag_zscore_anomaly"].sum() >= result_high["flag_zscore_anomaly"].sum()

    def test_missing_columns_raises(self):
        with pytest.raises(ValueError):
            flag_zscore_anomaly(pd.DataFrame({"credit_account": ["A"]}))

    def test_uniform_data_no_flags(self):
        df = pd.DataFrame({
            "credit_account": ["A"] * 10,
            "due_days": [5] * 10,
        })
        result = flag_zscore_anomaly(df, threshold=2.0)
        assert not result["flag_zscore_anomaly"].any()


# ─── 3. Consecutive Lates ─────────────────────────────────────────────────────

class TestFlagConsecutiveLates:
    def _df(self):
        return pd.DataFrame({
            "credit_account": ["A", "A", "A", "A", "B", "B", "B"],
            "due_date": pd.to_datetime([
                "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01",
                "2026-01-01", "2026-02-01", "2026-03-01",
            ]),
            "due_days": [5, 10, 15, 0, 5, 0, 10],  # A: 3 lates then on-time; B: late, ok, late
        })

    def test_flags_three_consecutive_lates(self):
        result = flag_consecutive_lates(self._df(), consecutive_threshold=3)
        flagged = result.groupby("credit_account")["flag_consecutive_lates"].first()
        assert flagged["A"]

    def test_no_flag_non_consecutive(self):
        result = flag_consecutive_lates(self._df(), consecutive_threshold=3)
        flagged = result.groupby("credit_account")["flag_consecutive_lates"].first()
        assert not flagged["B"]

    def test_zero_due_days_not_late(self):
        df = pd.DataFrame({
            "credit_account": ["A"] * 3,
            "due_date": pd.to_datetime(["2026-01-01", "2026-02-01", "2026-03-01"]),
            "due_days": [0, 0, 0],
        })
        result = flag_consecutive_lates(df, consecutive_threshold=3)
        assert not result["flag_consecutive_lates"].any()

    def test_missing_columns_raises(self):
        with pytest.raises(ValueError):
            flag_consecutive_lates(pd.DataFrame({"credit_account": ["A"]}))


# ─── 4. Score Deterioration ───────────────────────────────────────────────────

class TestFlagScoreDeterioration:
    def _df(self):
        return pd.DataFrame({
            "client_id": ["C1", "C1", "C2", "C2", "C3", "C3"],
            "calculation_date": pd.to_datetime([
                "2025-01-01", "2026-01-01",
                "2025-01-01", "2026-01-01",
                "2025-01-01", "2026-01-01",
            ]),
            "risk_rating": [2, 5, 3, 4, 6, 6],  # C1: +3 notches, C2: +1, C3: no change
        })

    def test_flags_large_deterioration(self):
        result = flag_score_deterioration(self._df(), deterioration_threshold=2)
        flagged = result.groupby("client_id")["flag_score_deterioration"].first()
        assert flagged["C1"]

    def test_no_flag_small_change(self):
        result = flag_score_deterioration(self._df(), deterioration_threshold=2)
        flagged = result.groupby("client_id")["flag_score_deterioration"].first()
        assert not flagged["C2"]

    def test_no_flag_stable_rating(self):
        result = flag_score_deterioration(self._df(), deterioration_threshold=2)
        flagged = result.groupby("client_id")["flag_score_deterioration"].first()
        assert not flagged["C3"]

    def test_single_observation_not_flagged(self):
        df = pd.DataFrame({
            "client_id": ["C1"],
            "calculation_date": pd.to_datetime(["2026-01-01"]),
            "risk_rating": [5],
        })
        result = flag_score_deterioration(df)
        assert not result["flag_score_deterioration"].any()

    def test_missing_columns_raises(self):
        with pytest.raises(ValueError):
            flag_score_deterioration(pd.DataFrame({"client_id": ["C1"]}))


# ─── 5. Exposure Spike ────────────────────────────────────────────────────────

class TestFlagExposureSpike:
    def _spiked(self):
        return pd.DataFrame({
            "client_id": ["C1", "C1"],
            "calculation_date": pd.to_datetime(["2026-01-01", "2026-01-20"]),
            "total_exposure": [100_000.0, 150_000.0],  # +50% in 19 days
        })

    def _stable(self):
        return pd.DataFrame({
            "client_id": ["C2", "C2"],
            "calculation_date": pd.to_datetime(["2026-01-01", "2026-01-20"]),
            "total_exposure": [100_000.0, 110_000.0],  # +10%
        })

    def test_flags_large_spike(self):
        result = flag_exposure_spike(self._spiked(), spike_threshold_pct=20.0)
        assert result["flag_exposure_spike"].all()

    def test_no_flag_below_threshold(self):
        result = flag_exposure_spike(self._stable(), spike_threshold_pct=20.0)
        assert not result["flag_exposure_spike"].any()

    def test_no_flag_single_observation(self):
        df = pd.DataFrame({
            "client_id": ["C1"],
            "calculation_date": pd.to_datetime(["2026-01-01"]),
            "total_exposure": [100_000.0],
        })
        result = flag_exposure_spike(df, spike_threshold_pct=20.0)
        assert not result["flag_exposure_spike"].any()

    def test_zero_base_exposure_not_flagged(self):
        df = pd.DataFrame({
            "client_id": ["C1", "C1"],
            "calculation_date": pd.to_datetime(["2026-01-01", "2026-01-20"]),
            "total_exposure": [0.0, 50_000.0],
        })
        result = flag_exposure_spike(df, spike_threshold_pct=20.0)
        assert not result["flag_exposure_spike"].any()

    def test_missing_columns_raises(self):
        with pytest.raises(ValueError):
            flag_exposure_spike(pd.DataFrame({"client_id": ["C1"]}))
