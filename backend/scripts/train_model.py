"""
SPECTRA -- Train Model Pipeline
Trains and evaluates 3 classification models per target, saves best by AUC.

Targets:
  model_default_30d.pkl     — 30-day default horizon (Stage 3 within ~1 snapshot)
  model_default_60d.pkl     — 60-day default horizon (Stage 3 within ~2 snapshots)
  model_default_90d.pkl     — 90-day default horizon (Stage 3 within ~3 snapshots)
  model_stage_migration.pkl — stage increase next snapshot
  model_dpd_escalation.pkl  — DPD crosses 30 next observation

Outputs: models/model_*.pkl, models/training_meta.json
"""
import json, logging, os
from datetime import datetime
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, classification_report
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler
import joblib

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("spectra.train_model")

_SCRIPT_DIR   = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPT_DIR.parent
_DATA_DIR     = _PROJECT_ROOT / "data" / "processed"
_MODELS_DIR   = _PROJECT_ROOT / "models"
_MODELS_DIR.mkdir(parents=True, exist_ok=True)

TARGETS = [
    "label_stage_migration",
    "label_default_30d",
    "label_default_60d",
    "label_default_90d",
    "label_dpd_escalation",
]
MODEL_NAMES = {
    "label_stage_migration": "model_stage_migration",
    "label_default_30d":     "model_default_30d",
    "label_default_60d":     "model_default_60d",
    "label_default_90d":     "model_default_90d",
    "label_dpd_escalation":  "model_dpd_escalation",
}

# These DPD aggregate columns span full history and directly encode label_dpd_escalation
# (e.g. DueTotal >= 30 ⟺ label = 1). Exclude them from that target to prevent leakage.
_DPD_LEAKY_COLS = {"DueDays", "DueMax6M", "DueMax1Y", "DueMax2Y", "DueTotal"}


def _load_data():
    log.info("Loading features.parquet...")
    features = pd.read_parquet(_DATA_DIR / "features.parquet")
    log.info("Loading labels.parquet...")
    labels = pd.read_parquet(_DATA_DIR / "labels.parquet")
    df = features.reset_index().merge(labels, on="clientID", how="inner")
    log.info("Merged dataset: %d rows, %d columns", len(df), df.shape[1])
    return df


def _train_target(df, target):
    log.info("=== Training models for target: %s ===", target)
    exclude = set(["clientID"] + TARGETS)
    if target == "label_dpd_escalation":
        exclude |= _DPD_LEAKY_COLS
    feature_cols = [c for c in df.columns if c not in exclude]
    X = df[feature_cols].select_dtypes(include=[np.number]).fillna(0)
    y = df[target].astype(int)

    pos_rate = y.mean()
    log.info("Positive rate for %s: %.2f%%", target, pos_rate * 100)

    if pos_rate < 0.01:
        log.warning("Skipping %s — positive rate %.3f%% is too low to train a reliable model "
                    "(need at least 1%%). Label has only %d positive cases.",
                    target, pos_rate * 100, int(y.sum()))
        return {"target": target, "best_model": None, "auc": None, "cv_auc": None,
                "feature_cols": list(X.columns), "all_results": {},
                "skipped": True, "skip_reason": f"positive_rate={pos_rate:.4f}"}

    try:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    except ValueError:
        log.warning("Stratified split failed for %s (rare class) — falling back to random split", target)
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    scaler = StandardScaler()
    X_train_s = pd.DataFrame(scaler.fit_transform(X_train), columns=X_train.columns, index=X_train.index)
    X_test_s  = pd.DataFrame(scaler.transform(X_test),      columns=X_test.columns,  index=X_test.index)

    candidates = {
        "GradientBoosting": GradientBoostingClassifier(n_estimators=200, max_depth=4, learning_rate=0.05,
            subsample=0.8, random_state=42),
        "RandomForest":     RandomForestClassifier(n_estimators=200, max_depth=6, random_state=42,
            class_weight="balanced", n_jobs=-1),
        "LogisticRegression": LogisticRegression(max_iter=500, class_weight="balanced",
            random_state=42, C=0.1),
    }

    results = {}
    for name, model in candidates.items():
        log.info("  Training %s...", name)
        if name == "LogisticRegression":
            cv_scores = cross_val_score(model, X_train_s, y_train, cv=5, scoring="roc_auc", error_score=0.0)
            model.fit(X_train_s, y_train)
            proba = model.predict_proba(X_test_s)[:, 1]
        else:
            cv_scores = cross_val_score(model, X_train, y_train, cv=5, scoring="roc_auc", error_score=0.0)
            model.fit(X_train, y_train)
            proba = model.predict_proba(X_test)[:, 1]

        auc = roc_auc_score(y_test, proba)
        cv_mean = cv_scores.mean()
        log.info("  %s -> AUC=%.4f  CV-AUC=%.4f (+/-%.4f)", name, auc, cv_mean, cv_scores.std())
        results[name] = {"model": model, "auc": auc, "cv_auc": cv_mean,
                         "scaler": scaler if name == "LogisticRegression" else None,
                         "feature_cols": list(X.columns)}

    best_name = max(results, key=lambda k: results[k]["auc"])
    best = results[best_name]
    log.info("  Best model for %s: %s (AUC=%.4f)", target, best_name, best["auc"])

    if best["auc"] < 0.70:
        log.warning("  WARNING: AUC %.4f < 0.70 target for %s", best["auc"], target)

    model_path = _MODELS_DIR / (MODEL_NAMES[target] + ".pkl")
    joblib.dump({"model": best["model"], "scaler": best["scaler"],
                 "feature_cols": best["feature_cols"], "model_name": best_name,
                 "auc": best["auc"]}, model_path)
    log.info("  Saved to %s", model_path)

    return {"target": target, "best_model": best_name, "auc": best["auc"],
            "cv_auc": best["cv_auc"], "feature_cols": best["feature_cols"],
            "all_results": {k: {"auc": v["auc"], "cv_auc": v["cv_auc"]} for k, v in results.items()}}


def train_all():
    df = _load_data()
    meta = {"training_date": datetime.now().isoformat(), "targets": {}}
    for target in TARGETS:
        result = _train_target(df, target)
        meta["targets"][target] = result
    meta_path = _MODELS_DIR / "training_meta.json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    log.info("Training metadata saved to %s", meta_path)
    return meta


if __name__ == "__main__":
    m = train_all()
    for t, r in m["targets"].items():
        if r.get("skipped"):
            print(f"{t}: SKIPPED ({r['skip_reason']})")
        else:
            print(f"{t}: {r['best_model']} AUC={r['auc']:.4f}")
