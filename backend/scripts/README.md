# SPECTRA ML Pipeline — Backend Scripts

This directory contains the Python ML pipeline that powers SPECTRA's risk scoring,
default prediction, and anomaly detection features.

## Execution Order

Run scripts in the following order from the `backend/scripts/` directory:

```
1. feature_engineering.py
2. build_labels.py
3. train_model.py
4. predict.py
5. flag_risks.py  (or run_flags.py for scheduled execution)
6. explain.py
7. export_for_powerbi.py
```

## Script Descriptions

| Script | Purpose |
|---|---|
| `feature_engineering.py` | Connects to SQL Server, pulls RiskPortfolio, DueDaysDaily, AmortizationPlan, TAccounts, and CC_Event_LOG, engineers ~30 features per client, and writes `data/processed/features.parquet`. |
| `build_labels.py` | Generates binary default labels from historical DPD data (90-day forward-looking window). Writes `data/processed/labels.parquet`. |
| `train_model.py` | Trains the Gradient Boosting Classifier (risk score), GBR (days-to-default), and Random Forest (recovery probability) models. Serialises models to `models/`. |
| `predict.py` | Loads the latest feature matrix and runs all three models. Writes `data/processed/predictions.csv` with per-client PD score, default timeline, and recovery probability. |
| `flag_risks.py` | Applies threshold rules to predictions to generate early warning flags. Writes results back to SQL Server `SPECTRA_EWI_Predictions` table. |
| `run_flags.py` | Wrapper for scheduled/automated execution of `flag_risks.py` with logging and error handling. Used by the cron job or task scheduler. |
| `explain.py` | Generates SHAP values for the risk model. Writes `data/processed/shap_explanations.csv` with per-client top feature contributions. |
| `export_for_powerbi.py` | Exports final risk scores, EWI flags, and portfolio KPIs to CSV/Excel for PowerBI consumption. |

## Required Environment Variables

```
DB_SERVER          SQL Server hostname or IP
DB_NAME            Database name (default: Hackathon)
DB_USER            SQL auth username (leave unset for Windows/NTLM auth)
DB_PASSWORD        SQL auth password
DB_DOMAIN          Windows domain (for NTLM auth only)
DB_NTLM_USER       NTLM username (for NTLM auth only)
DB_NTLM_PASSWORD   NTLM password (for NTLM auth only)
```

Copy `.env.example` to `.env` and fill in values before running.

## Dependencies

```
pip install pandas numpy scipy scikit-learn xgboost pymssql joblib shap pyarrow openpyxl
```

Python 3.11+ is required.
