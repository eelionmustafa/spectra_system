"""
SPECTRA -- Predict Pipeline
Scores all active clients using trained models, writes CSV snapshots, then
publishes the latest run into dbo.EWIPredictions when a DB connection exists.

Outputs: data/processed/predictions.csv
         data/processed/shap_explanations.csv

predictions.csv columns:
  clientID, prediction_date,
  pd_30d, pd_60d, pd_90d   - horizon-specific default probabilities
  pd_score                  - alias for pd_90d (backward compatibility)
  risk_label                - derived from pd_90d (primary horizon)
  stage_migration_prob, dpd_escalation_prob, recommended_action
"""
import hashlib
import json
import logging
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from config import pd_to_label

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("spectra.predict")

_SCRIPT_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPT_DIR.parent
_DATA_DIR = _PROJECT_ROOT / "data" / "processed"
_MODELS_DIR = _PROJECT_ROOT / "models"

ENSURE_EWI_PREDICTIONS = """
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'EWIPredictions' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[EWIPredictions] (
  id                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id            NVARCHAR(50)     NOT NULL,
  risk_score           FLOAT            NOT NULL,
  deterioration_risk   NVARCHAR(20)     NOT NULL,
  risk_label           NVARCHAR(32)     NULL,
  key_signals          NVARCHAR(MAX)    NULL,
  ai_reasoning         NVARCHAR(MAX)    NULL,
  exposure             FLOAT            NULL,
  pd_30d               FLOAT            NULL,
  pd_60d               FLOAT            NULL,
  pd_90d               FLOAT            NULL,
  stage_migration_prob FLOAT            NULL,
  dpd_escalation_prob  FLOAT            NULL,
  recommended_action   NVARCHAR(MAX)    NULL,
  top_factor_1         NVARCHAR(255)    NULL,
  top_factor_2         NVARCHAR(255)    NULL,
  top_factor_3         NVARCHAR(255)    NULL,
  shap_1               FLOAT            NULL,
  shap_2               FLOAT            NULL,
  shap_3               FLOAT            NULL,
  run_date             DATETIME         NOT NULL DEFAULT GETDATE()
)
"""

ENSURE_EWI_PREDICTION_COLUMNS = """
IF COL_LENGTH('dbo.EWIPredictions', 'risk_label') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD risk_label NVARCHAR(32) NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'exposure') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD exposure FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'pd_30d') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD pd_30d FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'pd_60d') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD pd_60d FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'pd_90d') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD pd_90d FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'stage_migration_prob') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD stage_migration_prob FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'dpd_escalation_prob') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD dpd_escalation_prob FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'recommended_action') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD recommended_action NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'top_factor_1') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD top_factor_1 NVARCHAR(255) NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'top_factor_2') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD top_factor_2 NVARCHAR(255) NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'top_factor_3') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD top_factor_3 NVARCHAR(255) NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'shap_1') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD shap_1 FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'shap_2') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD shap_2 FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'shap_3') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD shap_3 FLOAT NULL;
"""

ENSURE_EWI_INDEX = """
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_EWIPredictions_ClientID'
    AND object_id = OBJECT_ID('dbo.EWIPredictions')
)
CREATE NONCLUSTERED INDEX [IX_EWIPredictions_ClientID]
  ON [dbo].[EWIPredictions] (client_id)
  INCLUDE (risk_score, deterioration_risk, run_date)
"""

