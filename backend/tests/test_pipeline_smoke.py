"""
Smoke tests for the SPECTRA ML pipeline end-to-end (no DB required).
Synthetic data → train_model → predict → verify outputs.
"""
import json
import pytest
import numpy as np
import pandas as pd
from pathlib import Path
from unittest.mock import patch

import train_model
import predict


# ─── Fixtures ─────────────────────────────────────────────────────────────────

N = 200  # small enough to be fast, large enough for stratified CV

CLIENT_IDS = [f"C{i:04d}" for i in range(N)]

FEATURE_COLS = [
    "rating_deterioration", "stage_age_months", "exposure_growth_rate",
    "dpd_trend", "repayment_rate_avg", "repayment_rate_min",
    "missed_payment_count", "missed_payment_ratio", "consecutive_lates",
    "card_spend_last30d", "card_spend_mom_growth",
]


@pytest.fixture(scope="module")
def tmp_dirs(tmp_path_factory):
    root = tmp_path_factory.mktemp("pipeline")
    data_dir = root / "data" / "processed"
    data_dir.mkdir(parents=True)
    models_dir = root / "models"
    models_dir.mkdir()
    return data_dir, models_dir


@pytest.fixture(scope="module")
def synthetic_data(tmp_dirs):
    """Write features.parquet + labels.parquet with sufficient positive rates."""
    data_dir, _ = tmp_dirs
    rng = np.random.default_rng(42)

    features = pd.DataFrame({
        "rating_deterioration":  rng.integers(0, 2, N),
        "stage_age_months":      rng.uniform(0, 24, N),
        "exposure_growth_rate":  rng.uniform(-5, 20, N),
        "dpd_trend":             rng.uniform(-2, 2, N),
        "repayment_rate_avg":    rng.uniform(0, 1, N),
        "repayment_rate_min":    rng.uniform(0, 1, N),
        "missed_payment_count":  rng.integers(0, 5, N),
        "missed_payment_ratio":  rng.uniform(0, 0.5, N),
        "consecutive_lates":     rng.integers(0, 4, N),
        "card_spend_last30d":    rng.uniform(0, 5000, N),
        "card_spend_mom_growth": rng.uniform(-10, 50, N),
    }, index=pd.Index(CLIENT_IDS, name="clientID"))

    default_30 = (rng.random(N) < 0.05).astype(int)
    default_60 = np.maximum(default_30, (rng.random(N) < 0.08).astype(int))
    default_90 = np.maximum(default_60, (rng.random(N) < 0.10).astype(int))

    # Positive rates stay above the 1% training threshold and preserve horizon nesting.
    labels = pd.DataFrame({
        "clientID":              CLIENT_IDS,
        "label_stage_migration": (rng.random(N) < 0.15).astype(int),
        "label_default_30d":     default_30,
        "label_default_60d":     default_60,
        "label_default_90d":     default_90,
        "label_dpd_escalation":  (rng.random(N) < 0.05).astype(int),
    })

    features.to_parquet(data_dir / "features.parquet", index=True)
    labels.to_parquet(data_dir / "labels.parquet", index=False)
    return data_dir


@pytest.fixture(scope="module")
def trained_meta(synthetic_data, tmp_dirs):
    """Run train_all() once and return the metadata dict."""
    data_dir, models_dir = tmp_dirs
    with patch.object(train_model, "_DATA_DIR", data_dir), \
         patch.object(train_model, "_MODELS_DIR", models_dir):
        return train_model.train_all()


# ─── Train tests ──────────────────────────────────────────────────────────────

