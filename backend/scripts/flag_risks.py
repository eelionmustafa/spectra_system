"""
SPECTRA Risk Flagging Pipeline
===============================
Five independent flagging functions that each accept a DataFrame and return it
with a boolean flag_* column added.

All functions:
  - Accept: pd.DataFrame
  - Return: pd.DataFrame with new flag_* boolean column
  - Log data quality issues via logging, not print()
  - Validate required columns on entry
"""

import logging
from typing import List

import numpy as np
import pandas as pd
from scipy import stats

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("spectra.flag_risks")

_REQUIRED_COLUMNS_ERROR = "DataFrame missing required columns: %s"


def _validate_columns(df: pd.DataFrame, required: List[str], fn_name: str) -> None:
    """Raise ValueError if required columns are absent."""
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"[{fn_name}] " + _REQUIRED_COLUMNS_ERROR % missing)


def flag_rising_delay_trend(
    df: pd.DataFrame,
    date_col: str = "due_date",
    delay_col: str = "due_days",
    id_col: str = "credit_account",
    min_observations: int = 4,
) -> pd.DataFrame:
    """
    Flag credits with a statistically rising delay trend.

    Uses linear regression slope on due_days over time per credit account.
    A positive slope (delay increasing) is flagged as True.

    Threshold: slope > 0 with at least `min_observations` data points.

    Args:
        df: DataFrame with one row per installment/observation.
        date_col: Column containing observation dates.
        delay_col: Column containing delay days (numeric).
        id_col: Column identifying the credit account.
        min_observations: Minimum rows needed to compute a meaningful slope.

    Returns:
        DataFrame with added column `flag_rising_delay` (bool).
    """
    _validate_columns(df, [date_col, delay_col, id_col], "flag_rising_delay_trend")

    df = df.copy()
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")

    null_dates = df[date_col].isna().sum()
    if null_dates > 0:
        logger.warning("flag_rising_delay_trend: %d null dates dropped", null_dates)

    df = df.dropna(subset=[date_col, delay_col])
    df["_ordinal"] = df[date_col].map(lambda d: d.toordinal())

    def _rising_slope(group: pd.DataFrame) -> bool:
        if len(group) < min_observations:
            return False
        slope, _, _, _, _ = stats.linregress(group["_ordinal"], group[delay_col].astype(float))
        return bool(slope > 0)

    slope_flags = df.groupby(id_col).apply(_rising_slope, include_groups=False).rename("flag_rising_delay")
    df = df.merge(slope_flags, on=id_col, how="left")
    df["flag_rising_delay"] = df["flag_rising_delay"].fillna(False).astype(bool)
    df.drop(columns=["_ordinal"], inplace=True)

    n_flagged = df.groupby(id_col)["flag_rising_delay"].first().sum()
    logger.info("flag_rising_delay_trend: %d accounts flagged", n_flagged)
    return df


def flag_zscore_anomaly(
    df: pd.DataFrame,
    delay_col: str = "due_days",
    id_col: str = "credit_account",
    product_col: str = "product_type",
    threshold: float = 2.0,
) -> pd.DataFrame:
    """
    Flag individual observations where the delay z-score exceeds the threshold.

    Z-score is computed per product type when `product_col` is present in the
    DataFrame, so that a 30 DPD on a mortgage is evaluated against other
    mortgages rather than against the full mixed portfolio.  If the column is
    absent the function falls back to a global z-score with a warning.

    Threshold: z-score > 2.0 (configurable via `threshold` parameter).

    Args:
        df: DataFrame with one row per observation.
        delay_col: Column containing delay days (numeric).
        id_col: Column identifying the credit account.
        product_col: Column containing the product/loan type.  Optional — falls
                     back to global z-score when absent.
        threshold: Z-score threshold above which an observation is anomalous.

    Returns:
        DataFrame with added column `flag_zscore_anomaly` (bool).
    """
    _validate_columns(df, [delay_col, id_col], "flag_zscore_anomaly")

    df = df.copy()
    null_delay = df[delay_col].isna().sum()
    if null_delay > 0:
        logger.warning("flag_zscore_anomaly: %d null delay values found", null_delay)

    delay_values = df[delay_col].fillna(0).astype(float)

    if product_col in df.columns:
        # Per-product-type z-score: each product family forms its own reference distribution
        def _zscore_group(group: pd.Series) -> pd.Series:
            if len(group) < 3:
                # Not enough observations in this product type for meaningful z-score
                return pd.Series(0.0, index=group.index)
            return np.abs(stats.zscore(group.astype(float)))

        df["_zscore"] = (
            delay_values
            .groupby(df[product_col])
            .transform(_zscore_group)
        )
        logger.info(
            "flag_zscore_anomaly: z-score computed per product type (%d distinct types)",
            df[product_col].nunique(),
        )
    else:
        logger.warning(
            "flag_zscore_anomaly: '%s' column absent — falling back to global z-score. "
            "Provide product_col for per-product anomaly detection.",
            product_col,
        )
        df["_zscore"] = np.abs(stats.zscore(delay_values))

    df["flag_zscore_anomaly"] = df["_zscore"] > threshold
    df.drop(columns=["_zscore"], inplace=True)

    n_flagged = int(df["flag_zscore_anomaly"].sum())
    logger.info(
        "flag_zscore_anomaly: %d observations flagged (threshold=%.1f)", n_flagged, threshold
    )
    return df