MERGE_EWI_PREDICTION = """
MERGE [dbo].[EWIPredictions] AS target
USING (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
  AS source (
    client_id, risk_score, deterioration_risk, risk_label, key_signals, ai_reasoning,
    exposure, pd_30d, pd_60d, pd_90d, stage_migration_prob, dpd_escalation_prob,
    recommended_action, top_factor_1, top_factor_2, top_factor_3, shap_1, shap_2, shap_3, run_date
  )
ON target.client_id = source.client_id
   AND CAST(target.run_date AS DATE) = CAST(source.run_date AS DATE)
WHEN MATCHED THEN
  UPDATE SET
    risk_score           = source.risk_score,
    deterioration_risk   = source.deterioration_risk,
    risk_label           = source.risk_label,
    key_signals          = source.key_signals,
    ai_reasoning         = source.ai_reasoning,
    exposure             = source.exposure,
    pd_30d               = source.pd_30d,
    pd_60d               = source.pd_60d,
    pd_90d               = source.pd_90d,
    stage_migration_prob = source.stage_migration_prob,
    dpd_escalation_prob  = source.dpd_escalation_prob,
    recommended_action   = source.recommended_action,
    top_factor_1         = source.top_factor_1,
    top_factor_2         = source.top_factor_2,
    top_factor_3         = source.top_factor_3,
    shap_1               = source.shap_1,
    shap_2               = source.shap_2,
    shap_3               = source.shap_3,
    run_date             = source.run_date
WHEN NOT MATCHED THEN
  INSERT (
    client_id, risk_score, deterioration_risk, risk_label, key_signals, ai_reasoning,
    exposure, pd_30d, pd_60d, pd_90d, stage_migration_prob, dpd_escalation_prob,
    recommended_action, top_factor_1, top_factor_2, top_factor_3, shap_1, shap_2, shap_3, run_date
  )
  VALUES (
    source.client_id, source.risk_score, source.deterioration_risk, source.risk_label,
    source.key_signals, source.ai_reasoning, source.exposure, source.pd_30d, source.pd_60d,
    source.pd_90d, source.stage_migration_prob, source.dpd_escalation_prob,
    source.recommended_action, source.top_factor_1, source.top_factor_2, source.top_factor_3,
    source.shap_1, source.shap_2, source.shap_3, source.run_date
  );
"""


def _load_model(name, *, required=False):
    path = _MODELS_DIR / (name + ".pkl")
    if not path.exists():
        if required:
            raise FileNotFoundError(
                f"Model file not found: {path}. Run train_model.py first."
            )
        log.warning("Model not found: %s", path)
        return None
    return joblib.load(path)


def _validate_feature_hash(bundle, name: str) -> None:
    """Raise when a bundle hash is inconsistent with its feature columns."""
    if bundle is None:
        return
    stored_hash = bundle.get("feature_hash")
    if stored_hash is None:
        log.warning(
            "[%s] No feature_hash in bundle; model may have been trained with an older pipeline version.",
            name,
        )
        return
    computed = hashlib.md5(",".join(sorted(bundle["feature_cols"])).encode()).hexdigest()
    if computed != stored_hash:
        raise ValueError(
            f"[{name}] feature_hash mismatch: bundle reports {stored_hash!r} but "
            f"recomputed {computed!r}. Delete the .pkl file and retrain."
        )


def _predict_proba(bundle, frame):
    if bundle is None:
        return np.zeros(len(frame))
    model = bundle["model"]
    scaler = bundle["scaler"]
    feat = bundle["feature_cols"]
    x_sub = frame.reindex(columns=feat, fill_value=0)
    missing_cols = [col for col in feat if col not in frame.columns]
    if missing_cols:
        import warnings as _warnings

        _warnings.warn(
            f"[SPECTRA] Missing features in prediction data, zero-filled: {missing_cols}"
        )
    if scaler is not None:
        x_sub = pd.DataFrame(scaler.transform(x_sub), columns=feat, index=x_sub.index)
    return model.predict_proba(x_sub)[:, 1]


def _ensure_publish_columns(frame: pd.DataFrame) -> pd.DataFrame:
    published = frame.copy()
    defaults = {
        "top_factor_1": None,
        "top_factor_2": None,
        "top_factor_3": None,
        "shap_1": np.nan,
        "shap_2": np.nan,
        "shap_3": np.nan,
        "pd_30d": np.nan,
        "pd_60d": np.nan,
        "pd_90d": np.nan,
        "pd_score": np.nan,
        "risk_label": None,
        "recommended_action": None,
        "stage_migration_prob": np.nan,
        "dpd_escalation_prob": np.nan,
        "prediction_date": None,
        "totalExposure": np.nan,
        "exposure": np.nan,
    }
    for column, default in defaults.items():
        if column not in published.columns:
            published[column] = default
    return published


def _coerce_float(value):
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except TypeError:
        pass
    return float(value)


