"""
SPECTRA — Single-Client Rescore
Re-derives features for ONE client from the live DB, runs all trained models,
updates dbo.EWIPredictions (MERGE) and patches predictions.csv in-place.

Usage:
    python rescore_client.py --client-id 12345
    python rescore_client.py --client-id 12345 --json   # prints JSON result to stdout
"""
import argparse
import json
import logging
import warnings
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from scipy import stats

from config import pd_to_label
from db_connect import get_conn, _PROJECT_ROOT

log = logging.getLogger("spectra.rescore_client")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

_MODELS_DIR = _PROJECT_ROOT / "models"
_DATA_DIR   = _PROJECT_ROOT / "data" / "processed"
_PRED_CSV   = _DATA_DIR / "predictions.csv"


# ─── Per-client SQL queries (parameterised with {cid}) ───────────────────────

def _q(conn, sql, **params):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return pd.read_sql(sql, conn, params=params)


def _fetch_rp(conn, cid: str) -> pd.Series:
    sql = """
    WITH lc AS (
        SELECT clientID, MAX(CalculationDate) AS mx
        FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK)
        WHERE clientID = ?
        GROUP BY clientID
    ), pc AS (
        SELECT rp.clientID, MAX(rp.CalculationDate) AS pmx
        FROM [SPECTRA].[dbo].[RiskPortfolio] rp WITH (NOLOCK)
        JOIN lc ON rp.clientID = lc.clientID AND rp.CalculationDate < lc.mx
        GROUP BY rp.clientID
    )
    SELECT rp.clientID, rp.Stage, rp.BankCurrentRating, rp.BankPreviousMonthRating,
           rp.totalExposure, rp.onBalanceExposure, rp.lastClassificationChangeDate,
           rp.CalculationDate AS latestCalcDate, rp2.totalExposure AS prevTotalExposure
    FROM [SPECTRA].[dbo].[RiskPortfolio] rp WITH (NOLOCK)
    JOIN lc ON rp.clientID = lc.clientID AND rp.CalculationDate = lc.mx
    LEFT JOIN pc ON rp.clientID = pc.clientID
    LEFT JOIN [SPECTRA].[dbo].[RiskPortfolio] rp2 WITH (NOLOCK)
        ON rp2.clientID = pc.clientID AND rp2.CalculationDate = pc.pmx
    """
    df = _q(conn, sql, cid)
    if df.empty:
        return pd.Series(dtype=float)
    row = df.iloc[0]
    rd = int(row["BankCurrentRating"] or 0) > int(row["BankPreviousMonthRating"] or 0)
    lcc = pd.to_datetime(row["lastClassificationChangeDate"], errors="coerce")
    lcd = pd.to_datetime(row["latestCalcDate"], errors="coerce")
    age = ((lcd - lcc).days / 30.0) if pd.notna(lcc) and pd.notna(lcd) else 0.0
    pte = pd.to_numeric(row["prevTotalExposure"], errors="coerce")
    te  = pd.to_numeric(row["totalExposure"], errors="coerce")
    egr = ((te - pte) / pte * 100.0) if (pd.notna(pte) and pte > 0) else 0.0
    return pd.Series({
        "Stage":                  int(row["Stage"] or 1),
        "totalExposure":          float(te or 0),
        "rating_deterioration":   int(rd),
        "stage_age_months":       round(float(age), 1),
        "exposure_growth_rate":   round(float(egr), 2),
    })


