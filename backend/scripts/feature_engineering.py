import logging, warnings
from pathlib import Path
import numpy as np, pandas as pd
from scipy import stats
from db_connect import get_conn, _PROJECT_ROOT, _DB_SERVER, _DB_NAME

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("spectra.feature_engineering")
_OUTPUT = _PROJECT_ROOT / "data" / "processed" / "features.parquet"
_OUTPUT.parent.mkdir(parents=True, exist_ok=True)


def _get_conn():
    return get_conn()

def _sql(q, conn):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return pd.read_sql(q, conn)

def _nullcheck(df, label):
    for c in df.columns:
        p = df[c].isna().mean()
        if p > 0.2:
            log.warning("%s: %r has %.1f%% nulls", label, c, p * 100)

_SQL_RP = """WITH lc AS (
    SELECT clientID, MAX(CalculationDate) AS mx
    FROM [SPECTRA].[dbo].[RiskPortfolio] WITH (NOLOCK) GROUP BY clientID
), pc AS (
    SELECT rp.clientID, MAX(rp.CalculationDate) AS pmx
    FROM [SPECTRA].[dbo].[RiskPortfolio] rp WITH (NOLOCK)
    JOIN lc ON rp.clientID=lc.clientID AND rp.CalculationDate<lc.mx GROUP BY rp.clientID
)
SELECT rp.clientID, rp.Stage, rp.BankCurrentRating, rp.BankPreviousMonthRating,
    rp.totalExposure, rp.onBalanceExposure, rp.duePrincipal,
    rp.penaltyInterest, rp.AccruedInterest, rp.[Effective Interest Rate],
    rp.Restructuring, rp.TotalOffBalance, rp.lastClassificationChangeDate,
    rp.CalculationDate AS latestCalcDate, rp2.totalExposure AS prevTotalExposure
FROM [SPECTRA].[dbo].[RiskPortfolio] rp WITH (NOLOCK)
JOIN lc ON rp.clientID=lc.clientID AND rp.CalculationDate=lc.mx
LEFT JOIN pc ON rp.clientID=pc.clientID
LEFT JOIN [SPECTRA].[dbo].[RiskPortfolio] rp2 WITH (NOLOCK)
    ON rp2.clientID=pc.clientID AND rp2.CalculationDate=pc.pmx"""

_SQL_DPD = """WITH ld AS (
    SELECT CreditAccount, MAX(dateID) AS mx
    FROM [SPECTRA].[dbo].[DueDaysDaily] WITH (NOLOCK) GROUP BY CreditAccount
)
SELECT c.PersonalID AS clientID,
    MAX(d.DueDays) AS DueDays, MAX(d.DueMax6M) AS DueMax6M,
    MAX(d.DueMax1Y) AS DueMax1Y, MAX(d.DueMax2Y) AS DueMax2Y,
    MAX(d.DueTotal) AS DueTotal
FROM [SPECTRA].[dbo].[DueDaysDaily] d WITH (NOLOCK)
JOIN ld ON d.CreditAccount=ld.CreditAccount AND d.dateID=ld.mx
JOIN [SPECTRA].[dbo].[Credits] c WITH (NOLOCK) ON d.CreditAccount=c.CreditAccount
GROUP BY c.PersonalID"""

_SQL_TREND = """WITH rk AS (
    SELECT c.PersonalID AS clientID, d.CreditAccount, d.DueDays, d.dateID,
        ROW_NUMBER() OVER (PARTITION BY d.CreditAccount ORDER BY d.dateID DESC) AS rn
    FROM [SPECTRA].[dbo].[DueDaysDaily] d WITH (NOLOCK)
    JOIN [SPECTRA].[dbo].[Credits] c WITH (NOLOCK) ON d.CreditAccount=c.CreditAccount
)
SELECT clientID, CreditAccount, DueDays, dateID FROM rk WHERE rn <= 3"""

_SQL_AMORT = """SELECT c.PersonalID AS clientID, ap.OTPLATA, ap.ANUITET, ap.DATUMDOSPECA AS DATUM_VALUTE
FROM [SPECTRA].[dbo].[AmortizationPlan] ap WITH (NOLOCK)
JOIN [SPECTRA].[dbo].[Credits] c WITH (NOLOCK) ON ap.PARTIJA=c.CreditAccount
WHERE ap.DATUMDOSPECA <= GETDATE()"""