def _coerce_text(value):
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except TypeError:
        pass
    text = str(value).strip()
    return text or None


def _normalize_deterioration_risk(risk_label):
    if risk_label in {"High", "Medium", "Low"}:
        return risk_label
    return "Critical"


def _format_driver_signal(factor_name, shap_value):
    factor = _coerce_text(factor_name)
    if factor is None:
        return None
    clean = factor.replace("_", " ")
    clean = clean[:1].upper() + clean[1:] if clean else factor
    direction = "pressure" if shap_value is None or shap_value >= 0 else "support"
    return f"{clean} ({direction})"


def _build_key_signals(row):
    signals = []
    for factor_col, shap_col in [
        ("top_factor_1", "shap_1"),
        ("top_factor_2", "shap_2"),
        ("top_factor_3", "shap_3"),
    ]:
        signal = _format_driver_signal(row.get(factor_col), _coerce_float(row.get(shap_col)))
        if signal and signal not in signals:
            signals.append(signal)
    return signals


def _build_ai_reasoning(row, signals):
    label = _coerce_text(row.get("risk_label")) or "Low"
    pd_90 = _coerce_float(row.get("pd_90d"))
    if pd_90 is None:
        pd_90 = _coerce_float(row.get("pd_score")) or 0.0
    action = _coerce_text(row.get("recommended_action")) or "Manual review required"

    parts = [
        f"{label} risk on the 90-day horizon ({pd_90:.1%} PD).",
        f"Recommended action: {action}.",
    ]

    stage_prob = _coerce_float(row.get("stage_migration_prob"))
    if stage_prob is not None:
        parts.append(f"Stage migration probability: {stage_prob:.1%}.")

    dpd_prob = _coerce_float(row.get("dpd_escalation_prob"))
    if dpd_prob is not None:
        parts.append(f"DPD escalation probability: {dpd_prob:.1%}.")

    if signals:
        parts.append("Top drivers: " + ", ".join(signals[:3]) + ".")

    return " ".join(parts)


def _parse_run_date(raw_value):
    text = _coerce_text(raw_value)
    if not text:
        return date.today()
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return date.today()


def publish_predictions_to_db(preds: pd.DataFrame, shap_df: pd.DataFrame | None = None) -> bool:
    if preds.empty:
        log.info("DB publish skipped because no predictions were generated.")
        return False

    published = preds.copy()
    if shap_df is not None and not shap_df.empty:
        published = published.merge(shap_df, on="clientID", how="left")
    published = _ensure_publish_columns(published)

    rows = []
    for _, row in published.iterrows():
        risk_score = _coerce_float(row.get("pd_90d"))
        if risk_score is None:
            risk_score = _coerce_float(row.get("pd_score")) or 0.0

        exposure = _coerce_float(row.get("totalExposure"))
        if exposure is None:
            exposure = _coerce_float(row.get("exposure"))

        signals = _build_key_signals(row)
        rows.append(
            (
                _coerce_text(row.get("clientID")) or "",
                risk_score,
                _normalize_deterioration_risk(_coerce_text(row.get("risk_label"))),
                _coerce_text(row.get("risk_label")),
                json.dumps(signals),
                _build_ai_reasoning(row, signals),
                exposure,
                _coerce_float(row.get("pd_30d")),
                _coerce_float(row.get("pd_60d")),
                _coerce_float(row.get("pd_90d")),
                _coerce_float(row.get("stage_migration_prob")),
                _coerce_float(row.get("dpd_escalation_prob")),
                _coerce_text(row.get("recommended_action")),
                _coerce_text(row.get("top_factor_1")),
                _coerce_text(row.get("top_factor_2")),
                _coerce_text(row.get("top_factor_3")),
                _coerce_float(row.get("shap_1")),
                _coerce_float(row.get("shap_2")),
                _coerce_float(row.get("shap_3")),
                _parse_run_date(row.get("prediction_date")),
            )
        )

    try:
        from db_connect import get_conn  # noqa: PLC0415
    except Exception as exc:
        log.warning("Prediction DB publish skipped; DB connector unavailable: %s", exc)
        return False

    try:
        conn = get_conn()
    except Exception as exc:
        log.warning("Prediction DB publish skipped; DB connection failed: %s", exc)
        return False

    try:
        cursor = conn.cursor()
        cursor.execute(ENSURE_EWI_PREDICTIONS)
        cursor.execute(ENSURE_EWI_PREDICTION_COLUMNS)
        try:
            cursor.execute(ENSURE_EWI_INDEX)
        except Exception:
            log.debug("EWIPredictions index ensure skipped.", exc_info=True)

        for params in rows:
            cursor.execute(MERGE_EWI_PREDICTION, params)

        conn.commit()
        log.info("Published %d predictions to dbo.EWIPredictions", len(rows))
        return True
    except Exception as exc:
        try:
            conn.rollback()
        except Exception:
            pass
        log.warning("Prediction DB publish skipped after scoring: %s", exc)
        return False
    finally:
        conn.close()


