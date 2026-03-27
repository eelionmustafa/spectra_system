"""
SPECTRA -- Predict Pipeline
Scores all active clients using trained models, then runs SHAP explanations.

Outputs: data/processed/predictions.csv
         data/processed/shap_explanations.csv

predictions.csv columns:
  clientID, prediction_date,
  pd_30d, pd_60d, pd_90d   — horizon-specific default probabilities (from separate models)
  pd_score                  — alias for pd_90d (backward compatibility)
  risk_label                — derived from pd_90d (primary horizon for portfolio management)
  stage_migration_prob, dpd_escalation_prob, recommended_action
"""
import logging
from datetime import date
from pathlib import Path
import numpy as np, pandas as pd
import joblib

from config import pd_to_label

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("spectra.predict")

_SCRIPT_DIR   = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPT_DIR.parent
_DATA_DIR     = _PROJECT_ROOT / "data" / "processed"
_MODELS_DIR   = _PROJECT_ROOT / "models"


def _load_model(name):
    path = _MODELS_DIR / (name + ".pkl")
    if not path.exists():
        log.warning("Model not found: %s", path)
        return None
    return joblib.load(path)


def _predict_proba(bundle, X):
    if bundle is None:
        return np.zeros(len(X))
    model = bundle["model"]
    scaler = bundle["scaler"]
    feat = bundle["feature_cols"]
    x_sub = X.reindex(columns=feat, fill_value=0)
    if scaler is not None:
        x_sub = pd.DataFrame(scaler.transform(x_sub), columns=feat, index=x_sub.index)
    return model.predict_proba(x_sub)[:, 1]




def predict() -> pd.DataFrame:
    log.info("Loading features...")
    features = pd.read_parquet(_DATA_DIR / "features.parquet")
    X = features.select_dtypes(include=[np.number]).fillna(0)

    log.info("Loading models...")
    m_def30 = _load_model("model_default_30d")
    m_def60 = _load_model("model_default_60d")
    m_def90 = _load_model("model_default_90d")
    m_mig   = _load_model("model_stage_migration")
    m_dpd   = _load_model("model_dpd_escalation")

    log.info("Scoring %d clients across 3 horizons (30d, 60d, 90d)...", len(X))
    pd_30_scores = _predict_proba(m_def30, X)
    pd_60_scores = _predict_proba(m_def60, X)
    pd_90_scores = _predict_proba(m_def90, X)
    mig_proba    = _predict_proba(m_mig,   X)
    dpd_proba    = _predict_proba(m_dpd,   X)

    results = []
    today = str(date.today())
    for i, client_id in enumerate(features.index):
        pd_30 = round(float(pd_30_scores[i]), 4)
        pd_60 = round(float(pd_60_scores[i]), 4)
        pd_90 = round(float(pd_90_scores[i]), 4)
        # risk_label and recommended_action use pd_90d as the primary management horizon
        risk_label, recommended_action = pd_to_label(pd_90)
        results.append({
            "clientID":             str(client_id),
            "prediction_date":      today,
            "pd_30d":               pd_30,
            "pd_60d":               pd_60,
            "pd_90d":               pd_90,
            "pd_score":             pd_90,   # backward-compatible alias
            "risk_label":           risk_label,
            "stage_migration_prob": round(float(mig_proba[i]), 4),
            "dpd_escalation_prob":  round(float(dpd_proba[i]), 4),
            "recommended_action":   recommended_action,
        })

    df = pd.DataFrame(results)
    out = _DATA_DIR / "predictions.csv"
    df.to_csv(out, index=False)
    log.info("Predictions saved to %s (%d clients)", out, len(df))

    log.info("Avg PD — 30d: %.3f  60d: %.3f  90d: %.3f",
             df["pd_30d"].mean(), df["pd_60d"].mean(), df["pd_90d"].mean())
    log.info("Risk label distribution (90d):\n%s", df["risk_label"].value_counts().to_string())
    return df


if __name__ == "__main__":
    preds = predict()
    print("Predictions shape:", preds.shape)
    print(preds[["risk_label","recommended_action"]].value_counts().head(10))

    # Auto-run SHAP explanations immediately after scoring
    try:
        from explain import explain_all
        log.info("Running SHAP explanations...")
        shap_df = explain_all()
        print("SHAP explanations shape:", shap_df.shape)
    except Exception as e:
        log.warning("SHAP explanations skipped: %s", e)
