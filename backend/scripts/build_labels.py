"""
SPECTRA -- Build Labels Pipeline
Builds 5 prediction targets from consecutive RiskPortfolio snapshots.

Targets:
  label_default_30d  — reaches Stage 3 within the NEXT snapshot (≈30 days)
  label_default_60d  — reaches Stage 3 within the next 2 snapshots (≈60 days)
  label_default_90d  — reaches Stage 3 within the next 3 snapshots (≈90 days)
  label_stage_migration — stage increases in next snapshot
  label_dpd_escalation  — DPD crosses 30 next observation

Outputs: data/processed/labels.parquet
"""
import logging
from pathlib import Path
import pandas as pd
from db_connect import get_conn, _PROJECT_ROOT, _DB_SERVER, _DB_NAME

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("spectra.build_labels")

_OUTPUT = _PROJECT_ROOT / "data" / "processed" / "labels.parquet"
_OUTPUT.parent.mkdir(parents=True, exist_ok=True)


def _get_conn():
    return get_conn()


# ---------- Target 1: label_stage_migration (Stage increases next snapshot) ---

_SQL_STAGE_MIG = """
WITH ordered AS (
    SELECT clientID, Stage, CalculationDate,
        LAG(Stage) OVER (PARTITION BY clientID ORDER BY CalculationDate) AS prev_stage,
        LAG(CalculationDate) OVER (PARTITION BY clientID ORDER BY CalculationDate) AS prev_date
    FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
)
SELECT clientID,
    MAX(CASE WHEN Stage > prev_stage AND DATEDIFF(day, prev_date, CalculationDate) <= 40 THEN 1 ELSE 0 END) AS label_stage_migration
FROM ordered
WHERE prev_stage IS NOT NULL
GROUP BY clientID
"""

# ---------- Target 2a: label_default_30d (Stage 3 within NEXT snapshot ≈30d) --

_SQL_DEFAULT_30D = """
WITH ordered AS (
    SELECT clientID, Stage, CalculationDate,
        ROW_NUMBER() OVER (PARTITION BY clientID ORDER BY CalculationDate) AS rn
    FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
),
future_stage AS (
    SELECT o1.clientID,
        MAX(CASE
            WHEN o2.Stage = 3
             AND o2.rn = o1.rn + 1
             AND DATEDIFF(day, o1.CalculationDate, o2.CalculationDate) <= 40
            THEN 1 ELSE 0
        END) AS label_default_30d
    FROM ordered o1
    LEFT JOIN ordered o2 ON o2.clientID = o1.clientID
    GROUP BY o1.clientID
)
SELECT DISTINCT fs.clientID, fs.label_default_30d
FROM future_stage fs
"""

# ---------- Target 2b: label_default_60d (Stage 3 within next 2 snapshots ≈60d)

_SQL_DEFAULT_60D = """
WITH ordered AS (
    SELECT clientID, Stage, CalculationDate,
        ROW_NUMBER() OVER (PARTITION BY clientID ORDER BY CalculationDate) AS rn
    FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
),
future_stage AS (
    SELECT o1.clientID,
        MAX(CASE
            WHEN o2.Stage = 3
             AND o2.rn BETWEEN o1.rn + 1 AND o1.rn + 2
             AND DATEDIFF(day, o1.CalculationDate, o2.CalculationDate) <= 65
            THEN 1 ELSE 0
        END) AS label_default_60d
    FROM ordered o1
    LEFT JOIN ordered o2 ON o2.clientID = o1.clientID
    GROUP BY o1.clientID
)
SELECT DISTINCT fs.clientID, fs.label_default_60d
FROM future_stage fs
"""

# ---------- Target 2c: label_default_90d (reaches Stage 3 within 3 snapshots) -

