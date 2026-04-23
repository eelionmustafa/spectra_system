"""
SPECTRA Nightly ML Pipeline
============================
Runs the full scoring pipeline:
  1. feature_engineering  — fetches live data from DB, builds features.parquet
  2. predict              — scores all clients with trained models, writes to EWIPredictions

Usage:
    python run_pipeline.py                  # full run
    python run_pipeline.py --skip-features  # skip feature engineering (use cached parquet)
    python run_pipeline.py --dry-run        # score but skip DB publish

Scheduled via Windows Task Scheduler (see setup_scheduler.bat).
"""
import argparse
import logging
import sys
import time
from pathlib import Path

# Make scripts/ importable
sys.path.insert(0, str(Path(__file__).parent / "scripts"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(Path(__file__).parent / "pipeline.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("spectra.pipeline")


def run(skip_features: bool = False, dry_run: bool = False) -> bool:
    start = time.time()
    log.info("=" * 60)
    log.info("SPECTRA ML Pipeline starting")
    log.info("=" * 60)

    # ── Step 1: Feature Engineering ──────────────────────────────
    if not skip_features:
        log.info("Step 1/2 — Feature Engineering")
        try:
            from feature_engineering import run as build_features
            build_features()
            log.info("Feature engineering complete.")
        except Exception as exc:
            log.error("Feature engineering failed: %s", exc, exc_info=True)
            return False
    else:
        log.info("Step 1/2 — Feature Engineering skipped (--skip-features)")

    # ── Step 2: Predict + Publish ─────────────────────────────────
    log.info("Step 2/2 — Scoring all clients")
    try:
        from predict import predict, publish_predictions_to_db

        preds = predict()
        log.info("Scored %d clients.", len(preds))

        if dry_run:
            log.info("Dry run — skipping DB publish.")
        else:
            # Optional SHAP explanations
            shap_df = None
            try:
                from explain import explain_all
                log.info("Running SHAP explanations…")
                shap_df = explain_all()
                log.info("SHAP complete: %d rows", len(shap_df))
            except Exception as exc:
                log.warning("SHAP skipped: %s", exc)

            ok = publish_predictions_to_db(preds, shap_df)
            if ok:
                log.info("EWIPredictions updated successfully.")
            else:
                log.warning("DB publish returned False — check logs above.")
    except Exception as exc:
        log.error("Prediction step failed: %s", exc, exc_info=True)
        return False

    elapsed = time.time() - start
    log.info("Pipeline complete in %.1fs", elapsed)
    log.info("=" * 60)
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SPECTRA nightly ML pipeline")
    parser.add_argument("--skip-features", action="store_true",
                        help="Skip feature engineering, use cached features.parquet")
    parser.add_argument("--dry-run", action="store_true",
                        help="Score clients but skip writing to DB")
    args = parser.parse_args()

    success = run(skip_features=args.skip_features, dry_run=args.dry_run)
    sys.exit(0 if success else 1)