class TestTrainModel:
    def test_at_least_two_targets_trained(self, trained_meta):
        trained = [t for t, r in trained_meta["targets"].items() if not r.get("skipped")]
        assert len(trained) >= 2, f"Expected ≥2 trained models, got {trained}"

    def test_training_meta_json_written(self, tmp_dirs):
        _, models_dir = tmp_dirs
        assert (models_dir / "training_meta.json").exists()

    def test_meta_json_structure(self, tmp_dirs):
        _, models_dir = tmp_dirs
        with open(models_dir / "training_meta.json") as f:
            meta = json.load(f)
        assert "training_date" in meta
        assert "targets" in meta
        for target in train_model.TARGETS:
            assert target in meta["targets"]

    def test_model_pkl_written_for_trained_targets(self, trained_meta, tmp_dirs):
        _, models_dir = tmp_dirs
        for target, result in trained_meta["targets"].items():
            if result.get("skipped"):
                continue
            model_name = train_model.MODEL_NAMES[target]
            assert (models_dir / f"{model_name}.pkl").exists(), \
                f"Expected {model_name}.pkl to exist for trained target {target}"

    def test_auc_above_minimum_for_trained_targets(self, trained_meta):
        for target, result in trained_meta["targets"].items():
            if result.get("skipped"):
                continue
            assert result["auc"] >= 0.50, \
                f"{target}: AUC {result['auc']:.4f} below random-baseline 0.50"

    def test_skipped_targets_have_skip_reason(self, trained_meta):
        for target, result in trained_meta["targets"].items():
            if result.get("skipped"):
                assert "skip_reason" in result
                assert result["best_model"] is None

    def test_feature_cols_contain_no_raw_db_columns(self, trained_meta):
        """Regression: NetAmount and Ammount must not leak into feature_cols."""
        forbidden = {"NetAmount", "Ammount"}
        for target, result in trained_meta["targets"].items():
            leaked = forbidden & set(result.get("feature_cols", []))
            assert not leaked, \
                f"{target}: raw DB columns leaked into features: {leaked}"


# ─── Predict tests ────────────────────────────────────────────────────────────

class TestPredict:
    @pytest.fixture(scope="class")
    def predictions(self, synthetic_data, tmp_dirs, trained_meta):
        data_dir, models_dir = tmp_dirs
        with patch.object(predict, "_DATA_DIR", data_dir), \
             patch.object(predict, "_MODELS_DIR", models_dir):
            return predict.predict()

    def test_predictions_row_count(self, predictions):
        assert len(predictions) == N

    def test_required_columns_present(self, predictions):
        required = {
            "clientID", "prediction_date", "pd_score",
            "risk_label", "stage_migration_prob",
            "dpd_escalation_prob", "recommended_action",
        }
        assert required.issubset(predictions.columns)

    def test_pd_score_in_unit_interval(self, predictions):
        assert (predictions["pd_score"] >= 0).all()
        assert (predictions["pd_score"] <= 1).all()

    def test_risk_labels_are_valid(self, predictions):
        valid = {"Low", "Medium", "High", "Critical", "Default imminent"}
        assert set(predictions["risk_label"].unique()).issubset(valid)

    def test_csv_written(self, synthetic_data, tmp_dirs, trained_meta):
        data_dir, models_dir = tmp_dirs
        with patch.object(predict, "_DATA_DIR", data_dir), \
             patch.object(predict, "_MODELS_DIR", models_dir):
            predict.predict()
        assert (data_dir / "predictions.csv").exists()

    def test_missing_model_does_not_crash(self, synthetic_data, tmp_dirs, trained_meta):
        """If dpd_escalation model is absent, predict() must still complete
        and return dpd_escalation_prob = 0 for all clients."""
        data_dir, models_dir = tmp_dirs
        dpd_path = models_dir / "model_dpd_escalation.pkl"
        existed = dpd_path.exists()
        if existed:
            dpd_path.rename(dpd_path.with_suffix(".pkl.bak"))
        try:
            with patch.object(predict, "_DATA_DIR", data_dir), \
                 patch.object(predict, "_MODELS_DIR", models_dir):
                df = predict.predict()
            assert len(df) == N
            assert (df["dpd_escalation_prob"] == 0).all()
        finally:
            if existed:
                dpd_path.with_suffix(".pkl.bak").rename(dpd_path)