_SQL_DEFAULT_90D = """
WITH ordered AS (
    SELECT clientID, Stage, CalculationDate,
        ROW_NUMBER() OVER (PARTITION BY clientID ORDER BY CalculationDate) AS rn
    FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
),
future_stage AS (
    SELECT o1.clientID,
        MAX(CASE WHEN o2.Stage = 3 AND o2.rn BETWEEN o1.rn+1 AND o1.rn+3 THEN 1 ELSE 0 END) AS label_default_90d
    FROM ordered o1
    LEFT JOIN ordered o2 ON o2.clientID = o1.clientID
    GROUP BY o1.clientID
)
SELECT DISTINCT fs.clientID, fs.label_default_90d
FROM future_stage fs
"""

# ---------- Target 3: label_dpd_escalation (DPD crosses 30 next month) --------

_SQL_DPD_ESC = """
WITH dpd_ordered AS (
    SELECT
        c.PersonalID AS clientID,
        d.DueDays,
        d.dateID,
        LAG(d.DueDays) OVER (PARTITION BY c.PersonalID ORDER BY d.dateID) AS prev_dpd
    FROM [SPECTRA].[dbo].[DueDaysDaily] d WITH (NOLOCK)
    JOIN [SPECTRA].[dbo].[Credits] c WITH (NOLOCK) ON d.CreditAccount=c.CreditAccount
)
SELECT clientID,
    MAX(CASE WHEN DueDays >= 30 AND prev_dpd < 30 THEN 1 ELSE 0 END) AS label_dpd_escalation
FROM dpd_ordered
WHERE prev_dpd IS NOT NULL
GROUP BY clientID
"""


def build_labels() -> pd.DataFrame:
    log.info("Connecting to %s / %s", _DB_SERVER, _DB_NAME)
    conn = _get_conn()
    try:
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            log.info("Building label_stage_migration...")
            mig   = pd.read_sql(_SQL_STAGE_MIG,    conn)
            log.info("Building label_default_30d...")
            def30 = pd.read_sql(_SQL_DEFAULT_30D,   conn)
            log.info("Building label_default_60d...")
            def60 = pd.read_sql(_SQL_DEFAULT_60D,   conn)
            log.info("Building label_default_90d...")
            def90 = pd.read_sql(_SQL_DEFAULT_90D,   conn)
            log.info("Building label_dpd_escalation...")
            dpd   = pd.read_sql(_SQL_DPD_ESC,       conn)
    finally:
        conn.close()

    log.info("Label counts -- mig:%d def30:%d def60:%d def90:%d dpd:%d",
             len(mig), len(def30), len(def60), len(def90), len(dpd))

    df = mig.merge(def30, on="clientID", how="outer")
    df = df.merge(def60, on="clientID", how="outer")
    df = df.merge(def90, on="clientID", how="outer")
    df = df.merge(dpd,   on="clientID", how="outer")
    df = df.fillna(0)
    df["label_stage_migration"] = df["label_stage_migration"].astype(int)
    df["label_default_30d"]     = df["label_default_30d"].astype(int)
    df["label_default_60d"]     = df["label_default_60d"].astype(int)
    df["label_default_90d"]     = df["label_default_90d"].astype(int)
    df["label_dpd_escalation"]  = df["label_dpd_escalation"].astype(int)

    log.info("Labels built: %d clients", len(df))
    log.info("Stage migration rate: %.1f%%", df["label_stage_migration"].mean()*100)
    log.info("Default 30d rate:     %.1f%%", df["label_default_30d"].mean()*100)
    log.info("Default 60d rate:     %.1f%%", df["label_default_60d"].mean()*100)
    log.info("Default 90d rate:     %.1f%%", df["label_default_90d"].mean()*100)
    log.info("DPD escalation rate:  %.1f%%", df["label_dpd_escalation"].mean()*100)

    df.to_parquet(_OUTPUT, index=False)
    log.info("Saved to %s", _OUTPUT)
    return df


if __name__ == "__main__":
    labels = build_labels()
    print("Labels shape:", labels.shape)
    print(labels.value_counts(["label_stage_migration","label_default_30d",
                                "label_default_60d","label_default_90d","label_dpd_escalation"]))
