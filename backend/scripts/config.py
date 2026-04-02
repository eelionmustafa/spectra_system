"""
SPECTRA — Central Risk Configuration (Python)
─────────────────────────────────────────────────────────────────────────────
Python mirror of spectra-app/src/lib/config.ts.

IMPORTANT: Both files must stay in sync.
To change a threshold: update BOTH in the same commit.
For IFRS 9 / Basel-classified parameters, risk-committee sign-off is required.

Override any value by setting the corresponding environment variable.
"""
from __future__ import annotations
import os


def _f(key: str, default: float) -> float:
    v = os.environ.get(key)
    if v is None:
        return default
    try:
        return float(v)
    except ValueError:
        return default


def _i(key: str, default: int) -> int:
    v = os.environ.get(key)
    if v is None:
        return default
    try:
        return int(v)
    except ValueError:
        return default


# ─── PD Risk Label Thresholds ─────────────────────────────────────────────────
# Defines the five risk tiers derived from the 90-day PD score.
# Source: Internal credit policy (calibrated to model output distribution)
class _PdLabels:
    DEFAULT_IMMINENT = _f('PD_THRESHOLD_DEFAULT_IMMINENT', 0.86)
    CRITICAL         = _f('PD_THRESHOLD_CRITICAL',         0.66)
    HIGH             = _f('PD_THRESHOLD_HIGH',             0.41)
    MEDIUM           = _f('PD_THRESHOLD_MEDIUM',           0.21)

PD_LABELS = _PdLabels()

# Risk label + recommended action — ordered list consumed by predict.py
PD_LABEL_ACTIONS: list[tuple[float, str, str]] = [
    (PD_LABELS.DEFAULT_IMMINENT, "Default imminent", "Escalate to recovery team"),
    (PD_LABELS.CRITICAL,         "Critical",         "Immediate contact -- restructuring review"),
    (PD_LABELS.HIGH,             "High",             "Schedule client review"),
    (PD_LABELS.MEDIUM,           "Medium",           "Monitor monthly"),
    (0.0,                        "Low",              "No action required"),
]


def pd_to_label(pd_score: float) -> tuple[str, str]:
    """Return (risk_label, recommended_action) for a given PD score."""
    for threshold, label, action in PD_LABEL_ACTIONS:
        if pd_score >= threshold:
            return label, action
    return "Low", "No action required"


# ─── IFRS 9 / SICR Thresholds ─────────────────────────────────────────────────
# Significant Increase in Credit Risk — triggers Stage 1 → Stage 2 migration.
# Source: IFRS 9 §5.5, paragraphs B5.5.1–B5.5.9
class _SICR:
    PD_THRESHOLD    = _f('SICR_PD_THRESHOLD',    0.20)  # quantitative PD trigger
    DPD_BACKSTOP    = _i('SICR_DPD_BACKSTOP',    30)    # rebuttable presumption (IFRS 9 §B5.5.19)
    MISSED_PAYMENTS = _i('SICR_MISSED_PAYMENTS', 2)     # qualitative backstop
    NPL_DPD         = _i('SICR_NPL_DPD',         90)    # Stage 2 → 3: 90-day NPL definition
    MORTGAGE_DPD    = _i('SICR_MORTGAGE_DPD',    60)    # lower threshold for secured (collateral risk)
    STAGE_MIG_PROB  = _f('SICR_STAGE_MIG_PROB',  0.40) # model-based migration probability trigger

SICR = _SICR()


