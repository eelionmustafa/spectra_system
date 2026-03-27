# SPECTRA — Complete System Manual
## Technical Explanation · Calculation Reference · User Guide

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Database Tables](#2-database-tables)
3. [ML Pipeline — Step by Step](#3-ml-pipeline--step-by-step)
4. [Risk Labels and Thresholds](#4-risk-labels-and-thresholds)
5. [IFRS 9 Implementation](#5-ifrs-9-implementation)
6. [Action Engine](#6-action-engine)
7. [Page-by-Page: What Each Page Calculates](#7-page-by-page-what-each-page-calculates)
8. [User Roles and Permissions](#8-user-roles-and-permissions)
9. [Step-by-Step User Manual](#9-step-by-step-user-manual)
10. [Threshold Reference](#10-threshold-reference)

---

## 1. System Architecture

SPECTRA is a credit risk intelligence platform made of three layers that work together:

```
Python ML Pipeline         SQL Server Database          Next.js Web Application
─────────────────          ────────────────────         ──────────────────────
feature_engineering.py  →  SPECTRA.dbo.*           →   spectra-app (Next.js 15)
build_labels.py            RiskPortfolio                11 pages, App Router
train_model.py             DueDaysDaily                 Server components (SSR)
predict.py                 Customer / Credits           Suspense streaming
explain.py                 TAccounts / Accounts         In-memory query cache
flag_risks.py              AmortizationPlan             5 min / 10 min TTL
                           CC_Event_LOG / Cards
                           ClientActions
                           ECLProvisions
         ↓                                                       ↑
   data/processed/                                       reads CSV + DB
   predictions.csv
   shap_explanations.csv
   risk_flags.csv
   features.parquet
```

**Data flow:**
1. The Python pipeline reads from SQL Server, engineers features, trains models, and writes CSV files.
2. The Next.js app reads both SQL Server (live portfolio data) and the CSV files (ML scores).
3. Every page renders with server-side data — there is no client-side fetch waterfall on load.
4. Expensive queries are cached in-process for 5 minutes (portfolio) or 10 minutes (EWI aggregates).

**ML Pipeline runs:** Manual or scheduled (e.g. nightly). Each run regenerates `predictions.csv`, `shap_explanations.csv`, and `risk_flags.csv`.

---

## 2. Database Tables

| Table | What it stores |
|---|---|
| `RiskPortfolio` | Monthly IFRS 9 classification snapshot per client: Stage, totalExposure, CalculatedProvision, BankCurrentRating, CalculationDate |
| `DueDaysDaily` | Daily DPD (days past due) per credit account: DueDays, DueMax6M, DueMax1Y, DueMax2Y, DueTotal |
| `Customer` | Client master: PersonalID, name, surname |
| `Credits` | Loan accounts: CreditAccount, PersonalID, TypeOfProduct, FromYear |
| `TAccounts` | Bank account transactions: salary credits, withdrawals — used for salary inflow and overdraft detection |
| `Accounts` | Links NoAccount → PersonalID |
| `AmortizationPlan` | Instalment schedule: PARTIJA (account), ANUITET (scheduled amount), OTPLATA (actual paid), DATUMDOSPECA (due date) |
| `CC_Event_LOG` | Card transactions: Account, Ammount, trans_date — used for card spend acceleration |
| `Cards` | Links card numbers → PersonalID |
| `ClientActions` | Audit trail of all user actions: clientId, action, actionedBy, status, createdAt |
| `ECLProvisions` | SPECTRA-computed ECL provisions per client per stage reclassification |

**Key relationship:** `DueDaysDaily.CreditAccount` → `Credits.CreditAccount` → `Credits.PersonalID` → `Customer.PersonalID`

---

## 3. ML Pipeline — Step by Step

The pipeline produces five trained models and three output files. Here is exactly what happens at each stage.

---

### Step 1 — Feature Engineering (`scripts/feature_engineering.py`)

Reads from five database tables and joins them into a single feature matrix per client.

#### Source A: RiskPortfolio (latest snapshot per client)
Pulls the most recent `CalculationDate` for each `clientID`. Also pulls the second-most-recent record to compute growth rate.

Features produced:
- `Stage` — current IFRS 9 stage (1, 2, or 3)
- `BankCurrentRating` / `BankPreviousMonthRating` — bank's internal rating
- `totalExposure` — total credit exposure in EUR
- `onBalanceExposure`, `duePrincipal`, `penaltyInterest`, `AccruedInterest` — balance components
- `Effective Interest Rate` — contractual rate
- `Restructuring` — flag if loan was restructured
- `TotalOffBalance` — off-balance-sheet commitments
- `rating_deterioration` — 1 if current rating is worse than prior month, else 0
- `stage_age_months` — how many months the client has been in the current stage: `(latestCalcDate − lastClassificationChangeDate) / 30`
- `exposure_growth_rate` — month-over-month exposure change: `(currentExposure − prevExposure) / prevExposure × 100`

#### Source B: DueDaysDaily (latest snapshot + trend)
Pulls the latest DPD record per credit account, then aggregates by PersonalID.
Also pulls the last 3 DPD observations per account to compute a trend slope.

Features produced:
- `DueDays` — current days past due
- `DueMax6M`, `DueMax1Y`, `DueMax2Y`, `DueTotal` — historical DPD maximums
- `dpd_trend` — linear regression slope over the last 3 DPD snapshots per account. Positive = DPD worsening, negative = improving, zero = flat.

#### Source C: AmortizationPlan (instalment history)
Pulls all past-due instalments (`DATUMDOSPECA <= today`). For each client computes:

- `repayment_rate_avg` — average of `OTPLATA / ANUITET` across all instalments. 1.0 = full repayment, 0 = no payment made.
- `repayment_rate_min` — worst single instalment repayment rate
- `missed_payment_count` — count of instalments where `OTPLATA = 0`
- `missed_payment_ratio` — `missed_payment_count / total_installments`
- `consecutive_lates` — longest streak of consecutive missed payments (using a sliding counter)

#### Source D: TAccounts (salary and overdraft signals)
Pulls 12 months of account transactions. Groups by client and month.

Features produced:
- `salary_months_active` — how many of the last 12 months had a net positive credit (salary proxy)
- `salary_stopped_flag` — 1 if no credits detected in the last 60 days
- `overdraft_months` — count of months where the net balance was negative
- `overdraft_dependency` — 1 if overdraft occurred in 3 or more months

#### Source E: CC_Event_LOG (card spend acceleration)
Pulls the last 2 months of card transactions.

Features produced:
- `card_spend_last30d` — total card spend in the most recent 30 days
- `card_spend_mom_growth` — month-over-month percentage change: `(last30d − prior30d) / prior30d × 100`
- `card_acceleration_flag` — 1 if MoM growth exceeds 30%

The five sources are left-joined on `clientID`. Missing values are filled with 0.

**Output:** `data/processed/features.parquet` — one row per client, ~25 numeric columns.

---

### Step 2 — Label Building (`scripts/build_labels.py`)

Builds binary classification targets by looking forward in the `RiskPortfolio` history.

| Label | Definition | How computed |
|---|---|---|
| `label_default_30d` | Does this client reach Stage 3 in the **next** RiskPortfolio snapshot (≤40 days away)? | `Stage = 3 AND rn = current_rn + 1 AND date_gap ≤ 40 days` |
| `label_default_60d` | Stage 3 within **next 2 snapshots** (≤65 days)? | `Stage = 3 AND rn BETWEEN rn+1 AND rn+2 AND date_gap ≤ 65 days` |
| `label_default_90d` | Stage 3 within **next 3 snapshots**? | `Stage = 3 AND rn BETWEEN rn+1 AND rn+3` |
| `label_stage_migration` | Does the Stage **increase** (e.g. 1→2, 2→3) in the next snapshot? | `Stage > prev_stage AND date_gap ≤ 40 days` |
| `label_dpd_escalation` | Does DPD **cross 30** in the next observation (from below)? | `DueDays ≥ 30 AND prev_dpd < 30` |

**Output:** `data/processed/labels.parquet` — one row per client, 5 binary columns.

---

### Step 3 — Model Training (`scripts/train_model.py`)

Five separate models are trained — one per target label.

**Process for each target:**

1. Merge features + labels on `clientID`
2. Remove label columns and `clientID` from feature set. For `label_dpd_escalation`, also remove leaky DPD columns (`DueDays`, `DueMax6M`, `DueMax1Y`, `DueMax2Y`, `DueTotal`) that directly encode the target.
3. 80/20 stratified train/test split (random seed 42)
4. Train three candidate models:
   - **GradientBoostingClassifier** — 200 trees, depth 4, learning rate 0.05, 80% subsampling
   - **RandomForestClassifier** — 200 trees, depth 6, class_weight="balanced"
   - **LogisticRegression** — C=0.1, class_weight="balanced", max_iter=500 (uses StandardScaler)
5. Evaluate each with 5-fold cross-validation (AUC-ROC)
6. Evaluate on held-out test set (AUC-ROC)
7. Save the best model (by test AUC) as `models/model_<target>.pkl` with its scaler, feature column list, and model name

If a target has <1% positive rate (e.g. very few actual Stage 3 transitions in history), the model is skipped and marked as unavailable.

**Warning threshold:** AUC < 0.70 triggers a log warning but does not stop the pipeline.

**Output files:**
- `models/model_default_30d.pkl`
- `models/model_default_60d.pkl`
- `models/model_default_90d.pkl`
- `models/model_stage_migration.pkl`
- `models/model_dpd_escalation.pkl`
- `models/training_meta.json` — AUC scores, best model names, training date

---

### Step 4 — Prediction (`scripts/predict.py`)

Scores every active client across all five models.

**Process:**

1. Load `features.parquet`
2. Load all five model bundles
3. For each model, call `model.predict_proba(X)[:, 1]` — returns probability of the positive class
4. If a scaler was saved with the model (LogisticRegression), apply `scaler.transform(X)` first
5. For each client, record:
   - `pd_30d`, `pd_60d`, `pd_90d` — default probabilities at 30, 60, 90-day horizons
   - `pd_score` — alias for `pd_90d` (backward compatibility)
   - `stage_migration_prob` — probability of stage increase next period
   - `dpd_escalation_prob` — probability of DPD crossing 30 next period
   - `risk_label` — derived from `pd_90d` using threshold table (see Section 4)
   - `recommended_action` — text description matching the risk label

**Output:** `data/processed/predictions.csv`

After scoring, `explain.py` is automatically called.

---

### Step 5 — SHAP Explanations (`scripts/explain.py`)

Computes which features most drove the PD score for each client, using the `model_default_90d` model.

**Process:**

1. Load `features.parquet` and `model_default_90d.pkl`
2. Select explainer based on model type:
   - `GradientBoostingClassifier` or `RandomForestClassifier` → `shap.TreeExplainer` (fast, exact tree-based SHAP)
   - `LogisticRegression` → `shap.LinearExplainer` with Independent masker
3. Compute SHAP values for all clients: a matrix of shape `(n_clients × n_features)` where each value is how much that feature pushed the PD up or down
4. For each client, sort features by `|SHAP value|` descending, take top 3
5. Record: `top_factor_1`, `top_factor_2`, `top_factor_3` (feature names) and `shap_1`, `shap_2`, `shap_3` (signed values)
   - Positive SHAP → feature pushed PD higher (risk-increasing)
   - Negative SHAP → feature pushed PD lower (risk-reducing)

**Output:** `data/processed/shap_explanations.csv`

**How SHAP is displayed in the UI:**
On the Early Warnings case review and Client Profile pages, the top 2 SHAP factors are shown as bars with arrows. An upward arrow (red) means the factor is increasing risk. A downward arrow (green) means it is reducing risk. Bar width represents the magnitude of that factor's contribution relative to the largest driver.

---

### Step 6 — Risk Flags (`scripts/flag_risks.py`)

Runs the 11 calculation checks from `calculations.py` on the current data and produces binary flags per client:

- `flag_zscore_anomaly` — unusual exposure/DPD combination relative to portfolio
- `flag_score_deterioration` — PD worsened significantly since last run
- `flag_exposure_spike` — exposure grew more than expected
- `flag_salary_stopped` — no salary inflow in 60 days
- `flag_overdraft_dependent` — 3+ months of overdraft usage
- `flag_card_acceleration` — card spend growing >30% MoM

**Output:** `data/processed/risk_flags.csv`

---

## 4. Risk Labels and Thresholds

All thresholds are defined in `config.ts` (frontend) and `config.py` (Python), kept in sync.

### PD Risk Labels (based on `pd_90d`)

| Label | PD Range | Meaning |
|---|---|---|
| Default Imminent | PD ≥ 86% | Highly likely to reach Stage 3 within 90 days |
| Critical | 66% ≤ PD < 86% | Very high risk, immediate action required |
| High | 41% ≤ PD < 66% | Elevated risk, urgent monitoring |
| Medium | 21% ≤ PD < 41% | Emerging risk, preventive action |
| Low | PD < 21% | Standard monitoring |

### Operational Tiers (used in EWI and Case Review)

| Tier | PD Threshold | Color | Action Urgency |
|---|---|---|---|
| Default Imminent | PD ≥ 66% | Red | IMMEDIATE / URGENT |
| Deteriorating | 40% ≤ PD < 66% | Amber | URGENT / STANDARD |
| Stable Watch | PD < 40% but above EWI threshold (40%) | Green | ROUTINE |

**EWI surface threshold:** Only clients with PD ≥ 40% appear in the Early Warnings case review.

### Health Score (Dashboard / Portfolio)

The portfolio health score (0–100) is computed in SQL from a weighted combination of:
- NPL ratio (Stage 3 %)
- SICR rate (Stage 2 %)
- Delinquency rate (% clients DPD ≥ 30)
- Average provision coverage

| Label | Score Range |
|---|---|
| Healthy | High score — NPL and delinquency within normal bounds |
| Watch | Moderate deterioration |
| Stressed | Score critically low — multiple thresholds breached |

---

## 5. IFRS 9 Implementation

### Stages

| Stage | Name | ECL Method | SPECTRA Provision Rate | Trigger |
|---|---|---|---|---|
| Stage 1 | Performing | 12-month ECL | 1% of outstanding balance | No SICR, no DPD |
| Stage 2 | SICR | Lifetime ECL | 5% of outstanding balance | SICR detected |
| Stage 3 | Credit Impaired (NPL) | Specific lifetime ECL | 20% of outstanding balance | DPD ≥ 90 or PD ≥ 86% |

### SICR Triggers (Stage 1 → Stage 2)

SICR (Significant Increase in Credit Risk) triggers when ANY of the following conditions is true:

| Trigger | Threshold | Source |
|---|---|---|
| PD threshold (quantitative) | PD ≥ 20% | IFRS 9 §B5.5.1 |
| DPD backstop | DPD ≥ 30 days | IFRS 9 §B5.5.19 (rebuttable presumption) |
| Missed payments (qualitative) | ≥ 2 missed payments | Internal policy |
| Combined qualitative | Salary stopped AND chronic overdraft | Internal policy |
| Stage migration probability | Model assigns ≥ 40% probability of stage increase | Internal policy |

### Stage 2 → Stage 3 Triggers

- DPD ≥ 90 days (NPL definition)
- Mortgage: PD ≥ 66% AND DPD ≥ 60 days (lower threshold due to collateral risk)

### ECL Provision Calculation (on SPECTRA)

SPECTRA computes the bank's theoretical ECL provision using simplified IFRS 9 rates:

```
Stage 1 ECL = totalExposure × 0.01
Stage 2 ECL = totalExposure × 0.05
Stage 3 ECL = totalExposure × 0.20
```

The `ECL Gap` on the Analytics page shows the difference between the bank's actual recorded provision (`CalculatedProvision` in RiskPortfolio) and SPECTRA's calculated ECL. A negative gap means the bank is under-provisioned for that stage.

---

## 6. Action Engine

The action engine (`actionEngine.ts`) converts all available client signals into a prioritised action plan. It never recommends an action that is already logged as active for that client.

### Input Signals

The engine receives:
- `pdScore` — ML-predicted 90-day default probability (0–1)
- `riskLabel` — risk tier string
- `ifrsStage` — current IFRS stage (1, 2, or 3)
- `currentDPD` — days past due today
- `maxDPD12m` — worst DPD in last 12 months
- `missedPayments` — count of missed instalments
- `dtiRatio` — debt-to-income ratio (%)
- `cureRate` — repayment rate (%)
- `salaryInflow` — Normal / Alert / Stopped / Critical
- `overdraft` — None / Active / Chronic (3+ months)
- `cardUsage` — Normal / High / Critical
- `productType` — Consumer / Mortgage / Overdraft / Card / Micro
- `stageMigrationProb` — model's stage migration probability
- `dpdEscalationProb` — model's DPD escalation probability
- `exposure` — current total exposure (EUR)
- `activeActions` — list of actions already logged (prevents duplicates)
- `topShapFactor` — the primary SHAP driver

### Action Priority Order

Actions are evaluated in four tiers, highest first:

#### IMMEDIATE (SLA: Today)
Triggered when:
- Client is Stage 3 or DPD ≥ 90 → **Escalate → Recovery** + **Legal Review** (mandatory, non-negotiable)
- Mortgage with DPD ≥ 60 → **Legal Review** (property collateral at risk)
- PD ≥ 70% AND DPD ≥ 30 AND salary stopped → **Freeze Account** (triple risk confluence)

#### URGENT (SLA: Within 24 hours)
Triggered when:
- PD ≥ 50% AND 30 ≤ DPD < 90 → **Call Now**
- Salary stopped → **Request salary documentation**
- Stage migration probability ≥ 40% → **Add to Watchlist**
- PD ≥ 50% AND DPD = 0 AND DPD escalation probability ≥ 40% → **Schedule Call** (proactive, before arrears start)

#### STANDARD (SLA: Within 7 days)
Triggered when:
- Stage 2 AND (DPD ≥ 15 OR escalation prob ≥ 25%) → **Restructure**
- Chronic overdraft (3+ months) → **Review/Reduce overdraft facility**
- DTI ≥ 55% → **Debt restructuring consultation**
- Card at limit → **Card limit review**
- 0% cure rate AND 2+ missed payments AND Stage ≥ 2 → **Request financial statements**

#### ROUTINE (SLA: Within 30 days)
Triggered when:
- 25% ≤ PD < 50% → **Add to Watchlist**
- Stage 2 → **Flag for Review**
- 15% ≤ PD < 25% AND DPD = 0 → **Monthly Monitor**
- No other actions triggered → **Monthly Monitor** (fallback, always at least one action)

### Output

Up to 5 actions are returned, sorted by urgency. Each action includes:
- `label` — button text
- `urgency` — IMMEDIATE / URGENT / STANDARD / ROUTINE
- `sla` — human-readable deadline
- `trigger` — plain-English reason why this action was selected
- `category` — contact / restrict / legal / restructure / monitor / investigate
- `requiresRole` — `any` (analysts can act) or `risk_officer` (restricted)
- `destructive` — whether the action is irreversible

---

## 7. Page-by-Page: What Each Page Calculates

---

### Dashboard (`/`)

**Queries run (parallel):**

1. `getDashboardKPIs` — Single SQL CTE joining `RiskPortfolio` + `DueDaysDaily`:
   - `total_exposure` — `SUM(CAST(totalExposure AS FLOAT))` filtered to latest `CalculationDate`
   - `total_clients` — `COUNT(DISTINCT clientID)` at latest date
   - `npl_ratio_pct` — `SUM(exposure WHERE Stage=3) / SUM(exposure) × 100`, rounded to 1 decimal
   - `delinquency_rate_pct` — `COUNT(clients with DPD ≥ 30) / total_clients × 100`
   - `avg_due_days` — `AVG(DueDays)` per client
   - `health_score` / `health_label` — composite score (0–100) from the above metrics, mapped to Healthy / Watch / Stressed

2. `getStageDistribution` — `GROUP BY Stage` on `RiskPortfolio`, returns count and exposure per stage

3. `getHighestRiskClient` — `TOP 1` client in Stage 3 ordered by `totalExposure DESC`

**Deferred (behind Suspense, do not block KPI render):**

4. `getMonthlyExposureTrend` — `GROUP BY LEFT(CalculationDate, 7)` for the last 12 months, total exposure per month

5. `getRecentTransactions` — `TOP 50` recent transactions from `TAccounts` and `AmortizationPlan` joined through `Credits`

**Priority Actions (computed in JavaScript, no extra query):**
- If NPL ratio > 5% → "NPL Ratio Elevated"
- If Stage 3 count > 0 → "X Credit-Impaired Clients" (links to highest-risk client's profile)
- If delinquency rate > 10% → "Delinquency Above Threshold"
- If health label = Stressed → "Portfolio Under Stress"

**Cache:** `getDashboardKPIs` and `getStageDistribution` cached 5 minutes.

---

### Portfolio (`/portfolio`)

**Queries run (parallel):**

1. `getPortfolioKPIs` — aggregates from `RiskPortfolio` latest snapshot:
   - Stage percentages (`stage1_pct`, `stage2_pct`, `stage3_pct`)
   - Average LTV (`avg_ltv`) from `TRY_CAST(LTVRatio AS FLOAT)`
   - Health score and label (same formula as Dashboard)
   - Also calls `ensureWrittenOffTable()` to guarantee the write-off table exists before any joins

2. `getExposureByProduct` — `GROUP BY TypeOfProduct` from `RiskPortfolio` at latest date, with delinquency rate per product

3. `getTotalECLProvisions` — reads from `ECLProvisions` table: total provision, per-stage breakdown, client count, last calculation date

**Deferred (Suspense):**

4. `getExposureByRegion` — `GROUP BY` region field from `RiskPortfolio`, exposure and delinquency per region

5. `getTopLoans` — `TOP 25` credit accounts by exposure joined to DPD data

**ECL Provision display:** SPECTRA uses simplified IFRS 9 rates (1% / 5% / 20%). If a client was reclassified to a higher stage, SPECTRA auto-calculates and stores the ECL provision for that event.

---

### Monitoring (`/monitoring`)

All six queries run in parallel:

1. `getAllFrozenClients` — `ClientActions WHERE action = 'FREEZE'` (active status)
2. `getAllPendingDocumentRequests` — `ClientActions WHERE action = 'REQUEST_DOCS'` (pending)
3. `getAllRecentCollateralReviews` — `ClientActions WHERE action = 'COLLATERAL_REVIEW'` (recent N)
4. `getRecentSystemActions` — `TOP 50 ClientActions ORDER BY createdAt DESC`
5. `getCardSpendAlerts` — Clients from `CC_Event_LOG` where MoM spend growth > 30% (top 5 by growth rate)
6. `getOverdraftDependency` — Clients from `TAccounts` with negative balance in 3+ of the last 6 months

**What the cards show:**
- Frozen accounts: clients whose credit facilities are currently restricted
- Document requests: clients where documentation has been requested but not yet received
- Collateral reviews: recent collateral assessments triggered by stage changes
- Card spend alerts: clients whose card spending accelerated sharply (possible liquidity stress)
- Chronic overdraft: clients structurally dependent on overdraft (liquidity problem signal)

---

### Early Warnings (`/warnings`)

This is the most data-intensive page. Everything runs in parallel after the initial fast parallel pair.

**Phase 1 — parallel (blocking):**
- `getActiveAlerts` — clients with current DPD ≥ 30, joined to exposure from `RiskPortfolio`
- `getClientSignalsBatch` — behavioral signals for ALL portfolio clients: salary status, overdraft months, card usage level, DPD, repayment rate, missed payments. Cached 15 minutes. This is the slowest query (scans TAccounts 4 times).

**Phase 2 — local file reads (instant, module-level cached 15 min):**
- `readPredictions()` — parses `predictions.csv`
- `readShapExplanations()` — parses `shap_explanations.csv`

**Phase 3 — parallel (active tab data + tab counts):**
- Active tab data (one of three paginated queries depending on which tab is open)
- Prediction count for tab badge
- Recommendation count for tab badge

**EWI Monitor tab — Case Review:**

The system deduplicates clients (one row per clientID), filters to those with `pd_90d ≥ 40%`, maps each to a tier using `deriveTier()`, and sorts by PD descending.

The officer reviews one client at a time using Prev/Next navigation. For each client:
- **PD score** at the selected window (30d, 60d, or 90d)
- **SHAP drivers** — top 2 factors that pushed the PD up or down (shown as mini bar chart)
- **Client signals** — 6 signals from `getClientSignalsBatch`: Exposure, Current DPD, Max DPD 12M, Missed payments, Salary status, Repayment rate
- **Recommended Actions** — from `assess()` in the action engine, using real signals + SHAP factor

**Active Alerts tab:** All clients with current DPD ≥ 30, paginated, searchable by client ID or name, filterable by severity (Critical/High) and IFRS stage.

**Predicted Deterioration tab:** Full `predictions.csv` list, paginated, searchable, filterable by risk label.

**Recommended Actions tab:** Compiled recommendations from `getRecommendationsPaginated`, based on the action engine logic applied across all high-risk clients.

---

### Watchlist (`/watchlist`)

**Query:** `getWatchlistClients` — all clients in `ClientActions` with action type `ADD_TO_WATCHLIST`, joined to current `RiskPortfolio` data for exposure and stage.

**Computed in a single JavaScript loop (no extra queries):**
- `totalExposure` — sum of all exposures
- `overdue` — clients on watchlist for > 60 days (require immediate re-assessment)
- `reviewDue` — clients on watchlist for 30–60 days
- `current` — clients added in the last 30 days
- `stage1 / stage2 / stage3` — count per IFRS stage
- `avgDPD` — average current DPD across all watchlist clients
- `dpdBuckets` — count per bucket: 0 DPD, 1–29d, 30–89d, 90d+

**Filter:** Officer can search by client ID/name or filter by IFRS stage.

---

### Client Profile (`/clients/[id]`)

This is the most detailed view. It uses a two-phase render:

**Phase 1 — critical path (blocks topbar/breadcrumb render):**
- `getClientProfile` — complex 10-CTE query: joins `RiskPortfolio`, `Customer`, `Credits`, `DueDaysDaily`, `TAccounts`, `AmortizationPlan`. Returns the client's full risk profile in one round trip. 60s timeout.

**Phase 2 — deferred (9 parallel queries behind Suspense):**
1. `getClientDPDHistory` — DPD timeline for the trend chart
2. `getClientEWI` — full EWI signals: salary months, overdraft months, card utilisation, repayment rate, missed payments, consecutive lates. 60s timeout.
3. `getClientActiveActions` — current open actions from `ClientActions`
4. `getClientProducts` — all credit accounts with type, amount, DPD, stage
5. `getClientCaseHistory` — all historical actions (full audit trail)
6. `getActiveRestructuringPlan` — any active restructuring agreement
7. `getCommitteeLog` — credit committee decisions for this client
8. `getActiveRecoveryCase` — active recovery/legal case reference
9. `isClientWrittenOff` — whether the client is in the write-off register

**From local files (instant, cached 15 min):**
- `readPredictions()` — finds this client's PD scores across all horizons
- `readShapExplanations()` — finds this client's top SHAP factors
- `readRiskFlags()` — finds this client's automated risk flags

**SICR Assessment:** The profile page computes SICR status in real time by calling `evaluateSICR()` with all the client's current signals. If SICR is flagged, a banner appears explaining which rule was triggered and what stage reclassification is implied.

**Action Engine:** `assess()` runs with all signals to produce the recommended action plan for this specific client at this point in time.

---

### Analytics (`/analytics`)

Four independent sections stream in parallel. Each section is a separate Suspense boundary, so they appear progressively as their queries complete.

**Section 1 — Portfolio Overview (3 parallel queries):**
- `getAnalyticsKPIs`:
  - `stage_migration_rate` — percentage of clients whose stage increased last period
  - `provision_coverage` — `SUM(CalculatedProvision) / SUM(totalExposure) × 100`
  - `cure_rate_90d` — percentage of Stage 2/3 clients that returned to performing in the last 90 days
- `getDelinquencyBySegment` — `% clients with DPD ≥ 30` grouped by product type
- `getStageMigration` — actual stage transition counts (1→2, 2→3, 3→2, etc.) between the last two `CalculationDate` snapshots

**Section 2 — IFRS 9 Compliance (5 parallel queries):**
- `getProvisionByProduct` — bank provision as % of exposure, by product
- `getECLByStage` — for each stage: total_exposure, bank_provision, calculated_ecl (SPECTRA rate), provision_gap
- `getECLProvisionGap` — same but in aggregate, with coverage ratio
- `getCoverageByStage` — MoM change in coverage ratio per stage (flags stages where coverage declined > 2pp)
- `getTotalECLProvisions` — total from `ECLProvisions` table

**Section 3 — Behavioral Risk (3 parallel queries, both now cached 10 min):**
- `getRollrateMatrix`:
  - Reads the **two most recent** `dateID` values from `DueDaysDaily`
  - Previous snapshot: classifies each account into DPD bucket (Current / 1-29 / 30-59 / 60-89 / 90+)
  - Current snapshot: same classification
  - Joins the two snapshots on `CreditAccount`
  - Groups by `(from_bucket, to_bucket)` counting transitions
  - `rate_pct = transitions / row_total × 100` — what % of accounts in each bucket moved where
  - Diagonal = stayed in same bucket. Right of diagonal = deteriorated. Left of diagonal = improved.
- `getRepaymentSummary`:
  - `rate = OTPLATA / ANUITET` per instalment (actual paid / scheduled)
  - `full_pct` — % of instalments where rate ≥ 1.0 (full or overpayment)
  - `partial_pct` — % where 0.5 ≤ rate < 1.0 (partial payment)
  - `critical_pct` — % where rate < 0.5 (paid less than half)
- `getInterestAtRisk` — for Stage 2 and 3: `interest_income_at_risk = totalExposure × (Effective Interest Rate / 100)`

**Section 4 — Risk Signals (3 parallel queries):**
- `getNPLRatioTrend` — monthly NPL ratio (`Stage 3 exposure / total exposure`) for the last 6 months using `LEFT(CalculationDate, 7)` grouping
- `getVintageAnalysis` — delinquency rate (% clients DPD ≥ 30) by loan `FromYear`, last 5 vintage years
- `getPDByRating` — PD as % of clients reaching Stage 3, grouped by `BankCurrentRating` — shows which rating bands are performing worst

---

### Concentration Risk (`/concentration`)

**All 5 queries parallel:**

1. `getTopObligors` — all clients from `RiskPortfolio`, sorted by `totalExposure DESC`:
   - `pct_of_portfolio = clientExposure / totalPortfolioExposure × 100`
   - Flags: `≥ 2% = monitor`, `≥ 10% = large exposure (EBA threshold)`

2. `getConcentrationByProduct` — exposure and client count by `TypeOfProduct`

3. `getConcentrationByRegion` — exposure by `Region` field in `RiskPortfolio`

4. `getProductHHI` — **Herfindahl-Hirschman Index by product:**
   - `share_i = product_exposure / total_exposure`
   - `HHI = Σ (share_i × 100)²` (each share is expressed as percentage, squared and summed)
   - 0 = perfectly dispersed, 10,000 = monopoly
   - < 1,500 = unconcentrated, 1,500–2,500 = moderate, > 2,500 = highly concentrated (EBA regulatory concern)

5. `getRegionHHI` — same formula applied to regional exposure shares

**Lorenz Curve (JavaScript, no extra query):**
Sort obligors by exposure descending, compute cumulative share of clients vs cumulative share of exposure. Plotted as an SVG curve. The further the curve bows below the diagonal, the more concentrated the portfolio.

**Breach detection:**
- Top 1 obligor ≥ 10% → regulatory alert (Basel III Art. 395 monitoring at 25% of Tier 1)
- More than 5 obligors ≥ 2% → diversification concern
- HHI > 2,500 → stress testing required (EBA/GL/2018/06)

---

### Stress Testing (`/stress`)

**Query:** `getTopPredictions(9999)` — all clients with ML predictions, joined to portfolio exposure.

**Three scenarios computed in JavaScript:**

| Scenario | PD Multiplier | Interpretation |
|---|---|---|
| Base | × 1.0 | No shock — current ML predictions |
| Adverse | × 1.5 | +50% PD shock — moderate economic downturn (GDP ~−2%) |
| Severe | × 2.5 | +150% PD shock — systemic crisis (GDP ~−5%+) |

**For each scenario, `computeScenario(basePDs, multiplier)` computes:**
```
shocked_pd = min(base_pd × multiplier, 1.0)   // PD cannot exceed 100%
avg_shocked_pd = mean of all shocked_pds
ELR = avg_shocked_pd × LGD                     // Expected Loss Rate
LGD = 0.45 (Basel III unsecured retail Loss Given Default)
```

**Output per scenario:**
- `avgPD` — portfolio average PD under this shock
- `elr` — Expected Loss Rate (ELR = avgPD × 0.45)
- `labelCounts` — distribution of clients by post-shock risk label (Low → Default Imminent)
- `criticalCount` — clients whose shocked PD ≥ 66% (Critical or Default Imminent tier)

**Migration table:** Shows how many clients move from Low/Medium/High/Critical/Default Imminent in Base to each label in Adverse and Severe. A cell with many Low→Critical migrations indicates a fragile portfolio.

**Sensitivity chart:** ELR plotted against PD multiplier from 1.0× to 3.0× in 0.1× steps, showing the relationship between economic deterioration and expected portfolio loss.

---

### Notifications (`/notifications`)

- `getNotificationsForUser(username, 50)` — reads the last 50 system notifications for the logged-in user from the notifications store
- Notifications are generated by system events (stage reclassifications, watchlist additions, review due alerts)
- The client component (`NotificationList`) handles filter tabs (All / Unread / Alerts / Reminders) and mark-read / mark-all-read actions client-side without additional queries

---

### Audit Log (`/audit`)

**Parallel queries:**
- `getAuditLog(100)` — last 100 records from `ClientActions`: clientId, action, actionedBy, status, notes, createdAt
- `getAuditStats` — `COUNT(*)` for today, this week, and all time; `COUNT(*) WHERE action='FREEZE' AND status='ACTIVE'` for active freezes

**JavaScript aggregations (no extra queries):**
- Group actions by type → `topActions` (top 6 by frequency, used in bar chart)
- Group actions by `actionedBy` → `topUsers` (top 5 contributors)

---

## 8. User Roles and Permissions

| Action | Analyst | Risk Officer |
|---|---|---|
| View all pages | Yes | Yes |
| Search client profiles | Yes | Yes |
| Add to Watchlist | Yes | Yes |
| Schedule Call / Call Now | Yes | Yes |
| Request documentation | Yes | Yes |
| Flag for Review | Yes | Yes |
| Monthly Monitor | Yes | Yes |
| Restructure recommendation | No | Yes |
| Freeze Account | No | Yes |
| Legal Review / Escalate to Recovery | No | Yes |
| Debt restructuring consultation | No | Yes |

Role is read from the JWT session cookie (`spectra_session`). Actions that `requiresRole: 'risk_officer'` are hidden from analyst accounts.

---

## 9. Step-by-Step User Manual

---

### Morning Routine (Daily Start — 10–15 minutes)

**Step 1 — Dashboard overview**
1. Open SPECTRA. The Dashboard loads instantly with today's Portfolio Health Score, NPL Ratio, Delinquency Rate, and Total Exposure.
2. Read the Priority Actions panel at the top. Each card is a specific task today — click "Review →" to go directly to the relevant page or client.
3. Check the Stage Distribution donut: note how many clients are in Stage 2 (SICR) and Stage 3 (NPL).
4. Glance at the 12-month Exposure Trend chart: is the portfolio growing or contracting?

**Step 2 — Early Warnings**
1. Navigate to Early Warnings (`/warnings`).
2. On the EWI Monitor tab, read the Case Review: the highest-risk client is shown first with their PD score, tier, and SHAP drivers.
3. Use "Next →" to step through each client above the 40% PD threshold.
4. For each client: read the Recommended Actions panel on the right. Execute any actions labelled IMMEDIATE or URGENT directly from this view.
5. Click the client ID link to open the full profile if you need more context.

**Step 3 — Active Alerts**
1. Still on Early Warnings, scroll down to the Active Alerts table.
2. Any client with a new DPD event since yesterday will appear here.
3. Filter by severity "Critical" to see only DPD ≥ 90-day cases.
4. Click any client ID to open their profile.

---

### Investigating a Specific Client

**Step 1 — Open Client Profile**
Navigate to Clients (`/clients`), search by ID or name, click the client.

**Step 2 — Read the overview panel**
- Check: IFRS Stage, current DPD, total exposure, product type
- Is there a SICR banner? If yes, read which trigger was hit and what stage reclassification is implied.
- Is there a Risk Flags panel? Flags like "Salary Stopped" or "Card Acceleration" indicate immediate attention needed.

**Step 3 — DPD History chart**
The chart shows the client's DPD over time. Look for:
- Recent upward trend (worsening)
- First-time breach of 30 days (SICR trigger)
- Repeated cure-and-relapse pattern (structural instability)

**Step 4 — ML Prediction panel**
- `pd_30d` — probability of Stage 3 in 30 days
- `pd_60d` — 60 days
- `pd_90d` — 90 days (primary management horizon)
- `stage_migration_prob` — model's probability of stage increase next period
- `dpd_escalation_prob` — probability of DPD crossing 30 next observation
- SHAP factors: see which features most drove the score. A "▲ Exposure growth rate elevated" means rapid balance growth is a key risk driver.

**Step 5 — Recommended Actions**
The action engine's output is shown. Click any action button to log it. Actions with `requiresRole: risk_officer` are only visible to risk officers.

**Step 6 — Products tab**
Review all active credit accounts: what products does the client hold, what is the DPD per account, is any account already in Stage 3 while others are Stage 1?

---

### IFRS 9 Compliance Review

**Step 1 — Portfolio page**
1. Open Portfolio (`/portfolio`).
2. Read the IFRS 9 ECL Provisions section: Total Provisions, Stage 1 / Stage 2 / Stage 3 breakdown.
3. Compare the provision count to the total client count — are all clients covered?

**Step 2 — Analytics: IFRS 9 Compliance section**
1. Open Analytics (`/analytics`).
2. The IFRS 9 Compliance section loads independently.
3. ECL Provision Gap table: each row shows a stage. A negative "Gap" (marked ▼) means the bank's recorded provision is less than SPECTRA's calculated ECL for that stage — this requires action.
4. Coverage Ratio MoM: if any stage shows a "FLAG" badge, coverage has declined more than 2pp since last month.

---

### Concentration Risk Review

**Step 1 — Open Concentration Risk page**
Navigate to Concentration Risk (`/concentration`).

**Step 2 — Check the Summary Banner**
- Largest obligor % — if ≥ 10%, a regulatory alert is shown
- Top 10 concentration % — if ≥ 50%, diversification is poor
- HHI Product and Region — if either is ≥ 2,500, stress testing is required

**Step 3 — Review breach alerts**
If the red "Regulatory Action Required" panel appears, read each breach and follow the recommended action link.

**Step 4 — Obligor table**
Rows highlighted in red = large exposures (≥ 10%). Click the client ID to open their profile. Rows in amber = monitor tier (≥ 2%).

**Step 5 — Run Stress Test**
If HHI > 2,500 or concentration is elevated, click the "Run Stress Test" link in the breach panel to quantify capital impact.

---

### Running a Stress Test

**Step 1 — Open Stress Testing**
Navigate to Stress Testing (`/stress`).

**Step 2 — Read the three scenario panels**
- **Base** — no shock. This is your current portfolio state.
- **Adverse** (×1.5 PD) — represents a moderate economic downturn. ELR shows the expected loss rate under this scenario.
- **Severe** (×2.5 PD) — systemic crisis. Significant client migrations from Low/Medium to Critical/Default Imminent.

**Step 3 — Interpret the Migration table**
Each cell shows `[count in Adverse] / [count in Severe]` relative to Base. Large numbers in the "Critical" and "Default Imminent" rows under Severe = capital adequacy risk.

**Step 4 — ELR formula check**
```
ELR = Average shocked PD × 0.45 (LGD)
```
If Severe ELR > 10%, the portfolio is at material capital risk under the stress scenario.

**Step 5 — Act on output**
If stress results are concerning:
- Clients who migrate to "Default Imminent" under Adverse → open their profiles and take preventive action now
- High HHI + high Adverse ELR → present to risk committee for concentration limit review

---

### Processing Notifications

**Step 1 — Open Notifications (`/notifications`)**
System-generated alerts appear here: stage reclassifications, watchlist review reminders, document request follow-ups.

**Step 2 — Filter**
Use tabs to see: All / Unread / Alerts / Reminders.

**Step 3 — Act and mark read**
Click any notification to open the relevant client profile. Mark individual items read or use "Mark All Read" to clear the queue.

---

### Using the Audit Log

**Step 1 — Open Audit Log (`/audit`)**

**Step 2 — Activity summary**
The four cards at the top show: actions today, this week, active freezes, total logged.

**Step 3 — Breakdown charts**
- "Actions by type" — what kinds of actions are most common (useful for pattern review)
- "Actions by user" — who has been most active (useful for manager oversight)

**Step 4 — Download**
Use the Export CSV button to download the full 100-record log for external reporting.

---

## 10. Threshold Reference

All thresholds are configurable via environment variables. Defaults are listed below.

### PD Label Thresholds
| Variable | Default | Meaning |
|---|---|---|
| `PD_THRESHOLD_DEFAULT_IMMINENT` | 0.86 | PD ≥ 86% → "Default imminent" |
| `PD_THRESHOLD_CRITICAL` | 0.66 | PD ≥ 66% → "Critical" |
| `PD_THRESHOLD_HIGH` | 0.41 | PD ≥ 41% → "High" |
| `PD_THRESHOLD_MEDIUM` | 0.21 | PD ≥ 21% → "Medium" |

### Tier Thresholds
| Variable | Default | Meaning |
|---|---|---|
| `TIER_CRITICAL_PD` | 0.66 | PD ≥ 66% → default-imminent tier (red) |
| `TIER_DETERIORATING_PD` | 0.40 | PD ≥ 40% → deteriorating tier (amber) |

### IFRS 9 / SICR
| Variable | Default | Meaning |
|---|---|---|
| `SICR_PD_THRESHOLD` | 0.20 | PD ≥ 20% triggers SICR (Stage 1→2) |
| `SICR_DPD_BACKSTOP` | 30 | DPD ≥ 30 triggers SICR |
| `SICR_MISSED_PAYMENTS` | 2 | 2+ missed payments triggers SICR |
| `SICR_NPL_DPD` | 90 | DPD ≥ 90 triggers Stage 3 |
| `SICR_MORTGAGE_DPD` | 60 | Mortgage DPD ≥ 60 triggers Stage 3 review |
| `SICR_STAGE_MIG_PROB` | 0.40 | Model probability ≥ 40% triggers SICR |

### Action Engine
| Variable | Default | Meaning |
|---|---|---|
| `ACTION_FREEZE_PD` | 0.70 | PD ≥ 70% enables Freeze trigger |
| `ACTION_FREEZE_DPD` | 30 | DPD ≥ 30 enables Freeze trigger |
| `ACTION_URGENT_CALL_PD` | 0.50 | PD ≥ 50% triggers Call Now |
| `ACTION_DPD_ESCALATION_PROB` | 0.40 | Escalation prob ≥ 40% triggers Schedule Call |
| `ACTION_STAGE2_RESTRUCTURE_DPD` | 15 | Stage 2, DPD ≥ 15 triggers Restructure |
| `ACTION_DTI_RESTRUCTURE` | 55 | DTI ≥ 55% triggers debt restructuring |

### Stress Testing
| Variable | Default | Meaning |
|---|---|---|
| `STRESS_LGD` | 0.45 | Loss Given Default (Basel III unsecured retail) |
| `STRESS_ADVERSE_MULTIPLIER` | 1.5 | Adverse scenario: PD × 1.5 |
| `STRESS_SEVERE_MULTIPLIER` | 2.5 | Severe scenario: PD × 2.5 |

### KPI Traffic-Light Thresholds
| Variable | Default | Turns Red At |
|---|---|---|
| `KPI_NPL_RED` | 5% | NPL ratio > 5% |
| `KPI_NPL_AMBER` | 3% | NPL ratio 3–5% |
| `KPI_STAGE2_RED` | 15% | Stage 2 rate > 15% |
| `KPI_DELINQUENCY_RED` | 10% | Delinquency rate > 10% |
| `KPI_DPD_RED` | 30 days | DPD ≥ 30 shows red in tables |
| `KPI_PROVISION_ADEQUATE` | 95% | Coverage < 95% shows warning |
| `KPI_VINTAGE_DELINQUENCY_WARN` | 10% | Vintage delinquency > 10% flagged |

### Concentration Risk
| Variable | Default | Meaning |
|---|---|---|
| `CONC_TOP1_OBLIGOR_WARN` | 10% | Single obligor ≥ 10% → EBA watchlist |
| `CONC_TOP10_TOTAL_WARN` | 50% | Top 10 ≥ 50% → diversification concern |
| `CONC_LARGE_EXPOSURE_MIN_PCT` | 2% | Obligor ≥ 2% = "large" |
| `CONC_HHI_CONCENTRATED` | 1,500 | HHI 1,500–2,500 = monitor |
| `CONC_HHI_HIGHLY_CONCENTRATED` | 2,500 | HHI > 2,500 = regulatory concern |

### Cache TTLs
| Variable | Default | Used For |
|---|---|---|
| `CACHE_TTL_MS` | 5 minutes | Portfolio / dashboard queries |
| `CACHE_EWI_TTL_MS` | 10 minutes | EWI aggregates (heavy table scans) |
| File cache TTL | 15 minutes | predictions.csv / shap_explanations.csv / risk_flags.csv |

---

*SPECTRA — Credit Risk Intelligence Platform. All thresholds require risk committee sign-off for changes to IFRS 9 / Basel III classified parameters.*