def _fetch_dpd(conn, cid: str) -> pd.Series:
    sql_snap = """
    WITH ld AS (
        SELECT CreditAccount, MAX(dateID) AS mx
        FROM [SPECTRA].[dbo].[DueDaysDaily] WITH (NOLOCK) GROUP BY CreditAccount
    )
    SELECT MAX(d.DueDays) AS DueDays, MAX(d.DueMax6M) AS DueMax6M,
           MAX(d.DueMax1Y) AS DueMax1Y, MAX(d.DueMax2Y) AS DueMax2Y,
           MAX(d.DueTotal) AS DueTotal
    FROM [SPECTRA].[dbo].[DueDaysDaily] d WITH (NOLOCK)
    JOIN ld ON d.CreditAccount = ld.CreditAccount AND d.dateID = ld.mx
    JOIN [SPECTRA].[dbo].[Credits] c WITH (NOLOCK) ON d.CreditAccount = c.CreditAccount
    WHERE c.PersonalID = ?
    """
    snap = _q(conn, sql_snap, cid)

    sql_trend = """
    WITH rk AS (
        SELECT d.DueDays, d.dateID,
               ROW_NUMBER() OVER (PARTITION BY d.CreditAccount ORDER BY d.dateID DESC) AS rn
        FROM [SPECTRA].[dbo].[DueDaysDaily] d WITH (NOLOCK)
        JOIN [SPECTRA].[dbo].[Credits] c WITH (NOLOCK) ON d.CreditAccount = c.CreditAccount
        WHERE c.PersonalID = ?
    )
    SELECT DueDays, dateID FROM rk WHERE rn <= 3
    """
    trend = _q(conn, sql_trend, cid)
    dpd_trend = 0.0
    if len(trend) >= 2:
        trend = trend.sort_values("dateID")
        x = np.arange(len(trend), dtype=float)
        y = trend["DueDays"].astype(float).values
        if np.std(y) != 0:
            slope, *_ = stats.linregress(x, y)
            dpd_trend = round(float(slope), 4)

    row = snap.iloc[0] if not snap.empty else pd.Series()
    return pd.Series({
        "DueDays":    float(row.get("DueDays") or 0),
        "DueMax6M":   float(row.get("DueMax6M") or 0),
        "DueMax1Y":   float(row.get("DueMax1Y") or 0),
        "DueMax2Y":   float(row.get("DueMax2Y") or 0),
        "DueTotal":   float(row.get("DueTotal") or 0),
        "dpd_trend":  dpd_trend,
    })


def _fetch_amort(conn, cid: str) -> pd.Series:
    sql = """
    SELECT ap.OTPLATA, ap.ANUITET, ap.DATUMDOSPECA
    FROM [SPECTRA].[dbo].[AmortizationPlan] ap WITH (NOLOCK)
    JOIN [SPECTRA].[dbo].[Credits] c WITH (NOLOCK) ON ap.PARTIJA = c.CreditAccount
    WHERE c.PersonalID = ? AND ap.DATUMDOSPECA <= GETDATE()
    """
    df = _q(conn, sql, cid)
    if df.empty:
        return pd.Series({"repayment_rate_avg": 0.0, "repayment_rate_min": 0.0,
                          "missed_payment_count": 0, "missed_payment_ratio": 0.0,
                          "consecutive_lates": 0})
    df["OTPLATA"] = pd.to_numeric(df["OTPLATA"], errors="coerce").fillna(0)
    df["ANUITET"] = pd.to_numeric(df["ANUITET"], errors="coerce").fillna(0)
    df["rr"] = np.where(df["ANUITET"] > 0, df["OTPLATA"] / df["ANUITET"], np.nan)
    df["is_missed"] = ((df["OTPLATA"] < df["ANUITET"]) & (df["ANUITET"] > 0)).astype(int)
    # consecutive lates
    flags = (df["OTPLATA"] == 0).astype(int).values
    mx = cur = 0
    for fl in flags:
        cur = (cur + 1) if fl else 0; mx = max(mx, cur)
    n = len(df)
    return pd.Series({
        "repayment_rate_avg":   round(float(df["rr"].mean() or 0), 4),
        "repayment_rate_min":   round(float(df["rr"].min() or 0), 4),
        "missed_payment_count": int(df["is_missed"].sum()),
        "missed_payment_ratio": round(float(df["is_missed"].sum() / n) if n > 0 else 0, 4),
        "consecutive_lates":    int(mx),
    })


def _fetch_ta(conn, cid: str) -> pd.Series:
    sql = """
    SELECT ta.Amount AS NetAmount, ta.Date AS txn_date
    FROM [SPECTRA].[dbo].[TAccounts] ta WITH (NOLOCK)
    JOIN [SPECTRA].[dbo].[Accounts] a WITH (NOLOCK) ON ta.NoAccount = a.NoAccount
    WHERE a.PersonalID = ? AND ta.Date >= DATEADD(MONTH, -12, GETDATE())
    """
    df = _q(conn, sql, cid)
    if df.empty:
        return pd.Series({"salary_months_active": 0, "salary_stopped_flag": 1,
                          "overdraft_months": 0, "overdraft_dependency": 0})
    df["txn_date"]  = pd.to_datetime(df["txn_date"], errors="coerce")
    df["net_amount"] = pd.to_numeric(df["NetAmount"], errors="coerce").fillna(0)
    df["month"]     = df["txn_date"].dt.to_period("M")
    mn  = df.groupby("month")["net_amount"].sum()
    cut = pd.Timestamp.now() - pd.Timedelta(days=60)
    rec = df[df["txn_date"] >= cut]
    return pd.Series({
        "salary_months_active": int((mn > 0).sum()),
        "salary_stopped_flag":  int(len(rec) == 0 or rec["net_amount"].sum() <= 0),
        "overdraft_months":     int((mn < 0).sum()),
        "overdraft_dependency": int((mn < 0).sum() >= 3),
    })