# ─── IFRS 9 ECL Parameters ────────────────────────────────────────────────────
# Parameters for the full PD × LGD × EAD ECL formula (IFRS 9 §5.5).
# Python mirror of config.ts ECL block — keep both in sync.
#
# Stage 1 (12-month ECL):    PD_12M      × LGD          ≈ 0.0222 × 0.45 = 1%
# Stage 2 (Lifetime ECL):    PD_LIFETIME × LGD          ≈ 0.1111 × 0.45 = 5%
# Stage 3 (Credit-impaired): PD_IMPAIRED × LGD_IMPAIRED = 1.00   × 0.20 = 20%
#
# Sources:
#   PD_12M / PD_LIFETIME: internal model calibration, risk-committee approved
#   LGD: Basel II/III unsecured retail (IRBA floor = 0.45)
#   LGD_IMPAIRED: collateral-adjusted LGD for Stage 3 secured assets (IFRS 9 §B5.5.17)
class _ECL:
    PD_12M       = _f('ECL_PD_12M',       0.0222)  # Stage 1 — 12-month PD
    PD_LIFETIME  = _f('ECL_PD_LIFETIME',  0.1111)  # Stage 2 — lifetime PD
    PD_IMPAIRED  = _f('ECL_PD_IMPAIRED',  1.0)     # Stage 3 — certain default
    LGD          = _f('ECL_LGD',          0.45)    # Loss Given Default, unsecured (Basel retail)
    LGD_IMPAIRED = _f('ECL_LGD_IMPAIRED', 0.20)    # Stage 3 collateral-adjusted LGD

    @property
    def rates(self) -> dict[int, float]:
        """Derived ECL flat rates per stage (PD × LGD). Use these for calculations."""
        return {
            1: round(self.PD_12M      * self.LGD,          6),
            2: round(self.PD_LIFETIME * self.LGD,          6),
            3: round(self.PD_IMPAIRED * self.LGD_IMPAIRED, 6),
        }

ECL = _ECL()

# ─── Stress Testing ───────────────────────────────────────────────────────────
# Source: Basel II/III unsecured retail LGD; scenario multipliers by risk committee
class _Stress:
    LGD                = _f('STRESS_LGD',               0.45)  # Loss Given Default — Basel unsecured
    ADVERSE_MULTIPLIER = _f('STRESS_ADVERSE_MULTIPLIER', 1.5)  # moderate downturn (GDP ~-2%)
    SEVERE_MULTIPLIER  = _f('STRESS_SEVERE_MULTIPLIER',  2.5)  # systemic crisis (GDP ~-5%+)

STRESS = _Stress()


# ─── Risk Flagging Thresholds ─────────────────────────────────────────────────
# Default arguments for flagging functions in flag_risks.py and calculations.py.
# Source: Internal credit policy
class _Flags:
    ZSCORE_THRESHOLD      = _f('FLAG_ZSCORE_THRESHOLD',     2.0)
    CONSECUTIVE_LATES     = _i('FLAG_CONSECUTIVE_LATES',    3)
    RATING_DETERIORATION  = _i('FLAG_RATING_DETERIORATION', 2)
    EXPOSURE_SPIKE_WINDOW = _i('FLAG_EXPOSURE_SPIKE_WINDOW', 30)
    EXPOSURE_SPIKE_PCT    = _f('FLAG_EXPOSURE_SPIKE_PCT',   20.0)
    MIN_OBSERVATIONS      = _i('FLAG_MIN_OBSERVATIONS',     4)

FLAGS = _Flags()


# ─── KPI Traffic-Light Thresholds ─────────────────────────────────────────────
# Source: Internal portfolio management policy
class _KPI:
    NPL_RED              = _f('KPI_NPL_RED',              5.0)
    NPL_AMBER            = _f('KPI_NPL_AMBER',            3.0)
    STAGE2_RED           = _f('KPI_STAGE2_RED',          15.0)
    STAGE2_AMBER         = _f('KPI_STAGE2_AMBER',         8.0)
    DELINQUENCY_RED      = _f('KPI_DELINQUENCY_RED',     10.0)
    PROVISION_ADEQUATE   = _f('KPI_PROVISION_ADEQUATE',  95.0)
    PROVISION_WARN       = _f('KPI_PROVISION_WARN',      80.0)
    CURE_RATE_WARN       = _f('KPI_CURE_RATE_WARN',      15.0)
    VINTAGE_DELINQUENCY_WARN = _f('KPI_VINTAGE_DELINQUENCY_WARN', 10.0)

KPI = _KPI()


# ─── Concentration Risk Limits ─────────────────────────────────────────────────
# Source: Basel III Article 395; EBA guidelines on concentration risk
class _Concentration:
    TOP1_OBLIGOR_WARN         = _f('CONC_TOP1_OBLIGOR_WARN',          10.0)
    TOP10_TOTAL_WARN          = _f('CONC_TOP10_TOTAL_WARN',           50.0)
    LARGE_EXPOSURE_MIN_PCT    = _f('CONC_LARGE_EXPOSURE_MIN_PCT',      2.0)
    LARGE_EXPOSURE_COUNT_WARN = _i('CONC_LARGE_EXPOSURE_COUNT_WARN',   5)
    HHI_CONCENTRATED          = _i('CONC_HHI_CONCENTRATED',         1500)

CONCENTRATION = _Concentration()
