"""
SPECTRA — Run Risk Flags Pipeline
Computes per-client risk flags from the engineered features.parquet and writes
risk_flags.csv to data/processed/.

This script is designed to run after feature_engineering.py.
Outputs: data/processed/risk_flags.csv

Columns in output:
  clientID, flag_zscore_anomaly, flag_score_deterioration,
  flag_exposure_spike, flag_salary_stopped, flag_overdraft_dependent,
  flag_card_acceleration, risk_flag_count
"""
import logging
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("spectra.run_flags")

_SCRIPT_DIR   = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPT_DIR.parent
_DATA_DIR     = _PROJECT_ROOT / "data" / "processed"
_OUTPUT       = _DATA_DIR / "risk_flags.csv"


def run_flags() -> pd.DataFrame:
    feat_path = _DATA_DIR / "features.parquet"
    if not feat_path.exists():
        log.error("features.parquet not found at %s — run feature_engineering.py first", feat_path)
        raise FileNotFoundError(str(feat_path))

    log.info("Loading features.parquet...")
    df = pd.read_parquet(feat_path).reset_index()
    log.info("Loaded %d clients, %d features", len(df), df.shape[1])

    flags = pd.DataFrame({"clientID": df["clientID"]})

    # ── 1. Z-score anomaly on current DPD ────────────────────────────────────
    # Flags clients whose current DPD is a statistical outlier across the portfolio.
    # Note: z-score is computed globally (per Fix #11, ideally per product type,
    # but product type is not stored in features.parquet).
    if "DueDays" in df.columns:
        due = pd.to_numeric(df["DueDays"], errors="coerce").fillna(0).astype(float)
        zscores = np.abs(stats.zscore(due))
        flags["flag_zscore_anomaly"] = zscores > 2.0
        log.info("flag_zscore_anomaly: %d clients flagged", flags["flag_zscore_anomaly"].sum())
    else:
        flags["flag_zscore_anomaly"] = False
        log.warning("DueDays column not found — flag_zscore_anomaly set to False")

    # ── 2. Score deterioration (rating downgrade >= 2 notches) ───────────────
    if "BankCurrentRating" in df.columns and "BankPreviousMonthRating" in df.columns:
        cur = pd.to_numeric(df["BankCurrentRating"], errors="coerce")
        prev = pd.to_numeric(df["BankPreviousMonthRating"], errors="coerce")
        flags["flag_score_deterioration"] = (cur - prev) >= 2
        n = flags["flag_score_deterioration"].sum()
        log.info("flag_score_deterioration: %d clients with rating downgrade >=2 notches", n)
    else:
        flags["flag_score_deterioration"] = False
        log.warning("Rating columns not found — flag_score_deterioration set to False")

    # ── 3. Exposure spike (>20% growth vs prior month) ────────────────────────
    if "totalExposure" in df.columns and "prevTotalExposure" in df.columns:
        cur_exp  = pd.to_numeric(df["totalExposure"],     errors="coerce").fillna(0)
        prev_exp = pd.to_numeric(df["prevTotalExposure"], errors="coerce").fillna(0)
        pct_change = ((cur_exp - prev_exp) / prev_exp.replace(0, np.nan)) * 100
        flags["flag_exposure_spike"] = pct_change > 20.0
        n = flags["flag_exposure_spike"].sum()
        log.info("flag_exposure_spike: %d clients with >20%% MoM exposure growth", n)
    else:
        flags["flag_exposure_spike"] = False
        log.warning("Exposure columns not found — flag_exposure_spike set to False")

    # ── 4. Salary stopped (pass-through from feature engineering) ────────────
    if "salary_stopped_flag" in df.columns:
        flags["flag_salary_stopped"] = df["salary_stopped_flag"].astype(bool)
        log.info("flag_salary_stopped: %d clients", flags["flag_salary_stopped"].sum())
    else:
        flags["flag_salary_stopped"] = False
        log.warning("salary_stopped_flag not found in features")

    # ── 5. Overdraft dependency (pass-through) ────────────────────────────────
    if "overdraft_dependency" in df.columns:
        flags["flag_overdraft_dependent"] = df["overdraft_dependency"].astype(bool)
        log.info("flag_overdraft_dependent: %d clients", flags["flag_overdraft_dependent"].sum())
    else:
        flags["flag_overdraft_dependent"] = False
        log.warning("overdraft_dependency not found in features")

    # ── 6. Card spend acceleration (pass-through) ─────────────────────────────
    if "card_acceleration_flag" in df.columns:
        flags["flag_card_acceleration"] = df["card_acceleration_flag"].astype(bool)
        log.info("flag_card_acceleration: %d clients", flags["flag_card_acceleration"].sum())
    else:
        flags["flag_card_acceleration"] = False
        log.warning("card_acceleration_flag not found in features")

    # ── Summary score: total number of flags raised per client ────────────────
    flag_cols = [c for c in flags.columns if c.startswith("flag_")]
    flags["risk_flag_count"] = flags[flag_cols].sum(axis=1).astype(int)

    flags.to_csv(_OUTPUT, index=False)
    log.info("Risk flags saved to %s (%d clients)", _OUTPUT, len(flags))

    summary = {col: int(flags[col].sum()) for col in flag_cols}
    log.info("Flag summary: %s", summary)
    return flags


if __name__ == "__main__":
    result = run_flags()
    print(result[["clientID", "risk_flag_count"]].sort_values("risk_flag_count", ascending=False).head(20).to_string())