_SQL_TA = """SELECT a.PersonalID AS clientID, ta.Amount AS NetAmount, ta.Date AS txn_date
FROM [SPECTRA].[dbo].[TAccounts] ta WITH (NOLOCK)
JOIN [SPECTRA].[dbo].[Accounts] a WITH (NOLOCK) ON ta.NoAccount=a.NoAccount
WHERE ta.Date >= DATEADD(MONTH, -12, GETDATE())"""

_SQL_CC = """SELECT ca.PersonalID AS clientID, ev.Ammount, ev.trans_date AS event_date
FROM [SPECTRA].[dbo].[CC_Event_LOG] ev WITH (NOLOCK)
JOIN [SPECTRA].[dbo].[Cards] ca WITH (NOLOCK) ON ev.Account=ca.NoCards
WHERE LEN(ev.trans_date) >= 7
  AND LEFT(ev.trans_date, 7) >= CONVERT(VARCHAR(7), DATEADD(MONTH, -2, GETDATE()), 120)"""


def _rp(conn):
    log.info("Fetching RiskPortfolio...")
    df=_sql(_SQL_RP,conn); _nullcheck(df,"RP")
    df["rating_deterioration"]=(df["BankCurrentRating"]>df["BankPreviousMonthRating"]).astype(int)
    df["lastClassificationChangeDate"]=pd.to_datetime(df["lastClassificationChangeDate"],errors="coerce")
    df["latestCalcDate"]=pd.to_datetime(df["latestCalcDate"],errors="coerce")
    df["stage_age_months"]=((df["latestCalcDate"]-df["lastClassificationChangeDate"]).dt.days.fillna(0)/30.0).round(1)
    pte=pd.to_numeric(df["prevTotalExposure"],errors="coerce")
    te=pd.to_numeric(df["totalExposure"],errors="coerce")
    df["exposure_growth_rate"]=np.where((pte.notna())&(pte>0),((te-pte)/pte*100).round(2),0.0)
    keep=["clientID","Stage","BankCurrentRating","BankPreviousMonthRating","totalExposure",
          "onBalanceExposure","duePrincipal","penaltyInterest","AccruedInterest",
          "Effective Interest Rate","Restructuring","TotalOffBalance",
          "rating_deterioration","stage_age_months","exposure_growth_rate"]
    return df[keep].set_index("clientID")

def _dpd(conn):
    log.info("Fetching DueDaysDaily...")
    df=_sql(_SQL_DPD,conn); _nullcheck(df,"DPD"); dt=_sql(_SQL_TREND,conn)
    def _sl(g):
        g=g.sort_values("dateID")
        if len(g)<2: return 0.0
        x=np.arange(len(g),dtype=float); y=g["DueDays"].astype(float).values
        if np.std(y)==0: return 0.0
        s,*_=stats.linregress(x,y); return round(float(s),4)
    _tr=dt.groupby("clientID").apply(lambda g: _sl(g[["DueDays","dateID"]]), include_groups=False)
    tr=_tr.reset_index(); tr.columns=["clientID","dpd_trend"]
    df=df.merge(tr,on="clientID",how="left"); df["dpd_trend"]=df["dpd_trend"].fillna(0.0)
    return df.set_index("clientID")

def _amort(conn):
    log.info("Fetching AmortizationPlan...")
    df=_sql(_SQL_AMORT,conn); _nullcheck(df,"Amort")
    df["OTPLATA"]=pd.to_numeric(df["OTPLATA"],errors="coerce").fillna(0)
    df["ANUITET"]=pd.to_numeric(df["ANUITET"],errors="coerce").fillna(0)
    df["is_missed"] = (
        df["OTPLATA"].fillna(0) < df["ANUITET"].fillna(0)
    ).where(df["ANUITET"].fillna(0) > 0, df["OTPLATA"].fillna(1) == 0).astype(int)
    df["rr"]=np.where(df["ANUITET"]>0,df["OTPLATA"]/df["ANUITET"],np.nan)
    def _cl(g):
        flags=(g["OTPLATA"]==0).astype(int).values; mx=cur=0
        for fl in flags: cur=(cur+1) if fl else 0; mx=max(mx,cur)
        return mx
    agg=df.groupby("clientID").agg(repayment_rate_avg=("rr","mean"),repayment_rate_min=("rr","min"),
        missed_payment_count=("is_missed","sum"),total_installments=("OTPLATA","count")).reset_index()
    agg["missed_payment_ratio"]=(agg["missed_payment_count"]/agg["total_installments"].replace(0,np.nan)).fillna(0).round(4)
    _consec=df.sort_values(["clientID","DATUM_VALUTE"]).groupby("clientID").apply(lambda g: _cl(g[["OTPLATA"]]), include_groups=False)
    consec=_consec.reset_index(); consec.columns=["clientID","consecutive_lates"]
    r=agg.merge(consec,on="clientID",how="left")
    r["consecutive_lates"]=r["consecutive_lates"].fillna(0).astype(int)
    r["repayment_rate_avg"]=r["repayment_rate_avg"].fillna(0).round(4)
    r["repayment_rate_min"]=r["repayment_rate_min"].fillna(0).round(4)
    return r[["clientID","repayment_rate_avg","repayment_rate_min",
              "missed_payment_count","missed_payment_ratio","consecutive_lates"]].set_index("clientID")