def flag_consecutive_lates(
    df: pd.DataFrame,
    date_col: str = "due_date",
    delay_col: str = "due_days",
    id_col: str = "credit_account",
    consecutive_threshold: int = 3,
) -> pd.DataFrame:
    """
    Flag credit accounts with N or more consecutive late payments.

    A payment is 'late' if due_days > 0.

    Threshold: 3 consecutive late payments (configurable via `consecutive_threshold`).

    Args:
        df: DataFrame with one row per installment, sorted by date.
        date_col: Column containing payment due dates.
        delay_col: Column containing delay days.
        id_col: Column identifying the credit account.
        consecutive_threshold: Number of consecutive lates to trigger the flag.

    Returns:
        DataFrame with added column `flag_consecutive_lates` (bool).
    """
    _validate_columns(df, [date_col, delay_col, id_col], "flag_consecutive_lates")

    df = df.copy().sort_values([id_col, date_col])

    def _has_consecutive_streak(group: pd.DataFrame) -> bool:
        is_late = (group[delay_col].fillna(0) > 0).astype(int)
        streak = is_late.groupby((is_late != is_late.shift()).cumsum()).transform("sum")
        return bool((streak >= consecutive_threshold).any())

    streak_flags = df.groupby(id_col).apply(_has_consecutive_streak, include_groups=False).rename(
        "flag_consecutive_lates"
    )
    df = df.merge(streak_flags, on=id_col, how="left")
    df["flag_consecutive_lates"] = df["flag_consecutive_lates"].fillna(False).astype(bool)

    n_flagged = df.groupby(id_col)["flag_consecutive_lates"].first().sum()
    logger.info(
        "flag_consecutive_lates: %d accounts with %d+ consecutive lates",
        n_flagged,
        consecutive_threshold,
    )
    return df


def flag_score_deterioration(
    df: pd.DataFrame,
    rating_col: str = "risk_rating",
    date_col: str = "calculation_date",
    id_col: str = "client_id",
    deterioration_threshold: int = 2,
) -> pd.DataFrame:
    """
    Flag clients whose current risk rating has degraded significantly vs. their initial rating.

    Compares the most recent rating to the earliest recorded rating per client.
    Assumes ratings are numeric (higher = worse risk).

    Threshold: Rating degraded by `deterioration_threshold` or more notches.

    Args:
        df: DataFrame with one row per risk rating observation.
        rating_col: Column containing numeric risk rating (higher = worse).
        date_col: Column containing rating calculation date.
        id_col: Column identifying the client.
        deterioration_threshold: Minimum rating increase to trigger flag.

    Returns:
        DataFrame with added column `flag_score_deterioration` (bool).
    """
    _validate_columns(df, [rating_col, date_col, id_col], "flag_score_deterioration")

    df = df.copy()
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.dropna(subset=[date_col, rating_col])

    def _deteriorated(group: pd.DataFrame) -> bool:
        if len(group) < 2:
            return False
        group_sorted = group.sort_values(date_col)
        initial = group_sorted[rating_col].iloc[0]
        current = group_sorted[rating_col].iloc[-1]
        try:
            return bool((float(current) - float(initial)) >= deterioration_threshold)
        except (TypeError, ValueError):
            return False

    deteriod_flags = df.groupby(id_col).apply(_deteriorated, include_groups=False).rename("flag_score_deterioration")
    df = df.merge(deteriod_flags, on=id_col, how="left")
    df["flag_score_deterioration"] = df["flag_score_deterioration"].fillna(False).astype(bool)

    n_flagged = df.groupby(id_col)["flag_score_deterioration"].first().sum()
    logger.info("flag_score_deterioration: %d clients flagged", n_flagged)
    return df


def flag_exposure_spike(
    df: pd.DataFrame,
    date_col: str = "calculation_date",
    exposure_col: str = "total_exposure",
    id_col: str = "client_id",
    window_days: int = 30,
    spike_threshold_pct: float = 20.0,
) -> pd.DataFrame:
    """
    Flag clients whose total exposure increased by more than `spike_threshold_pct`
    within a rolling `window_days` window.

    Threshold: >20% exposure growth within any 30-day period.

    Args:
        df: DataFrame with one row per exposure snapshot per client.
        date_col: Column containing snapshot date.
        exposure_col: Column containing total exposure amount (numeric).
        id_col: Column identifying the client.
        window_days: Rolling window size in days.
        spike_threshold_pct: Percentage increase threshold to trigger flag.

    Returns:
        DataFrame with added column `flag_exposure_spike` (bool).
    """
    _validate_columns(df, [date_col, exposure_col, id_col], "flag_exposure_spike")

    df = df.copy()
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.dropna(subset=[date_col, exposure_col]).sort_values([id_col, date_col])

    def _has_spike(group: pd.DataFrame) -> bool:
        group = group.set_index(date_col).sort_index()
        for ts, row in group.iterrows():
            window_start = ts - pd.Timedelta(days=window_days)
            prior = group.loc[window_start:ts, exposure_col]
            if len(prior) < 2:
                continue
            base = prior.iloc[0]
            if base <= 0:
                continue
            pct_change = (float(row[exposure_col]) - float(base)) / float(base) * 100
            if pct_change > spike_threshold_pct:
                return True
        return False

    spike_flags = df.groupby(id_col).apply(_has_spike, include_groups=False).rename("flag_exposure_spike")
    df = df.merge(spike_flags, on=id_col, how="left")
    df["flag_exposure_spike"] = df["flag_exposure_spike"].fillna(False).astype(bool)

    n_flagged = df.groupby(id_col)["flag_exposure_spike"].first().sum()
    logger.info(
        "flag_exposure_spike: %d clients flagged (>%.0f%% in %dd)",
        n_flagged,
        spike_threshold_pct,
        window_days,
    )
    return df