def _fetch_cc(conn, cid: str) -> pd.Series:
    sql = """
    SELECT ev.Ammount, ev.trans_date AS event_date
    FROM [SPECTRA].[dbo].[CC_Event_LOG] ev WITH (NOLOCK)
    JOIN [SPECTRA].[dbo].[Cards] ca WITH (NOLOCK) ON ev.Account = ca.NoCards
    WHERE ca.PersonalID = ?
      AND LEN(ev.trans_date) >= 7
      AND LEFT(ev.trans_date, 7) >= CONVERT(VARCHAR(7), DATEADD(MONTH, -2, GETDATE()), 120)
    """
    df = _q(conn, sql, cid)
    if df.empty:
        return pd.Series({"card_spend_last30d": 0.0, "card_spend_mom_growth": 0.0,
                          "card_acceleration_flag": 0})
    df["event_date"]   = pd.to_datetime(df["event_date"], errors="coerce")
    df["card_amount"]  = pd.to_numeric(df["Ammount"], errors="coerce").fillna(0)
    now = pd.Timestamp.now()
    c30, c60 = now - pd.Timedelta(days=30), now - pd.Timedelta(days=60)
    s30 = df[df["event_date"] >= c30]["card_amount"].sum()
    sp  = df[(df["event_date"] >= c60) & (df["event_date"] < c30)]["card_amount"].sum()
    mom = ((s30 - sp) / sp * 100.0) if sp > 0 else 0.0
    return pd.Series({
        "card_spend_last30d":   round(float(s30), 2),
        "card_spend_mom_growth": round(float(mom), 2),
        "card_acceleration_flag": int(mom > 30.0),
    })


def build_client_features(cid: str) -> pd.Series:
    """Query DB and return a single-row feature Series for the given client."""
    conn = get_conn()
    try:
        rp    = _fetch_rp(conn, cid)
        dpd   = _fetch_dpd(conn, cid)
        amort = _fetch_amort(conn, cid)
        ta    = _fetch_ta(conn, cid)
        cc    = _fetch_cc(conn, cid)
    finally:
        conn.close()
    combined = pd.concat([rp, dpd, amort, ta, cc])
    combined = pd.to_numeric(combined, errors="coerce").fillna(0)
    return combined


def _load_model(name: str, required=False):
    path = _MODELS_DIR / f"{name}.pkl"
    if not path.exists():
        if required:
            raise FileNotFoundError(f"Model not found: {path}")
        return None
    return joblib.load(path)


def _predict_one(bundle, row: pd.Series) -> float:
    if bundle is None:
        return 0.0
    feat   = bundle["feature_cols"]
    scaler = bundle["scaler"]
    frame  = pd.DataFrame([row]).reindex(columns=feat, fill_value=0)
    if scaler is not None:
        frame = pd.DataFrame(scaler.transform(frame), columns=feat)
    return float(bundle["model"].predict_proba(frame)[:, 1][0])


def _update_predictions_csv(cid: str, result: dict) -> None:
    """Patch predictions.csv — replace (or append) the row for this client."""
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    new_row = pd.DataFrame([{
        "clientID":             cid,
        "prediction_date":      result["prediction_date"],
        "pd_30d":               result["pd_30d"],
        "pd_60d":               result["pd_60d"],
        "pd_90d":               result["pd_90d"],
        "pd_score":             result["pd_90d"],
        "risk_label":           result["risk_label"],
        "stage_migration_prob": result["stage_migration_prob"],
        "dpd_escalation_prob":  result["dpd_escalation_prob"],
        "recommended_action":   result["recommended_action"],
    }])
    if _PRED_CSV.exists():
        existing = pd.read_csv(_PRED_CSV)
        existing = existing[existing["clientID"].astype(str) != str(cid)]
        updated  = pd.concat([existing, new_row], ignore_index=True)
    else:
        updated = new_row
    updated.to_csv(_PRED_CSV, index=False)