def _ta(conn):
    log.info("Fetching TAccounts...")
    df=_sql(_SQL_TA,conn); _nullcheck(df,"TAccounts")
    df["txn_date"]=pd.to_datetime(df["txn_date"],errors="coerce")
    df["net_amount"]=pd.to_numeric(df["NetAmount"],errors="coerce").fillna(0)
    df["month"]=df["txn_date"].dt.to_period("M"); cut60=pd.Timestamp.now()-pd.Timedelta(days=60)
    def _ag(g):
        mn=g.groupby("month")["net_amount"].sum(); rec=g[g["txn_date"]>=cut60]
        return pd.Series({"salary_months_active":int((mn>0).sum()),
            "salary_stopped_flag":int(len(rec)==0 or rec["net_amount"].sum()<=0),
            # approximation: net-outflow month treated as overdraft indicator
            "overdraft_months":int((mn<0).sum()),"overdraft_dependency":int((mn<0).sum()>=3)})
    result=df.groupby("clientID").apply(lambda g: _ag(g[["txn_date","net_amount","month"]]), include_groups=False).reset_index().set_index("clientID")
    return result[["salary_months_active","salary_stopped_flag","overdraft_months","overdraft_dependency"]]

def _cc(conn):
    log.info("Fetching CC_Event_LOG...")
    df=_sql(_SQL_CC,conn); _nullcheck(df,"Cards")
    df["event_date"]=pd.to_datetime(df["event_date"],errors="coerce")
    df["card_amount"]=pd.to_numeric(df["Ammount"],errors="coerce").fillna(0)  # DB column is misspelled
    now=pd.Timestamp.now(); c30=now-pd.Timedelta(days=30); c60=now-pd.Timedelta(days=60)
    def _ag(g):
        s30=g[g["event_date"]>=c30]["card_amount"].sum()
        sp=g[(g["event_date"]>=c60)&(g["event_date"]<c30)]["card_amount"].sum()
        mom=((s30-sp)/sp*100.0) if sp>0 else 0.0
        return pd.Series({"card_spend_last30d":round(float(s30),2),
            "card_spend_mom_growth":round(float(mom),2),"card_acceleration_flag":int(mom>30.0)})
    result=df.groupby("clientID").apply(lambda g: _ag(g[["event_date","card_amount"]]), include_groups=False).reset_index().set_index("clientID")
    return result[["card_spend_last30d","card_spend_mom_growth","card_acceleration_flag"]]

def build_features():
    log.info("Connecting to %s / %s",_DB_SERVER,_DB_NAME)
    conn=_get_conn()
    try:
        rp,dpd,am,ta,cc=_rp(conn),_dpd(conn),_amort(conn),_ta(conn),_cc(conn)
    finally:
        conn.close()
    log.info("Sizes -- RP:%d DPD:%d Amort:%d TA:%d CC:%d",len(rp),len(dpd),len(am),len(ta),len(cc))
    df=rp.join(dpd,how="left").join(am,how="left").join(ta,how="left").join(cc,how="left")
    nc=df.select_dtypes(include=[np.number]).columns; df[nc]=df[nc].fillna(0)
    log.info("Matrix: %d clients, %d features",len(df),df.shape[1])
    _nullcheck(df,"Final"); df.to_parquet(_OUTPUT,index=True)
    log.info("Saved to %s",_OUTPUT); return df

def run():
    """Entry point for the pipeline runner."""
    return build_features()

if __name__ == "__main__":
    f=build_features(); print("Shape:",f.shape); print(f.dtypes.to_string())