def predict() -> pd.DataFrame:
    log.info("Loading features...")
    features = pd.read_parquet(_DATA_DIR / "features.parquet")
    frame = features.select_dtypes(include=[np.number]).fillna(0)

    log.info("Loading models...")
    m_def30 = _load_model("model_default_30d", required=True)
    m_def60 = _load_model("model_default_60d", required=True)
    m_def90 = _load_model("model_default_90d", required=True)
    m_mig = _load_model("model_stage_migration")
    m_dpd = _load_model("model_dpd_escalation")

    log.info("Validating feature hashes...")
    for bundle, name in [
        (m_def30, "model_default_30d"),
        (m_def60, "model_default_60d"),
        (m_def90, "model_default_90d"),
        (m_mig, "model_stage_migration"),
        (m_dpd, "model_dpd_escalation"),
    ]:
        _validate_feature_hash(bundle, name)

    log.info("Scoring %d clients across 3 horizons (30d, 60d, 90d)...", len(frame))
    pd_30_scores = _predict_proba(m_def30, frame)
    pd_60_scores = _predict_proba(m_def60, frame)
    pd_90_scores = _predict_proba(m_def90, frame)
    mig_proba = _predict_proba(m_mig, frame)
    dpd_proba = _predict_proba(m_dpd, frame)

    results = []
    today = str(date.today())
    for i, client_id in enumerate(features.index):
        pd_30 = round(float(pd_30_scores[i]), 4)
        pd_60 = round(float(pd_60_scores[i]), 4)
        pd_90 = round(float(pd_90_scores[i]), 4)
        risk_label, recommended_action = pd_to_label(pd_90)
        results.append(
            {
                "clientID": str(client_id),
                "prediction_date": today,
                "pd_30d": pd_30,
                "pd_60d": pd_60,
                "pd_90d": pd_90,
                "pd_score": pd_90,
                "risk_label": risk_label,
                "stage_migration_prob": round(float(mig_proba[i]), 4),
                "dpd_escalation_prob": round(float(dpd_proba[i]), 4),
                "recommended_action": recommended_action,
            }
        )

    df = pd.DataFrame(results)
    out = _DATA_DIR / "predictions.csv"
    df.to_csv(out, index=False)
    log.info("Predictions saved to %s (%d clients)", out, len(df))

    log.info(
        "Avg PD - 30d: %.3f  60d: %.3f  90d: %.3f",
        df["pd_30d"].mean(),
        df["pd_60d"].mean(),
        df["pd_90d"].mean(),
    )
    log.info("Risk label distribution (90d):\n%s", df["risk_label"].value_counts().to_string())
    return df


if __name__ == "__main__":
    preds = predict()
    print("Predictions shape:", preds.shape)
    print(preds[["risk_label", "recommended_action"]].value_counts().head(10))

    shap_df = None
    try:
        from explain import explain_all  # noqa: PLC0415

        log.info("Running SHAP explanations...")
        shap_df = explain_all()
        print("SHAP explanations shape:", shap_df.shape)
    except ImportError as exc:
        log.warning(
            "SHAP explanations skipped; explain.py not found or dependency missing: %s",
            exc,
        )
    except Exception as exc:
        log.warning("SHAP explanations failed: %s", exc)

    publish_predictions_to_db(preds, shap_df)