def _update_ewi_predictions_db(cid: str, result: dict) -> None:
    """MERGE the new scores into dbo.EWIPredictions."""
    conn = get_conn()
    try:
        cursor = conn.cursor()
        # Ensure table exists
        cursor.execute("""
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='EWIPredictions' AND schema_id=SCHEMA_ID('dbo'))
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
        """)
        label = result["risk_label"]
        det   = label if label in ("High", "Medium", "Low") else "Critical"
        signals = json.dumps([f"Payment received — DueDays reset to 0"])
        reasoning = (
            f"{label} risk on the 90-day horizon ({result['pd_90d']:.1%} PD). "
            f"Recommended action: {result['recommended_action']}. "
            f"Payment received — DueDays reset to 0."
        )
        cursor.execute("""
        MERGE [dbo].[EWIPredictions] AS target
        USING (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?))
          AS source (client_id, risk_score, deterioration_risk, risk_label, key_signals,
                     ai_reasoning, pd_30d, pd_60d, pd_90d, stage_migration_prob,
                     dpd_escalation_prob, recommended_action, exposure)
        ON target.client_id = source.client_id
           AND CAST(target.run_date AS DATE) = CAST(GETDATE() AS DATE)
        WHEN MATCHED THEN UPDATE SET
          risk_score = source.risk_score, deterioration_risk = source.deterioration_risk,
          risk_label = source.risk_label, key_signals = source.key_signals,
          ai_reasoning = source.ai_reasoning, pd_30d = source.pd_30d,
          pd_60d = source.pd_60d, pd_90d = source.pd_90d,
          stage_migration_prob = source.stage_migration_prob,
          dpd_escalation_prob = source.dpd_escalation_prob,
          recommended_action = source.recommended_action,
          exposure = source.exposure, run_date = GETDATE()
        WHEN NOT MATCHED THEN INSERT (
          client_id, risk_score, deterioration_risk, risk_label, key_signals, ai_reasoning,
          pd_30d, pd_60d, pd_90d, stage_migration_prob, dpd_escalation_prob,
          recommended_action, exposure, run_date
        ) VALUES (
          source.client_id, source.risk_score, source.deterioration_risk, source.risk_label,
          source.key_signals, source.ai_reasoning, source.pd_30d, source.pd_60d, source.pd_90d,
          source.stage_migration_prob, source.dpd_escalation_prob, source.recommended_action,
          source.exposure, GETDATE()
        );
        """,
        cid, result["pd_90d"], det, label, signals, reasoning,
        result["pd_30d"], result["pd_60d"], result["pd_90d"],
        result["stage_migration_prob"], result["dpd_escalation_prob"],
        result["recommended_action"], result.get("totalExposure")
        )
        conn.commit()
        log.info("EWIPredictions updated for client %s", cid)
    finally:
        conn.close()


def rescore(client_id: str) -> dict:
    """
    Re-score a single client from live DB data.
    Returns dict with all prediction fields.
    """
    log.info("Rescoring client %s …", client_id)
    feats = build_client_features(client_id)

    m30  = _load_model("model_default_30d",   required=True)
    m60  = _load_model("model_default_60d",   required=True)
    m90  = _load_model("model_default_90d",   required=True)
    mmig = _load_model("model_stage_migration")
    mdpd = _load_model("model_dpd_escalation")

    pd_30 = round(_predict_one(m30,  feats), 4)
    pd_60 = round(_predict_one(m60,  feats), 4)
    pd_90 = round(_predict_one(m90,  feats), 4)
    mig   = round(_predict_one(mmig, feats), 4)
    dpde  = round(_predict_one(mdpd, feats), 4)

    risk_label, recommended_action = pd_to_label(pd_90)
    today = str(date.today())

    result = {
        "client_id":            client_id,
        "prediction_date":      today,
        "pd_30d":               pd_30,
        "pd_60d":               pd_60,
        "pd_90d":               pd_90,
        "pd_score":             pd_90,
        "risk_label":           risk_label,
        "stage_migration_prob": mig,
        "dpd_escalation_prob":  dpde,
        "recommended_action":   recommended_action,
        "totalExposure":        float(feats.get("totalExposure", 0)),
    }

    log.info("Scores — pd_30=%.3f pd_60=%.3f pd_90=%.3f label=%s", pd_30, pd_60, pd_90, risk_label)

    _update_ewi_predictions_db(client_id, result)
    _update_predictions_csv(client_id, result)

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", required=True, help="Client PersonalID to rescore")
    parser.add_argument("--json", action="store_true", help="Print result as JSON to stdout")
    args = parser.parse_args()

    r = rescore(args.client_id)
    if args.json:
        print(json.dumps(r))
    else:
        print(f"Client {r['client_id']}: pd_90d={r['pd_90d']:.3f} ({r['risk_label']})")
