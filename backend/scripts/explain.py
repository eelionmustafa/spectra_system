"""
SPECTRA -- SHAP Explanation Pipeline
Computes SHAP values for the default_90d model and exports top-3 factors per client.
Outputs: data/processed/shap_explanations.csv
"""
import logging, os
from pathlib import Path
import numpy as np, pandas as pd
import joblib, shap

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("spectra.explain")

_SCRIPT_DIR   = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPT_DIR.parent
_DATA_DIR     = _PROJECT_ROOT / "data" / "processed"
_MODELS_DIR   = _PROJECT_ROOT / "models"


def _load_bundle():
    path = _MODELS_DIR / "model_default_90d.pkl"
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {path}")
    return joblib.load(path)


def _get_explainer(bundle, X_sample):
    model = bundle["model"]
    model_type = type(model).__name__
    log.info("Creating SHAP explainer for %s", model_type)
    if hasattr(model, "estimators_"):
        # Tree-based: GradientBoosting or RandomForest
        return shap.TreeExplainer(model)
    else:
        # LogisticRegression
        masker = shap.maskers.Independent(X_sample, max_samples=100)
        return shap.LinearExplainer(model, masker)


def explain_all() -> pd.DataFrame:
    log.info("Loading features...")
    features = pd.read_parquet(_DATA_DIR / "features.parquet")
    bundle = _load_bundle()
    feat_cols = bundle["feature_cols"]
    X = features.reindex(columns=feat_cols, fill_value=0)

    scaler = bundle.get("scaler")
    if scaler is not None:
        X_arr = pd.DataFrame(scaler.transform(X), columns=feat_cols, index=X.index)
    else:
        X_arr = X

    explainer = _get_explainer(bundle, X_arr.head(100))
    log.info("Computing SHAP values for %d clients...", len(X_arr))
    shap_values = explainer.shap_values(X_arr)

    # For binary classifiers, shap_values may be list of 2 arrays
    if isinstance(shap_values, list):
        shap_values = shap_values[1]

    shap_df = pd.DataFrame(shap_values, columns=feat_cols, index=features.index)

    # Global importance
    global_imp = shap_df.abs().mean().sort_values(ascending=False)
    log.info("Global feature importance (mean |SHAP|):\n%s", global_imp.head(10).to_string())

    # Per-client top 3
    records = []
    for client_id, row in shap_df.iterrows():
        abs_row = row.abs().sort_values(ascending=False)
        top3 = abs_row.head(3)
        records.append({
            "clientID":   str(client_id),
            "top_factor_1": top3.index[0] if len(top3) > 0 else "",
            "top_factor_2": top3.index[1] if len(top3) > 1 else "",
            "top_factor_3": top3.index[2] if len(top3) > 2 else "",
            "shap_1": round(float(row[top3.index[0]]), 4) if len(top3) > 0 else 0.0,
            "shap_2": round(float(row[top3.index[1]]), 4) if len(top3) > 1 else 0.0,
            "shap_3": round(float(row[top3.index[2]]), 4) if len(top3) > 2 else 0.0,
        })

    out_df = pd.DataFrame(records)
    out = _DATA_DIR / "shap_explanations.csv"
    out_df.to_csv(out, index=False)
    log.info("SHAP explanations saved to %s (%d clients)", out, len(out_df))
    return out_df


def explain_client(client_id: str) -> dict:
    log.info("Explaining client: %s", client_id)
    features = pd.read_parquet(_DATA_DIR / "features.parquet")
    if client_id not in features.index:
        raise KeyError(f"Client {client_id} not found in features")
    bundle = _load_bundle()
    feat_cols = bundle["feature_cols"]
    X = features.reindex(columns=feat_cols, fill_value=0)
    scaler = bundle.get("scaler")
    if scaler is not None:
        X = pd.DataFrame(scaler.transform(X), columns=feat_cols, index=X.index)
    row_X = X.loc[[client_id]]
    explainer = _get_explainer(bundle, X.head(100))
    shap_vals = explainer.shap_values(row_X)
    if isinstance(shap_vals, list):
        shap_vals = shap_vals[1]
    sv = pd.Series(shap_vals[0], index=feat_cols)
    top3 = sv.abs().sort_values(ascending=False).head(3)
    result = {"clientID": client_id, "top_factors": []}
    for feat in top3.index:
        result["top_factors"].append({"feature": feat, "shap_value": round(float(sv[feat]), 4)})
    log.info("Client %s top factors: %s", client_id, result["top_factors"])
    return result


if __name__ == "__main__":
    df = explain_all()
    print("SHAP explanations shape:", df.shape)
    print(df.head())
