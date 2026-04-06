import { query } from './db.server'
import { CACHE } from './config'
import { ensureWrittenOffTable } from './writtenOffService'
import { ensureResolutionsTable } from './resolutionService'

// ─── Per-process result cache ─────────────────────────────────────────────────
// Dates change only when ML pipeline runs → TTL eliminates ~45 table scans.
// EWI aggregate queries scan TAccounts (no index on Date string) → longer TTL.

let _maxCalcDate = '', _maxCalcExp = 0
let _maxDateID   = '', _maxDateExp  = 0
let _prevCalcDate = '', _prevCalcExp = 0
let _ewiSummary: EWISummary | null = null, _ewiExp = 0
let _overdraftDep: OverdraftDependency[] | null = null, _overdraftExp = 0
let _cardSpend: CardSpendAlert[] | null = null, _cardSpendExp = 0
const TTL = CACHE.TTL_MS
const EWI_TTL = CACHE.EWI_TTL_MS

// Generic result cache — used for portfolio, analytics, alert functions
// Max 200 entries: each entry is a full DB result set (avg ~50 KB).
// 200 * 50 KB = ~10 MB ceiling. LRU: evict oldest-inserted entry when full.
const RC_MAX = 200
const _rc = new Map<string, { v: unknown; exp: number }>()
function rc<T>(key: string): T | null {
  const e = _rc.get(key)
  if (!e) return null
  if (Date.now() >= e.exp) { _rc.delete(key); return null }
  return e.v as T
}
function sc(key: string, v: unknown, ttl: number) {
  if (_rc.size >= RC_MAX) {
    // Evict the oldest entry (Maps preserve insertion order)
    _rc.delete(_rc.keys().next().value!)
  }
  _rc.set(key, { v, exp: Date.now() + ttl })
}

// In-flight promise coalescing — prevents duplicate DB queries when cache is cold
// and multiple concurrent callers fire before the first result is cached.
let _prevDateID = '', _prevDateExp = 0
let _maxCalcDateInFlight:  Promise<string> | null = null
let _maxDateIDInFlight:    Promise<string> | null = null
let _prevCalcDateInFlight: Promise<string> | null = null
let _prevDateIDInFlight:   Promise<string> | null = null

async function maxCalcDate(): Promise<string> {
  if (_maxCalcDate && Date.now() < _maxCalcExp) return _maxCalcDate
  if (_maxCalcDateInFlight) return _maxCalcDateInFlight
  _maxCalcDateInFlight = query<{ d: string }>(`SELECT CAST(MAX(CalculationDate) AS VARCHAR(30)) AS d FROM [dbo].[RiskPortfolio] WITH (NOLOCK)`)
    .then(r => { _maxCalcDate = r[0]?.d ?? ''; _maxCalcExp = Date.now() + TTL; return _maxCalcDate })
    .finally(() => { _maxCalcDateInFlight = null })
  return _maxCalcDateInFlight
}

async function prevCalcDate(): Promise<string> {
  if (_prevCalcDate && Date.now() < _prevCalcExp) return _prevCalcDate
  if (_prevCalcDateInFlight) return _prevCalcDateInFlight
  _prevCalcDateInFlight = maxCalcDate()
    .then(cur => query<{ d: string }>(`SELECT CAST(MAX(CalculationDate) AS VARCHAR(30)) AS d FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE CalculationDate < @cur`, { cur }))
    .then(r => { _prevCalcDate = r[0]?.d ?? _maxCalcDate; _prevCalcExp = Date.now() + TTL; return _prevCalcDate })
    .finally(() => { _prevCalcDateInFlight = null })
  return _prevCalcDateInFlight
}

async function maxDateID(): Promise<string> {
  if (_maxDateID && Date.now() < _maxDateExp) return _maxDateID
  if (_maxDateIDInFlight) return _maxDateIDInFlight
  _maxDateIDInFlight = query<{ d: string }>(`SELECT CAST(MAX(dateID) AS VARCHAR(30)) AS d FROM [dbo].[DueDaysDaily] WITH (NOLOCK)`)
    .then(r => { _maxDateID = r[0]?.d ?? ''; _maxDateExp = Date.now() + TTL; return _maxDateID })
    .finally(() => { _maxDateIDInFlight = null })
  return _maxDateIDInFlight
}

async function prevDateID(): Promise<string> {
  if (_prevDateID && Date.now() < _prevDateExp) return _prevDateID
  if (_prevDateIDInFlight) return _prevDateIDInFlight
  _prevDateIDInFlight = maxDateID()
    .then(cur => query<{ d: string }>(`SELECT CAST(MAX(dateID) AS VARCHAR(30)) AS d FROM [dbo].[DueDaysDaily] WITH (NOLOCK) WHERE dateID < @cur`, { cur }))
    .then(r => { _prevDateID = r[0]?.d ?? _maxDateID; _prevDateExp = Date.now() + TTL; return _prevDateID })
    .finally(() => { _prevDateIDInFlight = null })
  return _prevDateIDInFlight
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DashboardKPIs {
  total_clients: number
  delinquency_rate_pct: number
  avg_due_days: number
  total_exposure: number
  // Computed in SQL:
  health_score: number
  health_label: string
  npl_ratio_pct: number
}

export interface StageDistribution {
  stage: string
  count: number
  exposure: number
}

export interface RecentTransaction {
  credit_id: string
  personal_id: string
  product_type: string
  amount: number
  due_days: number
  stage: string
  date: string
}

export interface MonthlyExposure {
  month: string
  exposure: number
}

export interface PortfolioKPIs {
  total_exposure: number
  stage1_pct: number
  stage2_pct: number
  stage3_pct: number
  npl_ratio_pct: number
  avg_ltv: number
  total_clients: number
  health_score: number
  health_label: string
}

export interface ProductExposure {
  product_type: string
  exposure: number
  pct: number
}

export interface RegionRow {
  region: string
  clients: number
  exposure: number
  delinquency_pct: number
}

export interface TopLoan {
  credit_id: string
  personal_id: string
  product_type: string
  exposure: number
  stage: string
  due_days: number
}

export interface PortfolioCreditTransaction {
  credit_id: string
  personal_id: string
  product_type: string
  amount: number
  stage: string
  start_date: string
  end_date: string
}

export interface PortfolioAccountTransaction {
  account_id: string
  personal_id: string
  account_type: string
  balance: number
  overdraft_limit: number
  currency: string
}

export interface PortfolioCardTransaction {
  event_id: string
  card_id: string
  event_type: string
  amount: number
  event_date: string
  merchant: string
}

export interface EWISummary {
  salary_stopped: number
  overdraft_spike: number
  card_high_util: number
  consecutive_lates: number
}

export interface AlertItem {
  credit_id: string
  personal_id: string
  alert_type: string
  severity: string
  due_days: number
  stage: string
  exposure: number
  triggered_date: string | null
}

export interface AlertTrend {
  month: string
  count: number
}

export interface ClientProfile {
  personal_id: string
  full_name: string
  region: string
  gender: string
  age: number
  employment_type: string
  credit_id: string
  product_type: string
  total_exposure: number
  on_balance: number
  off_balance: number
  approved_amount: number
  exposure_growth_pct: number | null
  current_due_days: number
  max_due_days_12m: number
  max_due_days_24m: number
  missed_payments: number
  total_payments: number
  dti_ratio: number | null
  repayment_rate_pct: number
  tenure_years: number
  stage: string
  risk_score: number
  // Computed in SQL:
  risk_tier: string
  sicr_flagged: boolean
}

export interface ClientProduct {
  credit_account: string
  product_type: string
  approved_amount: number
  stage: string
  due_days: number
}

export interface DPDHistory {
  month: string
  due_days: number
}

export interface ClientEWI {
  salary_inflow: string
  overdraft: string
  card_usage: string
  consec_lates: string
}

export interface AnalyticsKPIs {
  stage_migration_rate: number
  provision_coverage: number
  cure_rate_90d: number
}

export interface SegmentDelinquency {
  product_type: string
  delinquency_pct: number
}

export interface StageMigration {
  from_stage: string
  to_stage: string
  count: number
  exposure: number
}

export interface ProvisionByProduct {
  product_type: string
  provision_pct: number
}

export interface NPLRatio {
  total_loans: number
  npl_count: number
  npl_ratio_pct: number
}

export interface ECLByStage {
  stage: number
  stage_descr: string
  loan_count: number
  total_exposure: number
  bank_provision: number
  calculated_ecl: number
  provision_gap: number
}

export interface RepaymentSummary {
  full_pct: number
  partial_pct: number
  critical_pct: number
}

export interface InterestAtRisk {
  stage: number
  stage_descr: string
  client_count: number
  at_risk_exposure: number
  avg_interest_rate: number
  interest_income_at_risk: number
}

export interface PDByRating {
  rating_last_month: string
  total_clients: number
  defaulted: number
  pd_pct: number
}

export interface CoverageByStage {
  stage: number
  prev_coverage_pct: number
  curr_coverage_pct: number
  mom_change_pct: number
}

export interface CardSpendAlert {
  personal_id: string
  account: string
  current_spend: number
  mom_growth_pct: number
}

export interface OverdraftDependency {
  personal_id: string
  months_with_overdraft: number
  severity: string
}

export interface NPLTrend {
  month: string
  npl_ratio_pct: number
  npl_exposure: number
}

export interface RollrateCell {
  from_bucket: string
  to_bucket: string
  transitions: number
  rate_pct: number
}

export interface VintageRow {
  vintage_year: number
  loan_count: number
  delinquency_rate_pct: number
}

export interface ECLGapRow {
  stage: number
  total_exposure: number
  calculated_ecl: number
  provision_gap: number
  coverage_ratio_pct: number
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

/** Returns top-level portfolio KPIs (total clients, delinquency rate, NPL ratio, health score). */
export async function getDashboardKPIs(): Promise<DashboardKPIs> {
  const cached = rc<DashboardKPIs>('dashboardKPIs'); if (cached) return cached
  const [mcd] = await Promise.all([maxCalcDate()])
  const rows = await query<DashboardKPIs>(`
    WITH latest_dpd_per_client AS (
      -- Take each client's most recent DueDays regardless of which snapshot date it came from.
      -- Using MAX(dateID) per PersonalID avoids the problem of a single global MAX(dateID)
      -- returning a near-empty partial snapshot (e.g. only 7 rows on 2026-04-03 vs 1300 rows on 2025-12-21).
      SELECT PersonalID,
        MAX(TRY_CAST(DueDays AS FLOAT)) OVER (PARTITION BY PersonalID) AS max_dpd,
        ROW_NUMBER() OVER (PARTITION BY PersonalID ORDER BY dateID DESC) AS rn
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
    ),
    dpd_deduped AS (
      SELECT PersonalID, max_dpd FROM latest_dpd_per_client WHERE rn = 1
    ),
    dpd_base AS (
      -- Denominator = active clients in RiskPortfolio, not just those in DueDaysDaily
      SELECT
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN COALESCE(d.max_dpd, 0) >= 30 THEN rp.clientID END)
              / NULLIF(COUNT(DISTINCT rp.clientID), 0), 1)                           AS delinquency_rate_pct,
        ROUND(AVG(COALESCE(d.max_dpd, 0)), 1)                                        AS avg_due_days
      FROM [dbo].[RiskPortfolio] rp WITH (NOLOCK)
      LEFT JOIN dpd_deduped d ON d.PersonalID = rp.clientID
      WHERE rp.CalculationDate = @mcd
    ),
    client_worst_stage AS (
      -- Each client at their highest (worst) stage — IFRS 9 principle
      SELECT clientID,
        MAX(COALESCE(Stage, 1)) AS worst_stage,
        SUM(TRY_CAST(totalExposure AS FLOAT)) AS client_exposure
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd
      GROUP BY clientID
    ),
    rp_base AS (
      SELECT
        COUNT(*)                                                                     AS total_clients,
        COALESCE(SUM(client_exposure), 0)                                           AS total_exposure,
        ROUND(100.0 * SUM(CASE WHEN worst_stage = 2 THEN 1 ELSE 0 END)
              / NULLIF(COUNT(*), 0), 1)                                              AS stage2_pct,
        ROUND(100.0 * SUM(CASE WHEN worst_stage = 3 THEN 1 ELSE 0 END)
              / NULLIF(COUNT(*), 0), 1)                                              AS stage3_pct,
        ROUND(100.0 * SUM(CASE WHEN worst_stage = 3 THEN client_exposure ELSE 0 END)
              / NULLIF(SUM(client_exposure), 0), 1)                                 AS npl_ratio_pct
      FROM client_worst_stage
    )
    SELECT
      r.total_clients, d.delinquency_rate_pct, d.avg_due_days,
      r.total_exposure, r.npl_ratio_pct,
      CASE WHEN 100 - r.stage2_pct * 1 - r.stage3_pct * 3 < 0   THEN 0
           WHEN 100 - r.stage2_pct * 1 - r.stage3_pct * 3 > 100 THEN 100
           ELSE ROUND(100 - r.stage2_pct * 1 - r.stage3_pct * 3, 0)
      END                                                                            AS health_score,
      CASE
        WHEN 100 - r.stage2_pct * 1 - r.stage3_pct * 3 >= 85 THEN 'Healthy'
        WHEN 100 - r.stage2_pct * 1 - r.stage3_pct * 3 >= 70 THEN 'Watch'
        WHEN 100 - r.stage2_pct * 1 - r.stage3_pct * 3 >= 50 THEN 'Stressed'
        ELSE 'Critical'
      END                                                                            AS health_label
    FROM dpd_base d, rp_base r
  `, { mcd })
  const result = rows[0] ?? {
    total_clients: 0, delinquency_rate_pct: 0, avg_due_days: 0, total_exposure: 0,
    health_score: 0, health_label: 'Unknown', npl_ratio_pct: 0,
  }
  sc('dashboardKPIs', result, TTL); return result
}

export async function getStageDistribution(): Promise<StageDistribution[]> {
  const cached = rc<StageDistribution[]>('stageDistribution'); if (cached) return cached
  const mcd = await maxCalcDate()
  const result = await query<StageDistribution>(`
    -- Client count: each client assigned to their HIGHEST (worst) stage (IFRS 9 principle).
    -- Exposure: summed per loan stage (correct for ECL provisioning — each facility is staged independently).
    WITH client_worst_stage AS (
      SELECT clientID,
        MAX(COALESCE(Stage, 1)) AS worst_stage
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd
      GROUP BY clientID
    ),
    stage_exposure AS (
      SELECT COALESCE(Stage, 1) AS stage, SUM(TRY_CAST(totalExposure AS FLOAT)) AS exposure
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd
      GROUP BY COALESCE(Stage, 1)
    )
    SELECT
      'Stage ' + CAST(c.worst_stage AS VARCHAR) AS stage,
      COUNT(*)                                   AS count,
      e.exposure
    FROM client_worst_stage c
    JOIN stage_exposure e ON e.stage = c.worst_stage
    GROUP BY c.worst_stage, e.exposure
    ORDER BY c.worst_stage
  `, { mcd })
  sc('stageDistribution', result, TTL); return result
}

export async function getRecentTransactions(): Promise<RecentTransaction[]> {
  const cached = rc<RecentTransaction[]>('recentTransactions'); if (cached) return cached
  const mcd = await maxCalcDate()
  const d30 = new Date(); d30.setDate(d30.getDate() - 30)
  const d30Str = d30.toISOString().slice(0, 10)
  // Subquery on TCredits first (date-filtered, TOP 50 candidates) then join — avoids full CTE scan
  const result = await query<RecentTransaction>(`
    WITH recent_tc AS (
      SELECT TOP 50 CreditAccount, Kind, Amount, Date
      FROM [dbo].[TCredits] WITH (NOLOCK)
      WHERE Date >= @d30
      ORDER BY Date DESC
    ),
    latest_rp AS (
      SELECT clientID, Stage, contractNumber
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd
    )
    SELECT TOP 10
      tc.CreditAccount                                       AS credit_id,
      COALESCE(rp.clientID, '')                             AS personal_id,
      COALESCE(tc.Kind, '')                                 AS product_type,
      TRY_CAST(tc.Amount AS FLOAT)                          AS amount,
      0                                                     AS due_days,
      COALESCE('Stage ' + CAST(rp.Stage AS VARCHAR), 'N/A') AS stage,
      LEFT(CAST(tc.Date AS VARCHAR(30)), 10)                AS date
    FROM recent_tc tc
    LEFT JOIN [dbo].[Credits] cr WITH (NOLOCK) ON cr.CreditAccount = tc.CreditAccount
    LEFT JOIN latest_rp rp ON rp.contractNumber = cr.NoCredit
    ORDER BY tc.Date DESC
  `, { mcd, d30: d30Str }, 15000)
  sc('recentTransactions', result, TTL); return result
}

export async function getMonthlyExposureTrend(): Promise<MonthlyExposure[]> {
  const cached = rc<MonthlyExposure[]>('monthlyExposureTrend'); if (cached) return cached
  const d12m = new Date(); d12m.setMonth(d12m.getMonth() - 12)
  const ym12m = d12m.toISOString().slice(0, 7)
  const result = await query<MonthlyExposure>(`
    -- Description: Monthly total exposure from RiskPortfolio over last 12 months
    SELECT TOP 12
      LEFT(CalculationDate, 7)              AS month,
      SUM(TRY_CAST(totalExposure AS FLOAT)) AS exposure
    FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
    WHERE LEFT(CalculationDate, 7) >= @ym12m
    GROUP BY LEFT(CalculationDate, 7)
    ORDER BY LEFT(CalculationDate, 7)
    OPTION (RECOMPILE, MAXDOP 4)
  `, { ym12m }, 60000)
  sc('monthlyExposureTrend', result, TTL); return result
}

export async function getNPLRatio(): Promise<NPLRatio> {
  const cached = rc<NPLRatio>('nplRatio'); if (cached) return cached
  const mdid = await maxDateID()
  const rows = await query<NPLRatio>(`
    SELECT COUNT(*) AS total_loans,
      SUM(CASE WHEN TRY_CAST(DueDays AS FLOAT) >= 90 THEN 1 ELSE 0 END) AS npl_count,
      ROUND(SUM(CASE WHEN TRY_CAST(DueDays AS FLOAT) >= 90 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 1) AS npl_ratio_pct
    FROM [dbo].[DueDaysDaily] WITH (NOLOCK) WHERE dateID = @mdid
  `, { mdid })
  const result = rows[0] ?? { total_loans: 0, npl_count: 0, npl_ratio_pct: 0 }
  sc('nplRatio', result, TTL); return result
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export async function getPortfolioKPIs(): Promise<PortfolioKPIs> {
  const cached = rc<PortfolioKPIs>('portfolioKPIs'); if (cached) return cached
  await ensureWrittenOffTable()
  const mcd = await maxCalcDate()
  const rows = await query<PortfolioKPIs>(`
    -- Deduplicate by client: each client assigned to their highest (worst) stage.
    -- Exposure summed per client across all their loans.
    WITH client_worst_stage AS (
      SELECT rp.clientID,
        MAX(COALESCE(rp.Stage, 1))                       AS worst_stage,
        SUM(TRY_CAST(rp.totalExposure AS FLOAT))         AS client_exposure,
        SUM(TRY_CAST(rp.onBalanceExposure AS FLOAT))     AS on_balance,
        SUM(TRY_CAST(rp.Shuma_Approvuar AS FLOAT))      AS approved_amount
      FROM [dbo].[RiskPortfolio] rp WITH (NOLOCK)
      LEFT JOIN [dbo].[WrittenOffClients] wo WITH (NOLOCK) ON wo.client_id = rp.clientID
      WHERE rp.CalculationDate = @mcd AND wo.client_id IS NULL
      GROUP BY rp.clientID
    ),
    base AS (
      SELECT
        COUNT(*)                                                                         AS total_clients,
        COALESCE(SUM(client_exposure), 0)                                               AS total_exposure,
        ROUND(100.0 * SUM(CASE WHEN worst_stage = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS stage1_pct,
        ROUND(100.0 * SUM(CASE WHEN worst_stage = 2 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS stage2_pct,
        ROUND(100.0 * SUM(CASE WHEN worst_stage = 3 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS stage3_pct,
        -- NPL ratio: Stage 3 exposure / total exposure (IFRS 9 standard definition)
        ROUND(100.0 * SUM(CASE WHEN worst_stage = 3 THEN client_exposure ELSE 0 END)
              / NULLIF(SUM(client_exposure), 0), 1)                                     AS npl_ratio_pct,
        -- LTV: on-balance exposure / approved amount (where approved amount > 0)
        ROUND(100.0 * SUM(CASE WHEN COALESCE(approved_amount, 0) > 0 THEN on_balance ELSE NULL END)
              / NULLIF(SUM(CASE WHEN COALESCE(approved_amount, 0) > 0 THEN approved_amount ELSE NULL END), 0), 1) AS avg_ltv
      FROM client_worst_stage
    )
    SELECT
      total_exposure, total_clients, stage1_pct, stage2_pct, stage3_pct, npl_ratio_pct,
      COALESCE(avg_ltv, 0) AS avg_ltv,
      CASE WHEN 100 - stage2_pct * 1 - stage3_pct * 3 < 0   THEN 0
           WHEN 100 - stage2_pct * 1 - stage3_pct * 3 > 100 THEN 100
           ELSE ROUND(100 - stage2_pct * 1 - stage3_pct * 3, 0)
      END                                                                             AS health_score,
      CASE
        WHEN 100 - stage2_pct * 1 - stage3_pct * 3 >= 85 THEN 'Healthy'
        WHEN 100 - stage2_pct * 1 - stage3_pct * 3 >= 70 THEN 'Watch'
        WHEN 100 - stage2_pct * 1 - stage3_pct * 3 >= 50 THEN 'Stressed'
        ELSE 'Critical'
      END                                                                             AS health_label
    FROM base
  `, { mcd })
  const result = rows[0] ?? {
    total_exposure: 0, total_clients: 0, stage1_pct: 0, stage2_pct: 0, stage3_pct: 0,
    npl_ratio_pct: 0, avg_ltv: 0, health_score: 0, health_label: 'Unknown',
  }
  sc('portfolioKPIs', result, TTL); return result
}

export async function getExposureByProduct(): Promise<ProductExposure[]> {
  const cached = rc<ProductExposure[]>('exposureByProduct'); if (cached) return cached
  const mcd = await maxCalcDate()
  const result = await query<ProductExposure>(`
    WITH totals AS (
      -- Exclude written-off clients so grand_total matches the portfolio banner total
      SELECT SUM(TRY_CAST(rp.totalExposure AS FLOAT)) AS grand_total
      FROM [dbo].[RiskPortfolio] rp WITH (NOLOCK)
      LEFT JOIN [dbo].[WrittenOffClients] wo WITH (NOLOCK)
        ON wo.client_id = rp.clientID
      WHERE rp.CalculationDate = @mcd
        AND wo.client_id IS NULL
    )
    SELECT COALESCE(rp.ProductDesc, rp.TypeOfProduct, 'Other') AS product_type,
      SUM(TRY_CAST(rp.totalExposure AS FLOAT)) AS exposure,
      ROUND(100.0 * SUM(TRY_CAST(rp.totalExposure AS FLOAT)) / NULLIF(t.grand_total, 0), 1) AS pct
    FROM [dbo].[RiskPortfolio] rp WITH (NOLOCK)
    LEFT JOIN [dbo].[WrittenOffClients] wo WITH (NOLOCK)
      ON wo.client_id = rp.clientID
    CROSS JOIN totals t
    WHERE rp.CalculationDate = @mcd
      AND wo.client_id IS NULL
    GROUP BY rp.ProductDesc, rp.TypeOfProduct, t.grand_total ORDER BY exposure DESC
  `, { mcd })
  sc('exposureByProduct', result, TTL); return result
}

export async function getExposureByRegion(): Promise<RegionRow[]> {
  const cached = rc<RegionRow[]>('exposureByRegion'); if (cached) return cached
  const mcd = await maxCalcDate()
  const result = await query<RegionRow>(`
    WITH rp_filtered AS (
      SELECT clientID, TRY_CAST(totalExposure AS FLOAT) AS exposure
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd
    ),
    latest_dpd_per_client AS (
      -- Latest DPD per client regardless of snapshot date (avoids partial-snapshot bug)
      SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS due_days
      FROM (
        SELECT PersonalID, DueDays,
          ROW_NUMBER() OVER (PARTITION BY PersonalID ORDER BY dateID DESC) AS rn
        FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      ) x WHERE rn = 1
      GROUP BY PersonalID
    )
    SELECT COALESCE(cu.City, cu.Branch, 'Unknown') AS region,
      COUNT(DISTINCT rp.clientID) AS clients,
      SUM(rp.exposure) AS exposure,
      ROUND(100.0 * COUNT(DISTINCT CASE WHEN COALESCE(ld.due_days, 0) >= 30 THEN rp.clientID END)
            / NULLIF(COUNT(DISTINCT rp.clientID), 0), 1) AS delinquency_pct
    FROM rp_filtered rp
    LEFT JOIN [dbo].[Customer] cu WITH (NOLOCK)
      ON TRY_CAST(cu.PersonalID AS BIGINT) = TRY_CAST(rp.clientID AS BIGINT)
    LEFT JOIN latest_dpd_per_client ld ON ld.PersonalID = rp.clientID
    GROUP BY COALESCE(cu.City, cu.Branch, 'Unknown') ORDER BY exposure DESC
  `, { mcd })
  sc('exposureByRegion', result, TTL); return result
}

export async function getTopLoans(): Promise<TopLoan[]> {
  const cached = rc<TopLoan[]>('topLoans'); if (cached) return cached
  const mcd = await maxCalcDate()
  const result = await query<TopLoan>(`
    WITH latest_dpd AS (
      -- Latest DPD per CreditAccount regardless of snapshot date
      SELECT CreditAccount, MAX(TRY_CAST(DueDays AS FLOAT)) AS due_days
      FROM (
        SELECT CreditAccount, DueDays,
          ROW_NUMBER() OVER (PARTITION BY CreditAccount ORDER BY dateID DESC) AS rn
        FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      ) x WHERE rn = 1
      GROUP BY CreditAccount
    )
    SELECT TOP 8 cr.CreditAccount AS credit_id, rp.clientID AS personal_id,
      COALESCE(rp.ProductDesc, rp.TypeOfProduct, cr.TypeOfCalculatioin, '') AS product_type,
      TRY_CAST(rp.totalExposure AS FLOAT) AS exposure,
      'Stage ' + CAST(rp.Stage AS VARCHAR) AS stage,
      COALESCE(ld.due_days, 0) AS due_days
    FROM [dbo].[Credits] cr WITH (NOLOCK)
    JOIN [dbo].[RiskPortfolio] rp WITH (NOLOCK) ON rp.contractNumber = cr.NoCredit AND rp.CalculationDate = @mcd
    LEFT JOIN latest_dpd ld ON ld.CreditAccount = cr.CreditAccount
    ORDER BY TRY_CAST(rp.totalExposure AS FLOAT) DESC
  `, { mcd })
  sc('topLoans', result, TTL); return result
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function getCreditTransactions(days?: number): Promise<PortfolioCreditTransaction[]> {
  // Default to 90 days — no filter = full TCredits table scan which times out
  const effectiveDays = days ?? 90
  const dFrom = new Date(); dFrom.setDate(dFrom.getDate() - effectiveDays)
  const dateFrom = dFrom.toISOString().slice(0, 10)
  // Use cached maxCalcDate — avoids an inline MAX() full scan on every call
  const mcd = await maxCalcDate()
  return query<PortfolioCreditTransaction>(`
    -- Description: Recent credit transactions from TCredits, optional date window
    WITH latest_rp AS (
      SELECT clientID, Stage, contractNumber
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd
    )
    SELECT TOP 100
      tc.CreditAccount                              AS credit_id,
      COALESCE(rp.clientID, '')                    AS personal_id,
      COALESCE(tc.Kind, '')                        AS product_type,
      TRY_CAST(tc.Amount AS FLOAT)                 AS amount,
      COALESCE('Stage ' + CAST(rp.Stage AS VARCHAR), 'N/A') AS stage,
      LEFT(tc.Date, 10)                            AS start_date,
      ''                                           AS end_date
    FROM [dbo].[TCredits] tc WITH (NOLOCK)
    LEFT JOIN [dbo].[Credits] cr WITH (NOLOCK)
      ON cr.CreditAccount = tc.CreditAccount
    LEFT JOIN latest_rp rp ON rp.contractNumber = cr.NoCredit
    WHERE tc.Date >= @dateFrom
  `, { dateFrom, mcd })
}

export async function getAccountTransactions(): Promise<PortfolioAccountTransaction[]> {
  const cached = rc<PortfolioAccountTransaction[]>('accountTransactions'); if (cached) return cached
  const result = await query<PortfolioAccountTransaction>(`
    -- Description: Account balances and overdraft info from Accounts
    SELECT TOP 100
      a.NoAccount                                    AS account_id,
      a.PersonalID                                   AS personal_id,
      a.AccountType                                  AS account_type,
      TRY_CAST(a.Balance AS FLOAT)                   AS balance,
      COALESCE(TRY_CAST(a.amountonhold AS FLOAT), 0) AS overdraft_limit,
      a.Currency                                     AS currency
    FROM [dbo].[Accounts] a WITH (NOLOCK)
    ORDER BY TRY_CAST(a.Balance AS FLOAT) ASC
  `)
  sc('accountTransactions', result, TTL); return result
}

export async function getCardTransactions(days?: number): Promise<PortfolioCardTransaction[]> {
  const effectiveDays = days ?? 90
  const dFrom = new Date(); dFrom.setDate(dFrom.getDate() - effectiveDays)
  const dateFrom = dFrom.toISOString().slice(0, 10)
  return query<PortfolioCardTransaction>(`
    -- Description: Recent card events from CC_Event_LOG, optional date window
    SELECT TOP 100
      CAST(cc.eventno AS VARCHAR)                 AS event_id,
      cc.Account                                  AS card_id,
      COALESCE(cc.EventID, '')                   AS event_type,
      TRY_CAST(cc.Ammount AS FLOAT)               AS amount,
      LEFT(cc.trans_date, 10)                    AS event_date,
      COALESCE(cc.TERMINAL_ID, '')               AS merchant
    FROM [dbo].[CC_Event_LOG] cc WITH (NOLOCK)
    WHERE cc.trans_date >= @dateFrom
    ORDER BY cc.eventno DESC
  `, { dateFrom })
}

// ─── Early Warnings ───────────────────────────────────────────────────────────

/** Returns portfolio-level EWI summary counts grouped by severity.
 * @returns EWISummary with critical/high/medium/low alert counts
 */
export async function getEWISummary(): Promise<EWISummary> {
  if (_ewiSummary && Date.now() < _ewiExp) return _ewiSummary
  const [mcd, mdid] = await Promise.all([maxCalcDate(), maxDateID()])
  // Pre-compute date thresholds — enables index seeks on string date columns
  const d60d = new Date(); d60d.setDate(d60d.getDate() - 60)
  const d30d = new Date(); d30d.setDate(d30d.getDate() - 30)
  const d60dStr = d60d.toISOString().slice(0, 10)
  const d30dStr = d30d.toISOString().slice(0, 10)
  const rows = await query<EWISummary>(`
    WITH
    -- Pre-aggregate: clients who DID have salary inflow in last 60 days
    recent_salary AS (
      SELECT DISTINCT a.PersonalID
      FROM [dbo].[Accounts] a WITH (NOLOCK)
      JOIN [dbo].[TAccounts] ta WITH (NOLOCK) ON ta.NoAccount = a.NoAccount
      WHERE TRY_CAST(ta.Amount AS FLOAT) > 0
        AND ta.Date >= @d60d
    ),
    salary_stopped AS (
      SELECT COUNT(DISTINCT rp.clientID) AS cnt
      FROM [dbo].[RiskPortfolio] rp WITH (NOLOCK)
      LEFT JOIN recent_salary rs ON rs.PersonalID = rp.clientID
      WHERE rp.CalculationDate = @mcd AND rp.Stage >= 2 AND rs.PersonalID IS NULL
    ),
    overdraft_spike AS (
      SELECT COUNT(DISTINCT PersonalID) AS cnt FROM [dbo].[Accounts] WITH (NOLOCK) WHERE TRY_CAST(Balance AS FLOAT) < 0
    ),
    card_high AS (
      SELECT COUNT(DISTINCT ca.PersonalID) AS cnt
      FROM [dbo].[Cards] ca WITH (NOLOCK)
      JOIN (
        SELECT Account, SUM(TRY_CAST(Ammount AS FLOAT)) AS monthly_spend
        FROM [dbo].[CC_Event_LOG] WITH (NOLOCK)
        WHERE trans_date >= @d30d
        GROUP BY Account HAVING SUM(TRY_CAST(Ammount AS FLOAT)) > 1000
      ) hs ON hs.Account = ca.NoCards
    ),
    consec_lates AS (
      SELECT COUNT(DISTINCT PersonalID) AS cnt FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE TRY_CAST(DueDays AS FLOAT) > 0 AND dateID = @mdid
    )
    SELECT ss.cnt AS salary_stopped, od.cnt AS overdraft_spike, ch.cnt AS card_high_util, cl.cnt AS consecutive_lates
    FROM salary_stopped ss, overdraft_spike od, card_high ch, consec_lates cl
  `, { mcd, mdid, d60d: d60dStr, d30d: d30dStr }, 60000)   // 60s — joins TAccounts across all Stage 2+ clients
  _ewiSummary = rows[0] ?? { salary_stopped: 0, overdraft_spike: 0, card_high_util: 0, consecutive_lates: 0 }
  _ewiExp = Date.now() + EWI_TTL
  return _ewiSummary
}

export async function getActiveAlerts(): Promise<AlertItem[]> {
  const cached = rc<AlertItem[]>('activeAlerts'); if (cached) return cached
  const [mcd, mdid] = await Promise.all([maxCalcDate(), maxDateID()])
  // Pre-compute 6-month cutoff string — enables index seek on string dateID column
  // instead of applying TRY_CONVERT(DATE, dateID) per row (non-sargable, full scan)
  const d6m = new Date(); d6m.setMonth(d6m.getMonth() - 6)
  const d6mStr = d6m.toISOString().slice(0, 10)
  const result = await query<AlertItem>(`
    WITH latest_dpd AS (
      -- One row per CreditAccount: pick the highest DueDays if the account has
      -- duplicate entries on the same dateID (prevents key collisions in the UI)
      SELECT CreditAccount, PersonalID, DueDays,
        ROW_NUMBER() OVER (PARTITION BY CreditAccount ORDER BY TRY_CAST(DueDays AS FLOAT) DESC) AS rn
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE dateID = @mdid
    ),
    first_breach AS (
      -- Earliest date each account crossed 30 DPD in last 6 months.
      -- Uses string comparison on dateID (ISO 'YYYY-MM-DD') so SQL Server can
      -- range-seek with IX_DueDaysDaily_dateID instead of converting every row.
      SELECT CreditAccount,
        LEFT(MIN(dateID), 10) AS triggered_date
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE TRY_CAST(DueDays AS FLOAT) >= 30
        AND dateID >= @d6m
      GROUP BY CreditAccount
    ),
    rp_dedup AS (
      -- One row per client on the snapshot date: pick highest exposure record
      SELECT clientID, Stage, totalExposure,
        ROW_NUMBER() OVER (PARTITION BY clientID ORDER BY TRY_CAST(totalExposure AS FLOAT) DESC) AS rn
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd
    ),
    cr_dedup AS (
      -- One row per CreditAccount: pick the record with the highest Amount to avoid
      -- the Credits table multiplying rows when a CreditAccount has multiple entries
      SELECT CreditAccount, Amount,
        ROW_NUMBER() OVER (PARTITION BY CreditAccount ORDER BY TRY_CAST(Amount AS FLOAT) DESC) AS rn
      FROM [dbo].[Credits] WITH (NOLOCK)
    )
    SELECT TOP 10
      -- Cast IDs to VARCHAR so mssql never returns BigInt — RSC cannot serialize BigInt
      CAST(ld.CreditAccount AS VARCHAR(50))            AS credit_id,
      CAST(ld.PersonalID    AS VARCHAR(50))            AS personal_id,
      CASE
        WHEN TRY_CAST(ld.DueDays AS FLOAT) >= 90 THEN 'NPL — 90+ DPD'
        WHEN TRY_CAST(ld.DueDays AS FLOAT) >= 60 THEN 'Substandard — 60–89 DPD'
        WHEN TRY_CAST(ld.DueDays AS FLOAT) >= 30 THEN 'Watch — 30–59 DPD'
        ELSE 'Monitor'
      END                                              AS alert_type,
      CASE
        WHEN TRY_CAST(ld.DueDays AS FLOAT) >= 60 THEN 'critical'
        WHEN TRY_CAST(ld.DueDays AS FLOAT) >= 30 THEN 'high'
        ELSE 'medium'
      END                                              AS severity,
      TRY_CAST(ld.DueDays AS FLOAT)                    AS due_days,
      COALESCE('Stage ' + CAST(rp.Stage AS VARCHAR), 'N/A') AS stage,
      COALESCE(TRY_CAST(rp.totalExposure AS FLOAT), TRY_CAST(cr.Amount AS FLOAT), 0) AS exposure,
      fb.triggered_date                                AS triggered_date
    FROM latest_dpd ld
    LEFT JOIN cr_dedup cr ON cr.CreditAccount = ld.CreditAccount AND cr.rn = 1
    LEFT JOIN rp_dedup rp ON rp.clientID = ld.PersonalID AND rp.rn = 1
    LEFT JOIN first_breach fb ON fb.CreditAccount = ld.CreditAccount
    WHERE ld.rn = 1
      AND TRY_CAST(ld.DueDays AS FLOAT) >= 30
    ORDER BY TRY_CAST(ld.DueDays AS FLOAT) DESC
  `, { mcd, mdid, d6m: d6mStr })
  sc('activeAlerts', result, TTL); return result
}

// ─── Paginated Alert Table ─────────────────────────────────────────────────────

const PAGE_SIZE = 25

export interface AlertTableRow {
  credit_id:      string
  personal_id:    string
  full_name:      string
  name:           string
  surname:        string
  city:           string
  alert_type:     string
  severity:       string
  due_days:       number
  stage:          string
  exposure:       number
  triggered_date: string | null
}

export interface AlertFilters {
  severity?: string  // '' | 'critical' | 'high'
  stage?:    string  // '' | '1' | '2' | '3' | 'NA'
}

/** Returns a paginated, filtered list of active EWI alerts.
 * @param q - Search query
 * @param page - 1-based page number
 * @param filters - Optional AlertFilters
 * @returns Paginated rows and total count
 */
export async function getAlertsPaginated(
  q: string,
  page: number,
  filters: AlertFilters = {}
): Promise<{ rows: AlertTableRow[]; total: number }> {
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE
  const [mcd, mdid] = await Promise.all([maxCalcDate(), maxDateID()])
  const d6m = new Date(); d6m.setMonth(d6m.getMonth() - 6)
  const d6mStr    = d6m.toISOString().slice(0, 10)
  const pattern   = q ? `%${q}%` : '%%'
  const sevFilter = filters.severity ?? ''
  const stgFilter = filters.stage    ?? ''

  const ALERT_WHERE = `
    WHERE ld.rn = 1
      AND TRY_CAST(ld.DueDays AS FLOAT) >= 30
      AND (
        @pattern = '%%'
        OR CAST(ld.PersonalID    AS VARCHAR(50)) LIKE @pattern
        OR CAST(ld.CreditAccount AS VARCHAR(50)) LIKE @pattern
        OR (COALESCE(cu.name, '') + ' ' + COALESCE(cu.surname, '')) LIKE @pattern
      )
      AND (
        @sevFilter = ''
        OR (@sevFilter = 'critical' AND TRY_CAST(ld.DueDays AS FLOAT) >= 60)
        OR (@sevFilter = 'high'     AND TRY_CAST(ld.DueDays AS FLOAT) >= 30
                                    AND TRY_CAST(ld.DueDays AS FLOAT) < 60)
      )
      AND (
        @stgFilter = ''
        OR (@stgFilter = 'NA' AND rp.Stage IS NULL)
        OR CAST(rp.Stage AS VARCHAR) = @stgFilter
      )
  `

  const dataQ = query<AlertTableRow>(`
    WITH latest_dpd AS (
      SELECT CreditAccount, PersonalID, DueDays,
        ROW_NUMBER() OVER (PARTITION BY CreditAccount ORDER BY TRY_CAST(DueDays AS FLOAT) DESC) AS rn
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE dateID = @mdid
    ),
    first_breach AS (
      SELECT CreditAccount, LEFT(MIN(dateID), 10) AS triggered_date
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE TRY_CAST(DueDays AS FLOAT) >= 30 AND dateID >= @d6m
      GROUP BY CreditAccount
    ),
    rp_dedup AS (
      SELECT clientID, Stage, totalExposure,
        ROW_NUMBER() OVER (PARTITION BY clientID ORDER BY TRY_CAST(totalExposure AS FLOAT) DESC) AS rn
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd
    ),
    cr_dedup AS (
      SELECT CreditAccount, Amount,
        ROW_NUMBER() OVER (PARTITION BY CreditAccount ORDER BY TRY_CAST(Amount AS FLOAT) DESC) AS rn
      FROM [dbo].[Credits] WITH (NOLOCK)
    )
    SELECT
      CAST(ld.CreditAccount AS VARCHAR(50))                                      AS credit_id,
      CAST(ld.PersonalID    AS VARCHAR(50))                                      AS personal_id,
      COALESCE(cu.name + ' ' + cu.surname, CAST(ld.PersonalID AS VARCHAR(50)))  AS full_name,
      COALESCE(cu.name,    '')                                                   AS name,
      COALESCE(cu.surname, '')                                                   AS surname,
      COALESCE(cu.City, cu.Branch, '')                                           AS city,
      CASE
        WHEN TRY_CAST(ld.DueDays AS FLOAT) >= 90 THEN 'NPL — 90+ DPD'
        WHEN TRY_CAST(ld.DueDays AS FLOAT) >= 60 THEN 'Substandard — 60–89 DPD'
        WHEN TRY_CAST(ld.DueDays AS FLOAT) >= 30 THEN 'Watch — 30–59 DPD'
        ELSE 'Monitor'
      END                                                                        AS alert_type,
      CASE
        WHEN TRY_CAST(ld.DueDays AS FLOAT) >= 60 THEN 'critical'
        WHEN TRY_CAST(ld.DueDays AS FLOAT) >= 30 THEN 'high'
        ELSE 'medium'
      END                                                                        AS severity,
      TRY_CAST(ld.DueDays AS FLOAT)                                             AS due_days,
      COALESCE('Stage ' + CAST(rp.Stage AS VARCHAR), 'N/A')                    AS stage,
      COALESCE(TRY_CAST(rp.totalExposure AS FLOAT), TRY_CAST(cr.Amount AS FLOAT), 0) AS exposure,
      fb.triggered_date                                                          AS triggered_date
    FROM latest_dpd ld
    LEFT JOIN [dbo].[Customer] cu WITH (NOLOCK) ON cu.PersonalID = ld.PersonalID
    LEFT JOIN cr_dedup  cr ON cr.CreditAccount = ld.CreditAccount AND cr.rn = 1
    LEFT JOIN rp_dedup  rp ON rp.clientID      = ld.PersonalID    AND rp.rn = 1
    LEFT JOIN first_breach fb ON fb.CreditAccount = ld.CreditAccount
    ${ALERT_WHERE}
    ORDER BY TRY_CAST(ld.DueDays AS FLOAT) DESC
    OFFSET @offset ROWS FETCH NEXT ${PAGE_SIZE} ROWS ONLY
  `, { mcd, mdid, d6m: d6mStr, pattern, offset, sevFilter, stgFilter }, 30000)

  const cntQ = query<{ total: number }>(`
    WITH latest_dpd AS (
      SELECT CreditAccount, PersonalID, DueDays,
        ROW_NUMBER() OVER (PARTITION BY CreditAccount ORDER BY TRY_CAST(DueDays AS FLOAT) DESC) AS rn
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE dateID = @mdid
    ),
    rp_dedup AS (
      SELECT clientID, Stage,
        ROW_NUMBER() OVER (PARTITION BY clientID ORDER BY TRY_CAST(totalExposure AS FLOAT) DESC) AS rn
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd
    )
    SELECT COUNT(*) AS total
    FROM latest_dpd ld
    LEFT JOIN [dbo].[Customer] cu WITH (NOLOCK) ON cu.PersonalID = ld.PersonalID
    LEFT JOIN rp_dedup rp ON rp.clientID = ld.PersonalID AND rp.rn = 1
    ${ALERT_WHERE}
  `, { mcd, mdid, pattern, sevFilter, stgFilter }, 30000)

  const [rows, countRows] = await Promise.all([dataQ, cntQ])
  return { rows, total: countRows[0]?.total ?? 0 }
}

export async function getAlertTrend(): Promise<AlertTrend[]> {
  const cached = rc<AlertTrend[]>('alertTrend'); if (cached) return cached
  // Pre-compute date thresholds — avoids full DueDaysDaily history scan
  // 18-month window captures all relevant "first breach" events for the 6-month chart;
  // clients delinquent >18 months ago are chronic and excluded by the outer WHERE anyway.
  const d18m = new Date(); d18m.setMonth(d18m.getMonth() - 18)
  const d18mStr = d18m.toISOString().slice(0, 10)
  const d6m = new Date(); d6m.setMonth(d6m.getMonth() - 6)
  const ym6m = d6m.toISOString().slice(0, 7)   // 'yyyy-mm' for outer WHERE comparison
  const result = await query<AlertTrend>(`
    -- Monthly NEW entries into delinquency in the last 6 months.
    -- Looks back 18 months for first-breach detection — clients first delinquent
    -- before that window are chronic and correctly excluded from the 6-month chart.
    WITH all_breaches AS (
      SELECT PersonalID, MIN(LEFT(dateID, 7)) AS first_ever_breach_month
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE TRY_CAST(DueDays AS FLOAT) >= 30 AND dateID >= @d18m
      GROUP BY PersonalID
    )
    SELECT first_ever_breach_month AS month, COUNT(*) AS count
    FROM all_breaches
    WHERE first_ever_breach_month >= @ym6m
    GROUP BY first_ever_breach_month
    ORDER BY first_ever_breach_month
  `, { d18m: d18mStr, ym6m })
  sc('alertTrend', result, EWI_TTL); return result
}

export async function getCardSpendAlerts(): Promise<CardSpendAlert[]> {
  if (_cardSpend && Date.now() < _cardSpendExp) return _cardSpend
  // Pre-compute first day of month 3 months ago — enables index seek on trans_date string column
  const d3m = new Date(); d3m.setMonth(d3m.getMonth() - 3); d3m.setDate(1)
  const d3mStr = d3m.toISOString().slice(0, 10)
  const result = await query<CardSpendAlert>(`
    -- Card accounts with MoM spend acceleration > 30% (most recent month)
    WITH monthly AS (
      SELECT Account, LEFT(trans_date, 7) AS spend_month,
        SUM(TRY_CAST(Ammount AS FLOAT)) AS monthly_spend
      FROM [dbo].[CC_Event_LOG] WITH (NOLOCK)
      WHERE trans_date >= @d3m
      GROUP BY Account, LEFT(trans_date, 7)
    ),
    with_prev AS (
      -- Compute LAG once — avoids the triple window-function invocation in original
      SELECT Account, spend_month, monthly_spend,
        LAG(monthly_spend) OVER (PARTITION BY Account ORDER BY spend_month) AS prev_spend,
        ROW_NUMBER() OVER (PARTITION BY Account ORDER BY spend_month DESC) AS rn
      FROM monthly
    )
    SELECT TOP 5
      COALESCE(ca.PersonalID, '') AS personal_id,
      wp.Account                  AS account,
      ROUND(wp.monthly_spend, 0)  AS current_spend,
      ROUND((wp.monthly_spend - wp.prev_spend) * 100.0 / NULLIF(wp.prev_spend, 0), 1) AS mom_growth_pct
    FROM with_prev wp
    LEFT JOIN [dbo].[Cards] ca WITH (NOLOCK) ON ca.NoCards = wp.Account
    WHERE wp.rn = 1 AND wp.prev_spend > 0
      AND (wp.monthly_spend - wp.prev_spend) * 100.0 / wp.prev_spend > 30
    ORDER BY mom_growth_pct DESC
  `, { d3m: d3mStr })
  _cardSpend = result; _cardSpendExp = Date.now() + EWI_TTL
  return result
}

export async function getOverdraftDependency(): Promise<OverdraftDependency[]> {
  if (_overdraftDep && Date.now() < _overdraftExp) return _overdraftDep
  // Pre-compute 12-month cutoff — enables index seek on ta.Date string column
  const d12m = new Date(); d12m.setMonth(d12m.getMonth() - 12)
  const d12mStr = d12m.toISOString().slice(0, 10)
  const result = await query<OverdraftDependency>(`
    WITH monthly_od AS (
      SELECT a.PersonalID, REPLACE(LEFT(ta.Date, 7), '.', '-') AS usage_month
      FROM [dbo].[TAccounts] ta WITH (NOLOCK)
      JOIN [dbo].[Accounts] a WITH (NOLOCK) ON ta.NoAccount = a.NoAccount
      WHERE TRY_CAST(ta.Amount AS FLOAT) < 0
        AND ta.Date >= @d12m
      GROUP BY a.PersonalID, REPLACE(LEFT(ta.Date, 7), '.', '-')
    )
    SELECT TOP 5 PersonalID AS personal_id, COUNT(DISTINCT usage_month) AS months_with_overdraft,
      CASE WHEN COUNT(DISTINCT usage_month) >= 6 THEN 'Critical' WHEN COUNT(DISTINCT usage_month) >= 3 THEN 'Warning' ELSE 'Watch' END AS severity
    FROM monthly_od GROUP BY PersonalID HAVING COUNT(DISTINCT usage_month) >= 3
    ORDER BY months_with_overdraft DESC
  `, { d12m: d12mStr })
  _overdraftDep = result; _overdraftExp = Date.now() + EWI_TTL
  return result
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export async function getHighestRiskClient(): Promise<string> {
  const mcd = await maxCalcDate()
  const rows = await query<{ personal_id: string }>(`
    SELECT TOP 1 clientID AS personal_id FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
    WHERE CalculationDate = @mcd AND Stage = 3 ORDER BY TRY_CAST(totalExposure AS FLOAT) DESC
  `, { mcd })
  return rows[0]?.personal_id ?? ''
}

/** Loads the full risk profile for a single client.
 * @param personalId - Customer.PersonalID (primary key)
 * @returns ClientProfile or null if not found
 */
export async function getClientProfile(personalId: string): Promise<ClientProfile | null> {
  const [mcd, mdid, pcd] = await Promise.all([maxCalcDate(), maxDateID(), prevCalcDate()])
  // Pre-compute date strings so SQL can seek on the string-stored dateID column
  // instead of applying DATEADD/GETDATE() row-by-row (non-sargable, forces full scan)
  const d12m = new Date(); d12m.setMonth(d12m.getMonth() - 12)
  const d24m = new Date(); d24m.setMonth(d24m.getMonth() - 24)
  const d12mStr = d12m.toISOString().slice(0, 10)
  const d24mStr = d24m.toISOString().slice(0, 10)
  const rows = await query<ClientProfile>(`
    -- Resolve this client's RiskPortfolio contract numbers once (seeks on indexed clientID)
    WITH client_contracts AS (
      SELECT contractNumber
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE clientID = @personalId AND CalculationDate = @mcd
    ),
    client_contracts_all AS (
      SELECT contractNumber
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE clientID = @personalId
    ),
    latest_dpd AS (
      SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS DueDays
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE dateID = @mdid AND PersonalID = @personalId
      GROUP BY PersonalID
    ),
    max_dpd_12m AS (
      SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS max_due_days_12m
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE dateID >= @d12m AND PersonalID = @personalId
      GROUP BY PersonalID
    ),
    max_dpd_24m AS (
      SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS max_due_days_24m
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE dateID >= @d24m AND PersonalID = @personalId
      GROUP BY PersonalID
    ),
    approved_total AS (
      SELECT @personalId AS PersonalID, SUM(TRY_CAST(Amount AS FLOAT)) AS total_approved
      FROM [dbo].[Credits] WITH (NOLOCK)
      WHERE NoCredit IN (SELECT contractNumber FROM client_contracts_all)
    ),
    prev_exp AS (
      SELECT TOP 1 TRY_CAST(totalExposure AS FLOAT) AS prev_exposure
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE clientID = @personalId AND CalculationDate = @pcd
    ),
    income_est AS (
      -- Average monthly inflow from TAccounts — linked via Credits.NoAccount (Accounts.PersonalID ≠ RiskPortfolio.clientID)
      SELECT
        @personalId AS PersonalID,
        SUM(TRY_CAST(ta.Amount AS FLOAT))
          / NULLIF(DATEDIFF(MONTH,
              MIN(TRY_CAST(ta.Date AS DATE)),
              MAX(TRY_CAST(ta.Date AS DATE))) + 1, 0) AS avg_monthly_income
      FROM [dbo].[TAccounts] ta WITH (NOLOCK)
      JOIN [dbo].[Accounts] a WITH (NOLOCK) ON ta.NoAccount = a.NoAccount
      WHERE a.NoAccount IN (
        SELECT DISTINCT cr_i.NoAccount FROM [dbo].[Credits] cr_i WITH (NOLOCK)
        WHERE cr_i.NoCredit IN (SELECT contractNumber FROM client_contracts_all)
          AND cr_i.NoAccount IS NOT NULL AND LTRIM(RTRIM(cr_i.NoAccount)) != ''
      )
      AND TRY_CAST(ta.Amount AS FLOAT) > 0
    ),
    raw_payments AS (
      -- Filter AmortizationPlan to only this client's credit accounts via IX_AmortizationPlan_PARTIJA.
      SELECT
        PARTIJA                                                           AS CreditAccount,
        COUNT(*)                                                          AS total_payments,
        SUM(CASE WHEN TRY_CAST(OTPLATA AS FLOAT) < NULLIF(TRY_CAST(IZNOS AS FLOAT), 0)
                  AND TRY_CAST(DATUMDOSPECA AS DATE) < GETDATE() THEN 1 ELSE 0 END) AS missed_payments
      FROM [dbo].[AmortizationPlan] WITH (NOLOCK)
      WHERE PARTIJA IN (
        SELECT cr_ap.CreditAccount FROM [dbo].[Credits] cr_ap WITH (NOLOCK)
        WHERE cr_ap.NoCredit IN (SELECT contractNumber FROM client_contracts_all)
      )
      AND TRY_CAST(DATUMDOSPECA AS DATE) <= GETDATE()
      GROUP BY PARTIJA
    ),
    -- aggregate payments to PersonalID level via Credits (linked through RiskPortfolio.contractNumber)
    client_payments AS (
      SELECT @personalId AS PersonalID,
        SUM(COALESCE(rp2.total_payments,  0)) AS total_payments,
        SUM(COALESCE(rp2.missed_payments, 0)) AS missed_payments
      FROM [dbo].[Credits] cr2 WITH (NOLOCK)
      LEFT JOIN raw_payments rp2 ON rp2.CreditAccount = cr2.CreditAccount
      WHERE cr2.NoCredit IN (SELECT contractNumber FROM client_contracts_all)
    )
    SELECT TOP 1
      cu.PersonalID                                                       AS personal_id,
      COALESCE(cu.name + ' ' + cu.surname, cu.PersonalID)               AS full_name,
      COALESCE(cu.City, cu.Branch, 'Unknown')                           AS region,
      COALESCE(cu.Gender, '')                                            AS gender,
      COALESCE(DATEDIFF(YEAR, TRY_CAST(cu.DOB AS DATE), GETDATE()), 0) AS age,
      COALESCE(cu.Occupation, '')                                        AS employment_type,
      COALESCE(cr.CreditAccount, rp.clientID)                           AS credit_id,
      COALESCE(rp.ProductDesc, rp.TypeOfProduct, cr.TypeOfCalculatioin, '') AS product_type,
      COALESCE(TRY_CAST(rp.totalExposure AS FLOAT),
               TRY_CAST(cr.Amount AS FLOAT), 0)                        AS total_exposure,
      COALESCE(TRY_CAST(rp.onBalanceExposure AS FLOAT), 0)             AS on_balance,
      COALESCE(TRY_CAST(rp.TotalOffBalance AS FLOAT), 0)               AS off_balance,
      COALESCE(at2.total_approved, 0)                                   AS approved_amount,
      CASE
        WHEN COALESCE(pe.prev_exposure, 0) > 0
        THEN ROUND(
          (COALESCE(TRY_CAST(rp.totalExposure AS FLOAT), 0) - pe.prev_exposure)
          / pe.prev_exposure * 100.0, 1)
        ELSE NULL
      END                                                               AS exposure_growth_pct,
      COALESCE(ld.DueDays, 0)                                           AS current_due_days,
      COALESCE(md.max_due_days_12m, 0)                                  AS max_due_days_12m,
      COALESCE(md2.max_due_days_24m, 0)                                 AS max_due_days_24m,
      COALESCE(cp.missed_payments, 0)                                   AS missed_payments,
      COALESCE(cp.total_payments, 0)                                    AS total_payments,
      -- DTI: total monthly debt service / avg monthly income * 100
      -- Falls back to 0 when income data is unavailable
      CASE
        WHEN COALESCE(ie.avg_monthly_income, 0) > 0
        THEN ROUND(
          COALESCE(TRY_CAST(cr.InstallmentsAmount AS FLOAT), 0)
          / ie.avg_monthly_income * 100.0, 1)
        ELSE NULL
      END                                                                AS dti_ratio,
      -- % of due installments paid on time
      CASE
        WHEN COALESCE(cp.total_payments, 0) = 0 THEN 0
        ELSE ROUND(100.0 * (COALESCE(cp.total_payments, 0) - COALESCE(cp.missed_payments, 0))
                          / NULLIF(cp.total_payments, 0), 1)
      END                                                                AS repayment_rate_pct,
      COALESCE(DATEDIFF(YEAR,
        TRY_CAST(CAST(TRY_CAST(cr.FromYear AS INT) AS VARCHAR) + '-01-01' AS DATE),
        GETDATE()
      ), 0)                                                              AS tenure_years,
      'Stage ' + CAST(COALESCE(rp.Stage, 1) AS VARCHAR)                AS stage,
      -- Risk score: Stage base (1/4/7) + DPD bucket (0–2) + missed ratio (0–1), capped 10
      ROUND(CASE WHEN (
        CASE COALESCE(rp.Stage, 1) WHEN 3 THEN 7.0 WHEN 2 THEN 4.0 ELSE 1.0 END
        + CASE WHEN COALESCE(ld.DueDays, 0) >= 90 THEN 2.0
               WHEN COALESCE(ld.DueDays, 0) >= 60 THEN 1.5
               WHEN COALESCE(ld.DueDays, 0) >= 30 THEN 1.0
               WHEN COALESCE(ld.DueDays, 0) >  0  THEN 0.5
               ELSE 0.0 END
        + CASE WHEN COALESCE(cp.total_payments, 0) = 0 THEN 0.0
               ELSE COALESCE(cp.missed_payments, 0) * 1.0
                    / NULLIF(cp.total_payments, 0) END
      ) > 10.0 THEN 10.0 ELSE (
        CASE COALESCE(rp.Stage, 1) WHEN 3 THEN 7.0 WHEN 2 THEN 4.0 ELSE 1.0 END
        + CASE WHEN COALESCE(ld.DueDays, 0) >= 90 THEN 2.0
               WHEN COALESCE(ld.DueDays, 0) >= 60 THEN 1.5
               WHEN COALESCE(ld.DueDays, 0) >= 30 THEN 1.0
               WHEN COALESCE(ld.DueDays, 0) >  0  THEN 0.5
               ELSE 0.0 END
        + CASE WHEN COALESCE(cp.total_payments, 0) = 0 THEN 0.0
               ELSE COALESCE(cp.missed_payments, 0) * 1.0
                    / NULLIF(cp.total_payments, 0) END
      ) END, 1)                                                          AS risk_score,
      -- DPD/Stage-only risk tier (distinct from ML model tier which uses prediction scores):
      CASE
        WHEN COALESCE(ld.DueDays, 0) >= 90 OR COALESCE(rp.Stage, 1) = 3 THEN 'default-imminent'
        WHEN COALESCE(ld.DueDays, 0) >= 30 OR COALESCE(rp.Stage, 1) = 2 THEN 'deteriorating'
        ELSE 'stable-watch'
      END                                                                    AS risk_tier,
      -- IFRS 9 SICR backstop: Stage >= 2 OR DPD >= 30
      CASE WHEN COALESCE(rp.Stage, 1) >= 2 OR COALESCE(ld.DueDays, 0) >= 30 THEN 1 ELSE 0 END
                                                                             AS sicr_flagged
    -- Anchor on Customer — all clients visible regardless of RiskPortfolio coverage
    FROM [dbo].[Customer] cu WITH (NOLOCK)
    LEFT JOIN (SELECT clientID, Stage, totalExposure, onBalanceExposure, TotalOffBalance, TypeOfProduct, ProductDesc, contractNumber FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE CalculationDate = @mcd) rp ON rp.clientID = cu.PersonalID
    LEFT JOIN [dbo].[Credits]   cr WITH (NOLOCK) ON cr.NoCredit    = rp.contractNumber
    LEFT JOIN latest_dpd    ld  ON ld.PersonalID  = cu.PersonalID
    LEFT JOIN max_dpd_12m   md  ON md.PersonalID  = cu.PersonalID
    LEFT JOIN max_dpd_24m   md2 ON md2.PersonalID = cu.PersonalID
    LEFT JOIN client_payments cp ON cp.PersonalID = cu.PersonalID
    LEFT JOIN approved_total  at2 ON at2.PersonalID = cu.PersonalID
    LEFT JOIN prev_exp        pe  ON 1 = 1
    LEFT JOIN income_est      ie  ON ie.PersonalID = cu.PersonalID
    WHERE TRY_CAST(cu.PersonalID AS BIGINT) = TRY_CAST(@personalId AS BIGINT)
    ORDER BY COALESCE(TRY_CAST(rp.totalExposure AS FLOAT), TRY_CAST(cr.Amount AS FLOAT), 0) DESC
    OPTION (RECOMPILE, MAXDOP 4)
  `, { personalId, mcd, mdid, pcd, d12m: d12mStr, d24m: d24mStr }, 60000)
  return rows[0] ?? null
}

export async function getClientDPDHistory(personalId: string): Promise<DPDHistory[]> {
  const d7m = new Date(); d7m.setMonth(d7m.getMonth() - 7)
  const ym7m = d7m.toISOString().slice(0, 7)
  return query<DPDHistory>(`
    -- Description: Monthly max DPD over last 7 months for a specific client
    SELECT
      LEFT(dateID, 7)                  AS month,
      MAX(TRY_CAST(DueDays AS FLOAT))  AS due_days
    FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
    WHERE PersonalID = @personalId
      AND dateID >= @ym7m
    GROUP BY LEFT(dateID, 7)
    ORDER BY LEFT(dateID, 7)
  `, { personalId, ym7m })
}

export async function getClientEWI(personalId: string): Promise<ClientEWI> {
  const mdid = await maxDateID()
  const d60d = new Date(); d60d.setDate(d60d.getDate() - 60)
  const d60dStr = d60d.toISOString().slice(0, 10)
  const d30d = new Date(); d30d.setDate(d30d.getDate() - 30)
  const d30dStr = d30d.toISOString().slice(0, 10)
  const d3m = new Date(); d3m.setMonth(d3m.getMonth() - 3)
  const d3mStr = d3m.toISOString().slice(0, 10)
  // Resolve PersonalID → account numbers once in a CTE so subsequent joins hit
  // NoAccount (indexed FK) rather than repeating TRY_CAST(PersonalID) per subquery.
  const rows = await query<ClientEWI>(`
    WITH client_accts AS (
      SELECT NoAccount, TRY_CAST(Balance AS FLOAT) AS balance_num
      FROM [dbo].[Accounts] WITH (NOLOCK)
      WHERE TRY_CAST(PersonalID AS BIGINT) = TRY_CAST(@personalId AS BIGINT)
    ),
    client_cards AS (
      SELECT NoCards
      FROM [dbo].[Cards] WITH (NOLOCK)
      WHERE TRY_CAST(PersonalID AS BIGINT) = TRY_CAST(@personalId AS BIGINT)
    )
    SELECT
      -- Salary inflow: any credits in TAccounts in last 60 days?
      CASE
        WHEN EXISTS (
          SELECT 1 FROM [dbo].[TAccounts] ta WITH (NOLOCK)
          JOIN client_accts ca ON ca.NoAccount = ta.NoAccount
          WHERE TRY_CAST(ta.Amount AS FLOAT) > 0
            AND ta.Date >= @d60d
        ) THEN 'Normal'
        ELSE 'Stopped'
      END                                                        AS salary_inflow,

      -- Overdraft: any account with negative balance?
      CASE
        WHEN EXISTS (SELECT 1 FROM client_accts WHERE balance_num < 0)
        THEN 'Elevated'
        ELSE 'Normal'
      END                                                        AS overdraft,

      -- Card usage: high CC spend in last 30 days?
      CASE
        WHEN (
          SELECT SUM(TRY_CAST(cc.Ammount AS FLOAT))
          FROM client_cards crd
          JOIN [dbo].[CC_Event_LOG] cc WITH (NOLOCK) ON cc.Account = crd.NoCards
          WHERE cc.trans_date >= @d30d
        ) > 500 THEN 'Elevated'
        ELSE 'Normal'
      END                                                        AS card_usage,

      -- Consecutive lates: DueDays > 0 in latest snapshot?
      CASE
        WHEN (
          SELECT MAX(TRY_CAST(DueDays AS FLOAT)) FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
          WHERE PersonalID = @personalId AND dateID = @mdid
        ) > 0 THEN CAST(
          (SELECT COUNT(DISTINCT dateID) FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
           WHERE PersonalID = @personalId AND TRY_CAST(DueDays AS FLOAT) > 0
             AND dateID >= @d3m
          ) AS VARCHAR
        ) + ' late snapshots (3m)'
        ELSE 'Normal'
      END                                                        AS consec_lates
  `, { personalId, mdid, d60d: d60dStr, d30d: d30dStr, d3m: d3mStr }, 60000)
  return rows[0] ?? { salary_inflow: 'Normal', overdraft: 'Normal', card_usage: 'Normal', consec_lates: 'Normal' }
}

/** Lightweight per-client signal snapshot used by the Warnings page action engine. */
export interface ClientSignalSnapshot {
  personal_id: string
  ifrs_stage: number
  current_dpd: number
  max_dpd_12m: number
  missed_payments: number
  total_payments: number
  salary_inflow: string   // 'Normal' | 'Stopped'
  overdraft: string       // 'Normal' | 'Elevated' | 'Chronic'
  card_usage: string      // 'Normal' | 'High'
  consec_lates: string    // '0 months' | '3 months' | '6+ months'
  product_type: string
  repayment_rate: number  // 0–100
}

let _signalsBatch: ClientSignalSnapshot[] | null = null
let _signalsBatchExp = 0
const SIGNALS_TTL = 15 * 60_000

export async function getClientSignalsBatch(): Promise<Record<string, ClientSignalSnapshot>> {
  if (_signalsBatch && Date.now() < _signalsBatchExp) {
    return Object.fromEntries(_signalsBatch.map(r => [r.personal_id, r]))
  }
  const mdid = await maxDateID()
  // Pre-compute string date thresholds so SQL Server can seek on string-stored date columns
  // instead of applying TRY_CONVERT/TRY_CAST to every row (which prevents index use).
  const date12m = new Date(); date12m.setMonth(date12m.getMonth() - 12)
  const date6m  = new Date(); date6m.setMonth(date6m.getMonth() - 6)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const d12m = fmt(date12m), d6m = fmt(date6m)

  const rows = await query<ClientSignalSnapshot>(`
    WITH
    latest_dpd AS (
      SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS current_dpd
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK) WHERE dateID = @mdid GROUP BY PersonalID
    ),
    max_dpd_12m AS (
      SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS max_dpd_12m
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK) WHERE dateID >= @d12m GROUP BY PersonalID
    ),
    payments AS (
      -- Count scheduled installments from AmortizationPlan (not DPD snapshots).
      -- missed_payments = installments where paid amount < scheduled amount (OTPLATA < IZNOS).
      SELECT rp_pay.clientID AS PersonalID,
        SUM(ap_agg.total_payments)  AS total_payments,
        SUM(ap_agg.missed_payments) AS missed_payments
      FROM (
        SELECT PARTIJA AS CreditAccount,
          COUNT(*) AS total_payments,
          SUM(CASE WHEN TRY_CAST(OTPLATA AS FLOAT) < NULLIF(TRY_CAST(IZNOS AS FLOAT), 0)
                    AND TRY_CAST(DATUMDOSPECA AS DATE) < GETDATE() THEN 1 ELSE 0 END) AS missed_payments
        FROM [dbo].[AmortizationPlan] WITH (NOLOCK)
        WHERE TRY_CAST(DATUMDOSPECA AS DATE) <= GETDATE()
        GROUP BY PARTIJA
      ) ap_agg
      JOIN [dbo].[Credits] cr_pay WITH (NOLOCK) ON cr_pay.CreditAccount = ap_agg.CreditAccount
      JOIN (
        SELECT DISTINCT clientID, contractNumber
        FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      ) rp_pay ON rp_pay.contractNumber = cr_pay.NoCredit
      GROUP BY rp_pay.clientID
    ),
    -- Simplified from gaps-and-islands: client had late payments in 3+ distinct months of last 6m
    consec_late_clients AS (
      SELECT PersonalID
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE dateID >= @d6m AND TRY_CAST(DueDays AS FLOAT) > 0
      GROUP BY PersonalID HAVING COUNT(DISTINCT LEFT(dateID, 7)) >= 3
    )
    SELECT TOP 200
      rp.clientID                                                          AS personal_id,
      COALESCE(rp.Stage, 1)                                               AS ifrs_stage,
      COALESCE(ld.current_dpd, 0)                                         AS current_dpd,
      COALESCE(m.max_dpd_12m, 0)                                          AS max_dpd_12m,
      COALESCE(p.missed_payments, 0)                                       AS missed_payments,
      COALESCE(p.total_payments, 1)                                        AS total_payments,
      'Normal'                                                             AS salary_inflow,
      'Normal'                                                             AS overdraft,
      'Normal'                                                             AS card_usage,
      CASE WHEN cl.PersonalID IS NOT NULL THEN '3 months' ELSE '0 months' END AS consec_lates,
      COALESCE(rp.ProductDesc, rp.TypeOfProduct, 'Consumer')              AS product_type,
      CASE
        WHEN COALESCE(p.total_payments, 0) = 0 THEN 0
        ELSE ROUND(
          (CAST(COALESCE(p.total_payments, 0) - COALESCE(p.missed_payments, 0) AS FLOAT)
            / CAST(COALESCE(p.total_payments, 1) AS FLOAT)) * 100, 1)
      END                                                                  AS repayment_rate
    FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY clientID ORDER BY CalculationDate DESC) AS _rn
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
    ) rp
    LEFT JOIN latest_dpd ld          ON ld.PersonalID = rp.clientID
    LEFT JOIN max_dpd_12m m          ON m.PersonalID  = rp.clientID
    LEFT JOIN payments p             ON p.PersonalID  = rp.clientID
    LEFT JOIN consec_late_clients cl ON cl.PersonalID = rp.clientID
    WHERE rp._rn = 1
    ORDER BY COALESCE(rp.Stage, 1) DESC, COALESCE(ld.current_dpd, 0) DESC
  `, { mdid, d12m, d6m }, 60000)   // 60s — batch query scans DueDaysDaily 4× across all clients
  _signalsBatch = rows
  _signalsBatchExp = Date.now() + SIGNALS_TTL
  return Object.fromEntries(rows.map(r => [r.personal_id, r]))
}

export async function getClientProducts(personalId: string): Promise<ClientProduct[]> {
  const [mcd, mdid] = await Promise.all([maxCalcDate(), maxDateID()])
  return query<ClientProduct>(`
    WITH latest_dpd AS (
      SELECT CreditAccount, MAX(TRY_CAST(DueDays AS FLOAT)) AS due_days
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE dateID = @mdid GROUP BY CreditAccount
    )
    SELECT
      LTRIM(RTRIM(cr.CreditAccount))                            AS credit_account,
      COALESCE(rp.ProductDesc, rp.TypeOfProduct, cr.TypeOfCalculatioin, '') AS product_type,
      COALESCE(TRY_CAST(cr.Amount AS FLOAT), 0)               AS approved_amount,
      'Stage ' + CAST(COALESCE(rp.Stage, 1) AS VARCHAR)       AS stage,
      COALESCE(ld.due_days, 0)                                 AS due_days
    FROM [dbo].[Credits] cr WITH (NOLOCK)
    LEFT JOIN [dbo].[RiskPortfolio] rp WITH (NOLOCK)
      ON rp.contractNumber = cr.NoCredit AND rp.CalculationDate = @mcd
    LEFT JOIN latest_dpd ld ON ld.CreditAccount = cr.CreditAccount
    WHERE cr.NoCredit IN (
      SELECT contractNumber FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE clientID = @personalId AND CalculationDate = @mcd
    )
    ORDER BY COALESCE(TRY_CAST(cr.Amount AS FLOAT), 0) DESC
  `, { personalId, mcd, mdid })
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalyticsKPIs(): Promise<AnalyticsKPIs> {
  const cached = rc<AnalyticsKPIs>('analyticsKPIs'); if (cached) return cached
  const [mcd, pcd] = await Promise.all([maxCalcDate(), prevCalcDate()])
  const rows = await query<AnalyticsKPIs>(`
    WITH prev_month AS (
      SELECT clientID, Stage AS prev_stage FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE CalculationDate = @pcd
    ),
    curr_month AS (
      SELECT clientID, Stage AS curr_stage, CalculatedProvision, totalExposure
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE CalculationDate = @mcd
    ),
    -- 90-day cure rate: find the CalculationDate closest to 90 days ago
    prev_90d AS (
      SELECT clientID, Stage AS stage_90d
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = (
        SELECT TOP 1 CalculationDate
        FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
        WHERE TRY_CAST(CalculationDate AS DATE) <= DATEADD(DAY, -90, GETDATE())
        ORDER BY CalculationDate DESC
      )
    )
    SELECT
      ROUND(100.0 * SUM(CASE WHEN c.curr_stage != p.prev_stage THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0), 1)                                     AS stage_migration_rate,
      -- Exposure-weighted provision coverage: SUM(provision) / SUM(exposure) * 100
      ROUND(SUM(TRY_CAST(c.CalculatedProvision AS FLOAT))
            / NULLIF(SUM(TRY_CAST(c.totalExposure AS FLOAT)), 0) * 100, 1) AS provision_coverage,
      -- True 90-day cure rate: clients whose stage improved vs 90 days ago
      ROUND(100.0 * SUM(CASE WHEN p90.stage_90d > c.curr_stage THEN 1 ELSE 0 END)
            / NULLIF(COUNT(p90.stage_90d), 0), 1)                        AS cure_rate_90d
    FROM curr_month c
    JOIN prev_month p ON p.clientID = c.clientID
    LEFT JOIN prev_90d p90 ON p90.clientID = c.clientID
  `, { mcd, pcd })
  const result = rows[0] ?? { stage_migration_rate: 0, provision_coverage: 0, cure_rate_90d: 0 }
  sc('analyticsKPIs', result, TTL); return result
}

export async function getDelinquencyBySegment(): Promise<SegmentDelinquency[]> {
  const cached = rc<SegmentDelinquency[]>('delinquencyBySegment'); if (cached) return cached
  const [mcd, mdid] = await Promise.all([maxCalcDate(), maxDateID()])
  const result = await query<SegmentDelinquency>(`
    WITH latest_dpd AS (
      SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS due_days
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK) WHERE dateID = @mdid GROUP BY PersonalID
    )
    SELECT COALESCE(rp.ProductDesc, rp.TypeOfProduct, 'Other') AS product_type,
      ROUND(100.0 * SUM(CASE WHEN ld.due_days >= 30 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS delinquency_pct
    FROM [dbo].[RiskPortfolio] rp WITH (NOLOCK)
    LEFT JOIN latest_dpd ld ON ld.PersonalID = rp.clientID
    WHERE rp.CalculationDate = @mcd GROUP BY rp.ProductDesc, rp.TypeOfProduct ORDER BY delinquency_pct DESC
  `, { mcd, mdid })
  sc('delinquencyBySegment', result, EWI_TTL); return result
}

export async function getStageMigration(): Promise<StageMigration[]> {
  const cached = rc<StageMigration[]>('stageMigration'); if (cached) return cached
  const [mcd, pcd] = await Promise.all([maxCalcDate(), prevCalcDate()])
  const result = await query<StageMigration>(`
    WITH prev AS (
      SELECT clientID, Stage AS prev_stage FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE CalculationDate = @pcd
    ),
    curr AS (
      SELECT clientID, Stage AS curr_stage, totalExposure FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE CalculationDate = @mcd
    )
    SELECT
      'Stage ' + CAST(p.prev_stage AS VARCHAR) AS from_stage,
      'Stage ' + CAST(c.curr_stage AS VARCHAR) AS to_stage,
      COUNT(*)                                  AS count,
      SUM(TRY_CAST(c.totalExposure AS FLOAT))   AS exposure
    FROM curr c
    JOIN prev p ON p.clientID = c.clientID
    WHERE c.curr_stage != p.prev_stage
    GROUP BY p.prev_stage, c.curr_stage
    ORDER BY p.prev_stage, c.curr_stage
  `, { mcd, pcd })
  sc('stageMigration', result, EWI_TTL); return result
}

export async function getProvisionByProduct(): Promise<ProvisionByProduct[]> {
  const cached = rc<ProvisionByProduct[]>('provisionByProduct'); if (cached) return cached
  const mcd = await maxCalcDate()
  const result = await query<ProvisionByProduct>(`
    SELECT COALESCE(ProductDesc, TypeOfProduct, 'Other') AS product_type,
      ROUND(AVG(100.0 * TRY_CAST(CalculatedProvision AS FLOAT) / NULLIF(TRY_CAST(totalExposure AS FLOAT), 0)), 1) AS provision_pct
    FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
    WHERE CalculationDate = @mcd AND TRY_CAST(totalExposure AS FLOAT) > 0
    GROUP BY ProductDesc, TypeOfProduct ORDER BY provision_pct DESC
  `, { mcd })
  sc('provisionByProduct', result, EWI_TTL); return result
}

export async function getNPLRatioTrend(): Promise<NPLTrend[]> {
  const cached = rc<NPLTrend[]>('nplRatioTrend'); if (cached) return cached
  const d6m = new Date(); d6m.setMonth(d6m.getMonth() - 6)
  const ym6m = d6m.toISOString().slice(0, 7)
  const result = await query<NPLTrend>(`
    -- Description: Monthly NPL ratio (Stage 3 exposure / total exposure) over last 6 months
    SELECT TOP 6
      LEFT(CalculationDate, 7)                                                    AS month,
      ROUND(100.0 * SUM(CASE WHEN Stage = 3 THEN TRY_CAST(totalExposure AS FLOAT) ELSE 0 END)
            / NULLIF(SUM(TRY_CAST(totalExposure AS FLOAT)), 0), 2)               AS npl_ratio_pct,
      SUM(CASE WHEN Stage = 3 THEN TRY_CAST(totalExposure AS FLOAT) ELSE 0 END)  AS npl_exposure
    FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
    WHERE LEFT(CalculationDate, 7) >= @ym6m
    GROUP BY LEFT(CalculationDate, 7)
    ORDER BY LEFT(CalculationDate, 7)
  `, { ym6m })
  sc('nplRatioTrend', result, EWI_TTL); return result
}

export async function getRollrateMatrix(): Promise<RollrateCell[]> {
  const cached = rc<RollrateCell[]>('rollrateMatrix'); if (cached) return cached
  // Pre-resolve both snapshot dates (cached) so the query can seek by dateID = @x
  // instead of running 4 × SELECT DISTINCT dateID full-scans inside the CTE.
  const [mdid, pdid] = await Promise.all([maxDateID(), prevDateID()])
  const result = await query<RollrateCell>(`
    WITH prev_snap AS (
      SELECT CreditAccount,
        CASE
          WHEN TRY_CAST(DueDays AS FLOAT) = 0               THEN '0 - Current'
          WHEN TRY_CAST(DueDays AS FLOAT) BETWEEN 1  AND 29 THEN '1-29 DPD'
          WHEN TRY_CAST(DueDays AS FLOAT) BETWEEN 30 AND 59 THEN '30-59 DPD'
          WHEN TRY_CAST(DueDays AS FLOAT) BETWEEN 60 AND 89 THEN '60-89 DPD'
          ELSE '90+ DPD'
        END AS from_bucket
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE dateID = @pdid
    ),
    curr_snap AS (
      SELECT CreditAccount,
        CASE
          WHEN TRY_CAST(DueDays AS FLOAT) = 0               THEN '0 - Current'
          WHEN TRY_CAST(DueDays AS FLOAT) BETWEEN 1  AND 29 THEN '1-29 DPD'
          WHEN TRY_CAST(DueDays AS FLOAT) BETWEEN 30 AND 59 THEN '30-59 DPD'
          WHEN TRY_CAST(DueDays AS FLOAT) BETWEEN 60 AND 89 THEN '60-89 DPD'
          ELSE '90+ DPD'
        END AS to_bucket
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE dateID = @mdid
    ),
    transitions AS (
      SELECT p.from_bucket, c.to_bucket, COUNT(*) AS transitions
      FROM prev_snap p JOIN curr_snap c ON c.CreditAccount = p.CreditAccount
      GROUP BY p.from_bucket, c.to_bucket
    ),
    row_totals AS (
      SELECT from_bucket, SUM(transitions) AS row_total
      FROM transitions GROUP BY from_bucket
    )
    SELECT
      t.from_bucket,
      t.to_bucket,
      t.transitions,
      ROUND(100.0 * t.transitions / NULLIF(rt.row_total, 0), 1) AS rate_pct
    FROM transitions t
    JOIN row_totals rt ON rt.from_bucket = t.from_bucket
    ORDER BY t.from_bucket, t.to_bucket
  `, { mdid, pdid }, 45000)
  sc('rollrateMatrix', result, EWI_TTL); return result
}

export async function getVintageAnalysis(): Promise<VintageRow[]> {
  const cached = rc<VintageRow[]>('vintageAnalysis'); if (cached) return cached
  const mdid = await maxDateID()
  const result = await query<VintageRow>(`
    WITH dpd AS (
      SELECT CreditAccount, MAX(TRY_CAST(DueDays AS FLOAT)) AS due_days
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK) WHERE dateID = @mdid GROUP BY CreditAccount
    )
    SELECT TOP 6
      cr.FromYear                                                                 AS vintage_year,
      COUNT(DISTINCT cr.CreditAccount)                                            AS loan_count,
      ROUND(100.0 * SUM(CASE WHEN d.due_days >= 30 THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0), 1)                                            AS delinquency_rate_pct
    FROM [dbo].[Credits] cr WITH (NOLOCK)
    LEFT JOIN dpd d ON d.CreditAccount = cr.CreditAccount
    WHERE cr.FromYear IS NOT NULL
      AND TRY_CAST(cr.FromYear AS INT) >= YEAR(GETDATE()) - 5
    GROUP BY cr.FromYear
    ORDER BY cr.FromYear
  `, { mdid })
  sc('vintageAnalysis', result, EWI_TTL); return result
}

export async function getECLProvisionGap(): Promise<ECLGapRow[]> {
  const cached = rc<ECLGapRow[]>('eclProvisionGap'); if (cached) return cached
  const mcd = await maxCalcDate()
  const result = await query<ECLGapRow>(`
    SELECT Stage AS stage, SUM(TRY_CAST(totalExposure AS FLOAT)) AS total_exposure,
      SUM(TRY_CAST(CalculatedProvision AS FLOAT)) AS calculated_ecl,
      SUM(TRY_CAST(totalExposure AS FLOAT)) - SUM(TRY_CAST(CalculatedProvision AS FLOAT)) AS provision_gap,
      ROUND(100.0 * SUM(TRY_CAST(CalculatedProvision AS FLOAT)) / NULLIF(SUM(TRY_CAST(totalExposure AS FLOAT)), 0), 1) AS coverage_ratio_pct
    FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
    WHERE CalculationDate = @mcd GROUP BY Stage ORDER BY Stage
  `, { mcd })
  sc('eclProvisionGap', result, EWI_TTL); return result
}

export async function getECLByStage(): Promise<ECLByStage[]> {
  const cached = rc<ECLByStage[]>('eclByStage'); if (cached) return cached
  const mcd = await maxCalcDate()
  const result = await query<ECLByStage>(`
    -- Description: IFRS 9 ECL — bank provision vs SPECTRA ECL (Stage 1=1%, Stage 2=5%, Stage 3=20%)
    SELECT
      Stage                                                                       AS stage,
      COALESCE(stageDescr, 'Stage ' + CAST(Stage AS VARCHAR))                    AS stage_descr,
      COUNT(*)                                                                    AS loan_count,
      ROUND(SUM(TRY_CAST(totalExposure AS FLOAT)), 0)                             AS total_exposure,
      ROUND(SUM(TRY_CAST(CalculatedProvision AS FLOAT)), 0)                       AS bank_provision,
      ROUND(SUM(TRY_CAST(totalExposure AS FLOAT) *
        CASE Stage WHEN 1 THEN 0.01 WHEN 2 THEN 0.05 ELSE 0.20 END), 0)          AS calculated_ecl,
      ROUND(SUM(TRY_CAST(CalculatedProvision AS FLOAT)) - SUM(TRY_CAST(totalExposure AS FLOAT) *
        CASE Stage WHEN 1 THEN 0.01 WHEN 2 THEN 0.05 ELSE 0.20 END), 0)          AS provision_gap
    FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
    WHERE CalculationDate = @mcd
    GROUP BY Stage, stageDescr ORDER BY Stage
  `, { mcd })
  sc('eclByStage', result, EWI_TTL); return result
}

export async function getRepaymentSummary(): Promise<RepaymentSummary> {
  const cached = rc<RepaymentSummary>('repaymentSummary'); if (cached) return cached
  const rows = await query<RepaymentSummary>(`
    -- Description: Repayment breakdown — full / partial / critical installments
    WITH rates AS (
      SELECT TRY_CAST(OTPLATA AS FLOAT) / NULLIF(TRY_CAST(ANUITET AS FLOAT), 0) AS rate
      FROM [dbo].[AmortizationPlan] WITH (NOLOCK)
      WHERE TRY_CAST(ANUITET AS FLOAT) > 0 AND TRY_CAST(DATUMDOSPECA AS DATE) <= GETDATE()
    )
    SELECT
      ROUND(100.0 * SUM(CASE WHEN rate >= 1.0                THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0), 1)                   AS full_pct,
      ROUND(100.0 * SUM(CASE WHEN rate >= 0.5 AND rate < 1.0 THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0), 1)                   AS partial_pct,
      ROUND(100.0 * SUM(CASE WHEN rate < 0.5               THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0), 1)                   AS critical_pct
    FROM rates
  `)
  const result = rows[0] ?? { full_pct: 0, partial_pct: 0, critical_pct: 0 }
  sc('repaymentSummary', result, EWI_TTL); return result
}

export async function getInterestAtRisk(): Promise<InterestAtRisk[]> {
  const cached = rc<InterestAtRisk[]>('interestAtRisk'); if (cached) return cached
  const mcd = await maxCalcDate()
  const result = await query<InterestAtRisk>(`
    SELECT Stage AS stage, COALESCE(stageDescr, 'Stage ' + CAST(Stage AS VARCHAR)) AS stage_descr,
      COUNT(*) AS client_count, ROUND(SUM(TRY_CAST(totalExposure AS FLOAT)), 0) AS at_risk_exposure,
      ROUND(AVG(TRY_CAST([Effective Interest Rate] AS FLOAT)), 2) AS avg_interest_rate,
      ROUND(SUM(TRY_CAST(totalExposure AS FLOAT) * TRY_CAST([Effective Interest Rate] AS FLOAT) / 100), 0) AS interest_income_at_risk
    FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
    WHERE Stage IN (2, 3) AND CalculationDate = @mcd
    GROUP BY Stage, stageDescr ORDER BY Stage
  `, { mcd })
  sc('interestAtRisk', result, EWI_TTL); return result
}

export async function getPDByRating(): Promise<PDByRating[]> {
  const cached = rc<PDByRating[]>('pdByRating'); if (cached) return cached
  const mcd = await maxCalcDate()
  const result = await query<PDByRating>(`
    SELECT TOP 10 BankPreviousMonthRating AS rating_last_month, COUNT(*) AS total_clients,
      SUM(CASE WHEN Stage = 3 THEN 1 ELSE 0 END) AS defaulted,
      ROUND(SUM(CASE WHEN Stage = 3 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 1) AS pd_pct
    FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
    WHERE BankPreviousMonthRating IS NOT NULL AND CalculationDate = @mcd
    GROUP BY BankPreviousMonthRating ORDER BY pd_pct DESC
  `, { mcd })
  sc('pdByRating', result, EWI_TTL); return result
}

export interface FastDefaultAlert {
  credit_account: string
  personal_id: string
  vintage_year: number
  amount: number
  product_type: string
  current_dpd: number
}

export async function getCoverageByStage(): Promise<CoverageByStage[]> {
  const cached = rc<CoverageByStage[]>('coverageByStage'); if (cached) return cached
  const [mcd, pcd] = await Promise.all([maxCalcDate(), prevCalcDate()])
  const result = await query<CoverageByStage>(`
    WITH prev_calc AS (
      SELECT Stage,
        ROUND(100.0 * SUM(TRY_CAST(CalculatedProvision AS FLOAT)) / NULLIF(SUM(TRY_CAST(totalExposure AS FLOAT)), 0), 1) AS prev_cov
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE CalculationDate = @pcd GROUP BY Stage
    ),
    curr_calc AS (
      SELECT Stage,
        ROUND(100.0 * SUM(TRY_CAST(CalculatedProvision AS FLOAT)) / NULLIF(SUM(TRY_CAST(totalExposure AS FLOAT)), 0), 1) AS curr_cov
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE CalculationDate = @mcd GROUP BY Stage
    )
    SELECT
      c.Stage                                          AS stage,
      COALESCE(p.prev_cov, 0)                         AS prev_coverage_pct,
      c.curr_cov                                      AS curr_coverage_pct,
      ROUND(c.curr_cov - COALESCE(p.prev_cov, 0), 1) AS mom_change_pct
    FROM curr_calc c
    LEFT JOIN prev_calc p ON p.Stage = c.Stage
    ORDER BY c.Stage
  `, { mcd, pcd })
  sc('coverageByStage', result, EWI_TTL); return result
}

export async function getFastDefaultAlerts(): Promise<FastDefaultAlert[]> {
  const cached = rc<FastDefaultAlert[]>('fastDefaultAlerts'); if (cached) return cached
  const mdid = await maxDateID()
  const result = await query<FastDefaultAlert>(`
    SELECT cr.CreditAccount AS credit_account, cr.PersonalID AS personal_id,
      cr.FromYear AS vintage_year, ROUND(TRY_CAST(cr.Amount AS FLOAT), 0) AS amount,
      COALESCE(cr.TypeOfCalculatioin, 'N/A') AS product_type, d.due_days AS current_dpd
    FROM [dbo].[Credits] cr WITH (NOLOCK)
    JOIN (
      SELECT CreditAccount, MAX(TRY_CAST(DueDays AS FLOAT)) AS due_days
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK) WHERE dateID = @mdid GROUP BY CreditAccount
    ) d ON d.CreditAccount = cr.CreditAccount
    WHERE TRY_CAST(cr.FromYear AS INT) >= YEAR(GETDATE()) - 1 AND d.due_days >= 30
    ORDER BY d.due_days DESC
  `, { mdid })
  sc('fastDefaultAlerts', result, TTL); return result
}

// ─── Paginated Client Table ────────────────────────────────────────────────────

export interface ClientTableRow {
  personal_id: string
  full_name: string
  name: string
  surname: string
  email: string
  phone: string
  city: string
  address: string
  dob: string
  gender: string
  occupation: string
  status: string
  customer_type: string
  branch: string
  date_of_register: string
  product_type: string
  exposure: number
  stage: string
  last_activity: string
  current_dpd: number
  is_resolved: boolean
}



export interface ClientFilters {
  stage?:  string   // '' | '1' | '2' | '3' | 'NA'
  dpd?:    string   // '' | '0' | '1' | '31' | '90'
  status?: string   // '' | 'Active' | 'Inactive' | 'Suspended' | 'Deceased'
}

/** Returns a paginated, filtered client list for the portfolio table.
 * @param q - Search query
 * @param page - 1-based page number
 * @param filters - Optional ClientFilters
 * @returns Paginated ClientTableRow array and total count
 */
export async function getClientsPaginated(
  q: string,
  page: number,
  filters: ClientFilters = {}
): Promise<{ rows: ClientTableRow[]; total: number }> {
  const offset       = (Math.max(1, page) - 1) * PAGE_SIZE
  const [mcd, mdid]  = await Promise.all([maxCalcDate(), maxDateID(), ensureResolutionsTable()])
  const pattern      = `%${q}%`
  const stageFilter  = filters.stage  ?? ''
  const dpdFilter    = filters.dpd    ?? ''
  const statusFilter = filters.status ?? ''

  // Cache all no-filter/no-search pages — key includes page number, invalidates when ML pipeline updates dates
  const isDefaultFilter = !q && !stageFilter && !dpdFilter && !statusFilter
  if (isDefaultFilter) {
    const ck = `clientsPaged_p${page}_${mcd}_${mdid}`
    const cached = rc<{ rows: ClientTableRow[]; total: number }>(ck)
    if (cached) return cached
  }

  const commonParams = { mcd, mdid, pattern, stageFilter, statusFilter }

  const dataQ = query<ClientTableRow>(`
    WITH rp_raw AS (
      SELECT clientID, COALESCE(ProductDesc, TypeOfProduct, '') AS TypeOfProduct, Stage,
        TRY_CAST(totalExposure AS FLOAT) AS exposure,
        CalculationDate AS last_activity,
        ROW_NUMBER() OVER (PARTITION BY clientID ORDER BY TRY_CAST(totalExposure AS FLOAT) DESC) AS rn
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd
    ),
    latest_rp AS (
      SELECT clientID, TypeOfProduct, Stage, exposure, last_activity FROM rp_raw WHERE rn = 1
    ),
    latest_dpd AS (
      SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS current_dpd
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
      WHERE dateID = @mdid GROUP BY PersonalID
    ),
    cu_dedup AS (
      SELECT PersonalID, name, surname, email, Tel, City, Address, DOB, Gender,
             Occupation, Status, CustomerType, Branch, DateOfRegister,
             ROW_NUMBER() OVER (PARTITION BY PersonalID ORDER BY (SELECT NULL)) AS rn
      FROM [dbo].[Customer] WITH (NOLOCK)
    )
    SELECT
      cu.PersonalID                                                         AS personal_id,
      COALESCE(cu.name + ' ' + cu.surname, cu.PersonalID)                 AS full_name,
      COALESCE(cu.name,            '')                                     AS name,
      COALESCE(cu.surname,         '')                                     AS surname,
      COALESCE(cu.email,           '')                                     AS email,
      COALESCE(cu.Tel,             '')                                     AS phone,
      COALESCE(cu.City, cu.Branch, 'Unknown')                             AS city,
      COALESCE(cu.Address,         '')                                     AS address,
      COALESCE(CAST(cu.DOB AS VARCHAR(30)), '')                            AS dob,
      COALESCE(cu.Gender,          '')                                     AS gender,
      COALESCE(cu.Occupation,      '')                                     AS occupation,
      COALESCE(cu.Status,          '')                                     AS status,
      COALESCE(cu.CustomerType,    '')                                     AS customer_type,
      COALESCE(cu.Branch,          '')                                     AS branch,
      COALESCE(CAST(cu.DateOfRegister AS VARCHAR(30)), '')                 AS date_of_register,
      COALESCE(rp.TypeOfProduct, '')                                        AS product_type,
      COALESCE(rp.exposure,        0)                                      AS exposure,
      COALESCE('Stage ' + CAST(rp.Stage AS VARCHAR), 'N/A')               AS stage,
      COALESCE(CAST(rp.last_activity AS VARCHAR(30)), '')                  AS last_activity,
      COALESCE(ld.current_dpd,     0)                                      AS current_dpd,
      CASE WHEN cr.client_id IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS is_resolved
    FROM cu_dedup cu
    INNER JOIN latest_rp rp ON rp.clientID = cu.PersonalID
    LEFT  JOIN latest_dpd ld ON ld.PersonalID = cu.PersonalID
    LEFT  JOIN [dbo].[ClientResolutions] cr WITH (NOLOCK) ON cr.client_id = cu.PersonalID
    WHERE cu.rn = 1
      AND (cu.PersonalID LIKE @pattern
       OR (COALESCE(cu.name, '') + ' ' + COALESCE(cu.surname, '')) LIKE @pattern)
      AND (@stageFilter  = '' OR (@stageFilter = 'NA' AND rp.Stage IS NULL) OR CAST(rp.Stage AS VARCHAR) = @stageFilter)
      AND (@dpdFilter    = ''
           OR (@dpdFilter = '0'  AND COALESCE(ld.current_dpd, 0) = 0)
           OR (@dpdFilter = '1'  AND COALESCE(ld.current_dpd, 0) BETWEEN 1 AND 30)
           OR (@dpdFilter = '31' AND COALESCE(ld.current_dpd, 0) BETWEEN 31 AND 90)
           OR (@dpdFilter = '90' AND COALESCE(ld.current_dpd, 0) > 90))
      AND (@statusFilter = '' OR cu.Status = @statusFilter)
    ORDER BY rp.Stage DESC, rp.exposure DESC
    OFFSET @offset ROWS FETCH NEXT ${PAGE_SIZE} ROWS ONLY
  `, { ...commonParams, dpdFilter, offset }, 15000)

  // Count query: skip the DueDaysDaily GROUP BY entirely when no DPD filter is active.
  // DueDaysDaily can be very large — the GROUP BY is the main bottleneck on the count path.
  const cntQ = dpdFilter
    ? query<{ total: number }>(`
        WITH rp_raw AS (
          SELECT clientID, Stage,
            ROW_NUMBER() OVER (PARTITION BY clientID ORDER BY TRY_CAST(totalExposure AS FLOAT) DESC) AS rn
          FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
          WHERE CalculationDate = @mcd
        ),
        latest_rp AS (
          SELECT clientID, Stage FROM rp_raw WHERE rn = 1
        ),
        latest_dpd AS (
          SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS current_dpd
          FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
          WHERE dateID = @mdid GROUP BY PersonalID
        )
        SELECT COUNT(*) AS total
        FROM (
          SELECT cu.PersonalID
          FROM [dbo].[Customer] cu WITH (NOLOCK)
          INNER JOIN latest_rp rp  ON rp.clientID   = cu.PersonalID
          LEFT  JOIN latest_dpd ld ON ld.PersonalID = cu.PersonalID
          WHERE (cu.PersonalID LIKE @pattern
             OR (COALESCE(cu.name, '') + ' ' + COALESCE(cu.surname, '')) LIKE @pattern)
            AND (@stageFilter  = '' OR (@stageFilter = 'NA' AND rp.Stage IS NULL) OR CAST(rp.Stage AS VARCHAR) = @stageFilter)
            AND (@dpdFilter    = ''
                 OR (@dpdFilter = '0'  AND COALESCE(ld.current_dpd, 0) = 0)
                 OR (@dpdFilter = '1'  AND COALESCE(ld.current_dpd, 0) BETWEEN 1 AND 30)
                 OR (@dpdFilter = '31' AND COALESCE(ld.current_dpd, 0) BETWEEN 31 AND 90)
                 OR (@dpdFilter = '90' AND COALESCE(ld.current_dpd, 0) > 90))
            AND (@statusFilter = '' OR cu.Status = @statusFilter)
          GROUP BY cu.PersonalID
        ) AS dedupd
      `, { ...commonParams, dpdFilter }, 15000)
    : query<{ total: number }>(`
        WITH rp_raw AS (
          SELECT clientID, Stage,
            ROW_NUMBER() OVER (PARTITION BY clientID ORDER BY TRY_CAST(totalExposure AS FLOAT) DESC) AS rn
          FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
          WHERE CalculationDate = @mcd
        ),
        latest_rp AS (
          SELECT clientID, Stage FROM rp_raw WHERE rn = 1
        )
        SELECT COUNT(DISTINCT cu.PersonalID) AS total
        FROM [dbo].[Customer] cu WITH (NOLOCK)
        INNER JOIN latest_rp rp ON rp.clientID = cu.PersonalID
        WHERE (cu.PersonalID LIKE @pattern
           OR (COALESCE(cu.name, '') + ' ' + COALESCE(cu.surname, '')) LIKE @pattern)
          AND (@stageFilter  = '' OR (@stageFilter = 'NA' AND rp.Stage IS NULL) OR CAST(rp.Stage AS VARCHAR) = @stageFilter)
          AND (@statusFilter = '' OR cu.Status = @statusFilter)
      `, commonParams, 15000)

  const [rows, countRows] = await Promise.all([dataQ, cntQ])
  const result = { rows, total: countRows[0]?.total ?? 0 }

  if (isDefaultFilter) {
    const ck = `clientsPaged_p${page}_${mcd}_${mdid}`
    sc(ck, result, 60_000)
  }

  return result
}

// ─── Client Search ─────────────────────────────────────────────────────────────

export interface ClientSearchResult {
  personal_id: string
  full_name: string
  stage: string
  exposure: number
  current_due_days: number
  region: string
  frozen?: boolean
}

export async function getFrozenClientIds(): Promise<Set<string>> {
  try {
    const rows = await query<{ clientId: string }>(`
      SELECT DISTINCT clientId FROM [dbo].[ClientActions] WITH (NOLOCK)
      WHERE action IN ('Freeze Account', 'Freeze account', 'Credit Limit Frozen') AND status = 'active'
    `)
    return new Set(rows.map(r => r.clientId))
  } catch {
    return new Set()
  }
}

/** Full-text search across PersonalID, name, and credit account. Returns up to 20 matches.
 * @param q - Search query string
 * @returns Array of lightweight ClientSearchResult rows
 */
export async function searchClients(q: string): Promise<ClientSearchResult[]> {
  const [mcd, mdid] = await Promise.all([maxCalcDate(), maxDateID()])
  return query<ClientSearchResult>(`
    SELECT TOP 20 cu.PersonalID AS personal_id,
      COALESCE(cu.name + ' ' + cu.surname, cu.PersonalID) AS full_name,
      COALESCE('Stage ' + CAST(rp.Stage AS VARCHAR), 'N/A') AS stage,
      COALESCE(TRY_CAST(rp.totalExposure AS FLOAT), 0) AS exposure,
      COALESCE(TRY_CAST(ld.DueDays AS FLOAT), 0) AS current_due_days,
      COALESCE(cu.City, cu.Branch, 'Unknown') AS region
    FROM [dbo].[Customer] cu WITH (NOLOCK)
    LEFT JOIN (SELECT clientID, Stage, totalExposure FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE CalculationDate = @mcd) rp ON rp.clientID = cu.PersonalID
    LEFT JOIN (SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS DueDays FROM [dbo].[DueDaysDaily] WITH (NOLOCK) WHERE dateID = @mdid GROUP BY PersonalID) ld ON ld.PersonalID = cu.PersonalID
    WHERE cu.PersonalID LIKE @q OR (COALESCE(cu.name, '') + ' ' + COALESCE(cu.surname, '')) LIKE @q
    ORDER BY COALESCE(TRY_CAST(rp.totalExposure AS FLOAT), 0) DESC
  `, { mcd, mdid, q: `%${q}%` })
}

export async function getHighRiskClientsList(): Promise<ClientSearchResult[]> {
  const [mcd, mdid] = await Promise.all([maxCalcDate(), maxDateID()])
  return query<ClientSearchResult>(`
    SELECT TOP 100 cu.PersonalID AS personal_id,
      COALESCE(cu.name + ' ' + cu.surname, cu.PersonalID) AS full_name,
      COALESCE('Stage ' + CAST(rp.Stage AS VARCHAR), 'N/A') AS stage,
      COALESCE(TRY_CAST(rp.totalExposure AS FLOAT), 0) AS exposure,
      COALESCE(TRY_CAST(ld.DueDays AS FLOAT), 0) AS current_due_days,
      COALESCE(cu.City, cu.Branch, 'Unknown') AS region
    FROM [dbo].[Customer] cu WITH (NOLOCK)
    LEFT JOIN (SELECT clientID, Stage, totalExposure FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE CalculationDate = @mcd) rp ON rp.clientID = cu.PersonalID
    LEFT JOIN (SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS DueDays FROM [dbo].[DueDaysDaily] WITH (NOLOCK) WHERE dateID = @mdid GROUP BY PersonalID) ld ON ld.PersonalID = cu.PersonalID
    ORDER BY rp.Stage DESC, COALESCE(TRY_CAST(rp.totalExposure AS FLOAT), 0) DESC
  `, { mcd, mdid })
}

export async function getEWIFilteredClients(ewi: string): Promise<ClientSearchResult[]> {
  const [mcd, mdid] = await Promise.all([maxCalcDate(), maxDateID()])
  const d60d = new Date(); d60d.setDate(d60d.getDate() - 60)
  const d60dStr = d60d.toISOString().slice(0, 10)
  const d30d = new Date(); d30d.setDate(d30d.getDate() - 30)
  const d30dStr = d30d.toISOString().slice(0, 10)

  const baseJoins = `
    FROM [dbo].[RiskPortfolio] rp WITH (NOLOCK)
    LEFT JOIN [dbo].[Customer] cu WITH (NOLOCK) ON cu.PersonalID = rp.clientID
    LEFT JOIN (
      SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS DueDays
      FROM [dbo].[DueDaysDaily] WITH (NOLOCK) WHERE dateID = @mdid GROUP BY PersonalID
    ) ld ON ld.PersonalID = rp.clientID`

  const baseSelect = `
    SELECT DISTINCT TOP 50
      rp.clientID AS personal_id,
      COALESCE(cu.name + ' ' + cu.surname, rp.clientID) AS full_name,
      'Stage ' + CAST(rp.Stage AS VARCHAR) AS stage,
      COALESCE(TRY_CAST(rp.totalExposure AS FLOAT), 0) AS exposure,
      COALESCE(ld.DueDays, 0) AS current_due_days,
      COALESCE(cu.City, cu.Branch, 'Unknown') AS region`

  let sql: string
  switch (ewi) {
    case 'salary_stopped':
      sql = `
        WITH recent_salary AS (
          SELECT DISTINCT a.PersonalID
          FROM [dbo].[Accounts] a WITH (NOLOCK)
          JOIN [dbo].[TAccounts] ta WITH (NOLOCK) ON ta.NoAccount = a.NoAccount
          WHERE TRY_CAST(ta.Amount AS FLOAT) > 0
            AND ta.Date >= @d60d
        )
        ${baseSelect}
        ${baseJoins}
        LEFT JOIN recent_salary rs ON rs.PersonalID = rp.clientID
        WHERE rp.CalculationDate = @mcd AND rp.Stage >= 2 AND rs.PersonalID IS NULL
        ORDER BY TRY_CAST(rp.totalExposure AS FLOAT) DESC`
      break
    case 'overdraft':
      sql = `
        ${baseSelect}
        ${baseJoins}
        INNER JOIN (
          SELECT DISTINCT PersonalID FROM [dbo].[Accounts] WITH (NOLOCK)
          WHERE TRY_CAST(Balance AS FLOAT) < 0
        ) od ON od.PersonalID = rp.clientID
        WHERE rp.CalculationDate = @mcd
        ORDER BY TRY_CAST(rp.totalExposure AS FLOAT) DESC`
      break
    case 'card_high':
      sql = `
        ${baseSelect}
        ${baseJoins}
        INNER JOIN [dbo].[Cards] ca WITH (NOLOCK) ON ca.PersonalID = rp.clientID
        INNER JOIN (
          SELECT Account FROM [dbo].[CC_Event_LOG] WITH (NOLOCK)
          WHERE trans_date >= @d30d
          GROUP BY Account HAVING SUM(TRY_CAST(Ammount AS FLOAT)) > 1000
        ) hs ON hs.Account = ca.NoCards
        WHERE rp.CalculationDate = @mcd
        ORDER BY TRY_CAST(rp.totalExposure AS FLOAT) DESC`
      break
    case 'consec_lates':
      sql = `
        ${baseSelect}
        ${baseJoins}
        INNER JOIN (
          SELECT DISTINCT PersonalID FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
          WHERE TRY_CAST(DueDays AS FLOAT) > 0 AND dateID = @mdid
        ) cl ON cl.PersonalID = rp.clientID
        WHERE rp.CalculationDate = @mcd
        ORDER BY COALESCE(ld.DueDays, 0) DESC, TRY_CAST(rp.totalExposure AS FLOAT) DESC`
      break
    default:
      return getHighRiskClientsList()
  }
  return query<ClientSearchResult>(sql, { mcd, mdid, d60d: d60dStr, d30d: d30dStr })
}

/** Returns the count of critical-severity alerts for the notification badge.
 * @returns Number of active critical alerts
 */
export async function getCriticalAlertCount(): Promise<number> {
  const mdid = await maxDateID()
  const rows = await query<{ cnt: number }>(`
    SELECT COUNT(*) AS cnt FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
    WHERE dateID = @mdid AND TRY_CAST(DueDays AS FLOAT) >= 60
  `, { mdid })
  return rows[0]?.cnt ?? 0
}

// ─── Client Actions (Freeze / Legal / Escalate) ───────────────────────────────

const ENSURE_ACTIONS_TABLE = `
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ClientActions' AND schema_id = SCHEMA_ID('dbo'))
  CREATE TABLE [dbo].[ClientActions] (
    id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    clientId    NVARCHAR(50)     NOT NULL,
    action      NVARCHAR(100)    NOT NULL,
    status      NVARCHAR(20)     NOT NULL DEFAULT 'active',
    actionedBy  NVARCHAR(100)    NOT NULL DEFAULT 'risk_officer',
    notes       NVARCHAR(MAX)    NULL,
    metadata    NVARCHAR(MAX)    NULL,
    createdAt   DATETIME         NOT NULL DEFAULT GETDATE()
  )
ELSE BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('SPECTRA.dbo.ClientActions') AND name = 'notes')
    ALTER TABLE [dbo].[ClientActions] ADD notes NVARCHAR(MAX) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('SPECTRA.dbo.ClientActions') AND name = 'metadata')
    ALTER TABLE [dbo].[ClientActions] ADD metadata NVARCHAR(MAX) NULL;
END
`

// Module-level flag: DDL check runs ONCE per process, not on every call.
// Under load with 10k concurrent users this eliminates ~2 SQL round trips
// per action-related request (getClientActiveActions, getClientCaseHistory,
// recordRichClientAction, resolveClientFreezeAction each called it).
let _actionsTableReady = false
let _actionsTableInFlight: Promise<void> | null = null

async function ensureActionsTable(): Promise<void> {
  if (_actionsTableReady) return
  if (_actionsTableInFlight) return _actionsTableInFlight
  _actionsTableInFlight = query(ENSURE_ACTIONS_TABLE)
    .then(() => { _actionsTableReady = true })
    .finally(() => { _actionsTableInFlight = null })
  return _actionsTableInFlight
}

export interface CaseAction {
  id: string
  action: string
  status: string
  actionedBy: string
  notes: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

/** Write a basic action to the ClientActions table */
export async function recordClientAction(clientId: string, action: string, actionedBy = 'risk_officer'): Promise<void> {
  await ensureActionsTable()
  await query(
    `INSERT INTO [dbo].[ClientActions] (clientId, action, actionedBy) VALUES (@clientId, @action, @actionedBy)`,
    { clientId, action, actionedBy }
  )
}

/** Write a rich action (with notes + metadata) to the ClientActions table.
 * @param clientId - Customer PersonalID
 * @param action - Action label string
 * @param actionedBy - Username of the performing officer
 * @param notes - Optional free-text notes
 * @param metadata - Optional structured JSON metadata
 */
export async function recordRichClientAction(
  clientId: string, action: string, actionedBy: string,
  notes?: string, metadata?: Record<string, unknown>
): Promise<void> {
  await ensureActionsTable()
  await query(
    `INSERT INTO [dbo].[ClientActions] (clientId, action, actionedBy, notes, metadata)
     VALUES (@clientId, @action, @actionedBy, @notes, @metadata)`,
    { clientId, action, actionedBy, notes: notes ?? null, metadata: metadata ? JSON.stringify(metadata) : null }
  )
}

/** Mark all active freeze records for a client as resolved */
export async function resolveClientFreezeAction(clientId: string): Promise<void> {
  await ensureActionsTable()
  await query(
    `UPDATE [dbo].[ClientActions]
     SET status = 'resolved'
     WHERE clientId = @clientId
       AND action IN ('Freeze Account', 'Freeze account', 'Credit Limit Frozen')
       AND status = 'active'`,
    { clientId }
  )
}

/** Returns all currently active actions for a client (freeze checks, watchlist, etc.).
 * @param clientId - Customer PersonalID
 * @returns Array of active action labels with timestamps
 */
export async function getClientActiveActions(clientId: string): Promise<{ action: string; createdAt: string }[]> {
  try {
    await ensureActionsTable()
    return await query<{ action: string; createdAt: string }>(
      `SELECT action, CONVERT(VARCHAR(20), createdAt, 120) AS createdAt
       FROM [dbo].[ClientActions]
       WHERE clientId = @clientId AND status = 'active'
       ORDER BY createdAt DESC`,
      { clientId }
    )
  } catch (err) {
    console.warn('[getClientActiveActions] ClientActions table not accessible:', err)
    return []
  }
}

/** Returns the full action/case history for a client (last 30 entries).
 * @param clientId - Customer PersonalID
 * @returns Array of CaseAction rows ordered newest-first
 */
export async function getClientCaseHistory(clientId: string): Promise<CaseAction[]> {
  try {
    await ensureActionsTable()
    const rows = await query<{ id: string; action: string; status: string; actionedBy: string; notes: string | null; metadata: string | null; createdAt: string }>(
      `SELECT TOP 30 CAST(id AS VARCHAR(36)) AS id, action, status, actionedBy, notes, metadata,
              CONVERT(VARCHAR(20), createdAt, 120) AS createdAt
       FROM [dbo].[ClientActions]
       WHERE clientId = @clientId
       ORDER BY createdAt DESC`,
      { clientId }
    )
    return rows.map(r => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    }))
  } catch {
    return []
  }
}

/** Total positive account balance available for payment sweep */
export async function getClientAccountBalance(clientId: string): Promise<number> {
  try {
    const rows = await query<{ balance: number }>(
      `SELECT COALESCE(SUM(TRY_CAST(Balance AS FLOAT)), 0) AS balance
       FROM [dbo].[Accounts] WITH (NOLOCK)
       WHERE NoAccount IN (
         SELECT DISTINCT cr.NoAccount FROM [dbo].[Credits] cr WITH (NOLOCK)
         WHERE cr.NoCredit IN (SELECT contractNumber FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE TRY_CAST(clientID AS BIGINT) = TRY_CAST(@clientId AS BIGINT))
         AND cr.NoAccount IS NOT NULL AND LTRIM(RTRIM(cr.NoAccount)) != ''
       ) AND TRY_CAST(Balance AS FLOAT) > 0`,
      { clientId }
    )
    return rows[0]?.balance ?? 0
  } catch (err) {
    console.error('[getClientAccountBalance]', (err as Error).message)
    return 0
  }
}

// ─── E-Banking Portal Queries ─────────────────────────────────────────────────

export interface ClientAccount {
  account_no: string
  account_type: string
  balance: number
  amount_on_hold: number
  currency: string
  open_date: string
  branch: string
  account_status: string
}

export interface AccountTransaction {
  account_no: string
  account_type: string
  date: string
  amount: number
  description: string
}

export interface CardTransaction {
  card_no: string
  date: string
  description: string
  amount: number
}

export interface ScheduledPayment {
  credit_account: string
  product_type: string
  due_date: string
  scheduled_amount: number
  paid_amount: number
  is_paid: number
}

export interface CreditTransaction {
  credit_account: string
  product_type: string
  date: string
  kind: string
  amount: number
}

export async function getClientAccounts(clientId: string): Promise<ClientAccount[]> {
  try {
    const rows = await query<ClientAccount>(`
      SELECT
        LTRIM(RTRIM(a.NoAccount))                             AS account_no,
        COALESCE(a.AccountType, 'Current Account')           AS account_type,
        COALESCE(TRY_CAST(a.Balance AS FLOAT), 0)            AS balance,
        COALESCE(TRY_CAST(a.amountonhold AS FLOAT), 0)       AS amount_on_hold,
        COALESCE(a.Currency, 'EUR')                          AS currency,
        COALESCE(a.OpenDate, '')                               AS open_date,
        COALESCE(a.Branch, '')                                  AS branch,
        COALESCE(a.AccountStatus, '')                             AS account_status
      FROM [dbo].[Accounts] a WITH (NOLOCK)
      WHERE a.NoAccount IN (
        SELECT DISTINCT cr.NoAccount FROM [dbo].[Credits] cr WITH (NOLOCK)
        WHERE cr.NoCredit IN (SELECT contractNumber FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE TRY_CAST(clientID AS BIGINT) = TRY_CAST(@clientId AS BIGINT))
        AND cr.NoAccount IS NOT NULL AND LTRIM(RTRIM(cr.NoAccount)) != ''
      )
      ORDER BY COALESCE(TRY_CAST(a.Balance AS FLOAT), 0) DESC
    `, { clientId })
    return rows
  } catch (err) { console.error('[getClientAccounts] ERROR', clientId, (err as Error).message); return [] }
}

export async function getClientAccountTransactions(clientId: string, limit = 30): Promise<AccountTransaction[]> {
  try {
    return await query<AccountTransaction>(`
      SELECT TOP (@limit)
        ta.NoAccount                                          AS account_no,
        COALESCE(a.AccountType, 'Account')                   AS account_type,
        CONVERT(VARCHAR(10), TRY_CAST(ta.Date AS DATE), 23) AS date,
        COALESCE(TRY_CAST(ta.Amount AS FLOAT), 0)           AS amount,
        COALESCE(ta.TDescription1, '')                        AS description
      FROM [dbo].[TAccounts] ta WITH (NOLOCK)
      JOIN [dbo].[Accounts] a WITH (NOLOCK) ON a.NoAccount = ta.NoAccount
      WHERE a.NoAccount IN (
        SELECT DISTINCT cr.NoAccount FROM [dbo].[Credits] cr WITH (NOLOCK)
        WHERE cr.NoCredit IN (SELECT contractNumber FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE TRY_CAST(clientID AS BIGINT) = TRY_CAST(@clientId AS BIGINT))
        AND cr.NoAccount IS NOT NULL AND LTRIM(RTRIM(cr.NoAccount)) != ''
      )
        AND ta.Amount IS NOT NULL
        AND ta.Date IS NOT NULL
      ORDER BY ta.Date DESC
    `, { clientId, limit })
  } catch (err) { console.error('[getClientAccountTransactions]', clientId, (err as Error).message); return [] }
}

export async function getClientCardTransactions(clientId: string, limit = 20): Promise<CardTransaction[]> {
  try {
    return await query<CardTransaction>(`
      SELECT TOP (@limit)
        cc.Account                                                AS card_no,
        CONVERT(VARCHAR(10), TRY_CAST(cc.trans_date AS DATE), 23) AS date,
        COALESCE(cc.EventID, 'Card Transaction')                  AS description,
        COALESCE(TRY_CAST(cc.Ammount AS FLOAT), 0)               AS amount
      FROM [dbo].[CC_Event_LOG] cc WITH (NOLOCK)
      WHERE cc.Account IN (
        SELECT NoCards FROM [dbo].[Cards] WITH (NOLOCK)
        WHERE TRY_CAST(PersonalID AS BIGINT) = TRY_CAST(@clientId AS BIGINT)
      )
      AND cc.trans_date IS NOT NULL
      ORDER BY cc.trans_date DESC
    `, { clientId, limit })
  } catch (err) { console.error('[getClientCardTransactions]', clientId, (err as Error).message); return [] }
}

export async function getClientUpcomingPayments(clientId: string): Promise<ScheduledPayment[]> {
  try {
    return await query<ScheduledPayment>(`
      SELECT TOP 60
        ap.PARTIJA                                               AS credit_account,
        COALESCE(cr.TypeOfCalculatioin, 'Loan')                 AS product_type,
        CONVERT(VARCHAR(10), TRY_CAST(ap.DATUMDOSPECA AS DATE), 23) AS due_date,
        COALESCE(TRY_CAST(ap.ANUITET AS FLOAT), 0)              AS scheduled_amount,
        COALESCE(TRY_CAST(ap.OTPLATA AS FLOAT), 0)              AS paid_amount,
        CASE WHEN COALESCE(TRY_CAST(ap.OTPLATA AS FLOAT), 0) >= COALESCE(TRY_CAST(ap.ANUITET AS FLOAT), 0) * 0.9
             THEN 1 ELSE 0 END                                  AS is_paid
      FROM [dbo].[AmortizationPlan] ap WITH (NOLOCK)
      JOIN [dbo].[Credits] cr WITH (NOLOCK) ON cr.CreditAccount = ap.PARTIJA
      WHERE cr.NoCredit IN (
        SELECT contractNumber FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE TRY_CAST(clientID AS BIGINT) = TRY_CAST(@clientId AS BIGINT)
      )
        AND ap.DATUMDOSPECA IS NOT NULL
      ORDER BY ap.DATUMDOSPECA ASC
    `, { clientId })
  } catch (err) { console.error('[getClientUpcomingPayments]', clientId, (err as Error).message); return [] }
}

export async function getClientCreditTransactions(clientId: string, limit = 20): Promise<CreditTransaction[]> {
  try {
    return await query<CreditTransaction>(`
      SELECT TOP (@limit)
        tc.CreditAccount                                         AS credit_account,
        COALESCE(cr.TypeOfCalculatioin, 'Loan')                 AS product_type,
        CONVERT(VARCHAR(10), TRY_CAST(tc.Date AS DATE), 23)    AS date,
        COALESCE(tc.Kind, 'Payment')                            AS kind,
        COALESCE(TRY_CAST(tc.Amount AS FLOAT), 0)              AS amount
      FROM [dbo].[TCredits] tc WITH (NOLOCK)
      JOIN [dbo].[Credits] cr WITH (NOLOCK) ON cr.CreditAccount = tc.CreditAccount
      WHERE cr.NoCredit IN (
        SELECT contractNumber FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE TRY_CAST(clientID AS BIGINT) = TRY_CAST(@clientId AS BIGINT)
      )
        AND tc.Date IS NOT NULL
      ORDER BY tc.Date DESC
    `, { clientId, limit })
  } catch (err) { console.error('[getClientCreditTransactions]', clientId, (err as Error).message); return [] }
}


// ─── E-Banking Portal Extended Queries ─────────────────────────────────────────

export interface ClientPersonalInfo {
  full_name: string
  dob: string
  gender: string
  city: string
  address: string
  phone: string
  email: string
  branch: string
  occupation: string
  resident: string
  customer_type: string
  date_of_register: string
  status: string
}

export interface ClientLoanDetail {
  credit_account: string
  no_credit: string
  product_type: string
  currency: string
  original_amount: number
  installments_amount: number
  interest_rate: number
  period_months: number
  from_date: string
  to_date: string
  status: string
  branch: string
  stage: string
  due_days: number
}

export interface ClientCard {
  card_no: string
  brand_label: string
  type_label: string
  kind_label: string
  card_status_label: string
  production_date: string
  delivery_date: string
}

export interface AmortizationRow {
  credit_account: string
  instalment_no: number
  due_date: string
  principal: number
  interest: number
  annuity: number
  paid_amount: number
  outstanding: number
  insurance: number
  is_paid: number
}

export async function getClientPersonalInfo(clientId: string): Promise<ClientPersonalInfo | null> {
  try {
    const rows = await query<ClientPersonalInfo>(`
      SELECT TOP 1
        LTRIM(RTRIM(COALESCE(c.name, '') + ' ' + COALESCE(c.surname, '')))  AS full_name,
        COALESCE(c.DOB, '')                                                   AS dob,
        COALESCE(c.Gender, '')                                                AS gender,
        COALESCE(c.City, '')                                                  AS city,
        COALESCE(c.Address, '')                                               AS address,
        COALESCE(c.Tel, '')                                                   AS phone,
        COALESCE(c.email, '')                                                 AS email,
        COALESCE(c.Branch, '')                                                AS branch,
        COALESCE(c.Occupation, '')                                            AS occupation,
        COALESCE(c.Resident, '')                                              AS resident,
        COALESCE(c.CustomerType, '')                                          AS customer_type,
        COALESCE(c.DateOfRegister, '')                                        AS date_of_register,
        COALESCE(c.Status, '')                                                AS status
      FROM [dbo].[Customer] c WITH (NOLOCK)
      WHERE TRY_CAST(c.PersonalID AS BIGINT) = TRY_CAST(@clientId AS BIGINT)
    `, { clientId })
    return rows[0] ?? null
  } catch { return null }
}

export async function getClientLoanDetails(clientId: string): Promise<ClientLoanDetail[]> {
  try {
    const [mcd, mdid] = await Promise.all([maxCalcDate(), maxDateID()])
    return await query<ClientLoanDetail>(`
      WITH latest_dpd AS (
        SELECT CreditAccount, MAX(TRY_CAST(DueDays AS FLOAT)) AS due_days
        FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
        WHERE dateID = @mdid GROUP BY CreditAccount
      )
      SELECT
        cr.CreditAccount                                              AS credit_account,
        COALESCE(cr.NoCredit, '')                                    AS no_credit,
        COALESCE(cr.TypeOfCalculatioin, 'Loan')                     AS product_type,
        COALESCE(cr.Currency, 'EUR')                                 AS currency,
        COALESCE(TRY_CAST(cr.Amount AS FLOAT), 0)                   AS original_amount,
        COALESCE(TRY_CAST(cr.InstallmentsAmount AS FLOAT), 0)       AS installments_amount,
        COALESCE(TRY_CAST(cr.Interes AS FLOAT), 0)                  AS interest_rate,
        COALESCE(TRY_CAST(cr.Period AS INT), 0)                     AS period_months,
        COALESCE(cr.FromYear, '')                                    AS from_date,
        COALESCE(cr.ToYear, '')                                      AS to_date,
        COALESCE(cr.STATUS, '')                                      AS status,
        COALESCE(cr.Branch, '')                                      AS branch,
        'Stage ' + CAST(COALESCE(rp.Stage, 1) AS VARCHAR)          AS stage,
        COALESCE(ld.due_days, 0)                                     AS due_days
      FROM [dbo].[RiskPortfolio] rp WITH (NOLOCK)
      JOIN [dbo].[Credits] cr WITH (NOLOCK) ON cr.NoCredit = rp.contractNumber
      LEFT JOIN latest_dpd ld ON ld.CreditAccount = cr.CreditAccount
      WHERE TRY_CAST(rp.clientID AS BIGINT) = TRY_CAST(@clientId AS BIGINT) AND rp.CalculationDate = @mcd
      ORDER BY COALESCE(TRY_CAST(cr.Amount AS FLOAT), 0) DESC
    `, { clientId, mcd, mdid })
  } catch { return [] }
}

export async function getClientCards(clientId: string): Promise<ClientCard[]> {
  try {
    return await query<ClientCard>(`
      WITH ranked AS (
        SELECT
          c.NoCards                                                         AS card_no,
          CASE c.brand WHEN '1' THEN 'Visa' WHEN '2' THEN 'Mastercard'
                       WHEN '3' THEN 'Maestro' WHEN '4' THEN 'Visa Electron'
                       WHEN '5' THEN 'Visa/MC' ELSE COALESCE(c.brand,'Unknown') END AS brand_label,
          CASE c.type  WHEN '1' THEN 'Classic' WHEN '2' THEN 'Gold'
                       WHEN '3' THEN 'Platinum' WHEN '4' THEN 'Business'
                       WHEN '5' THEN 'Debit' WHEN '8' THEN 'Prepaid'
                       WHEN '12' THEN 'Standard Debit' WHEN '13' THEN 'Premium Debit'
                       ELSE COALESCE(c.type,'Standard') END                         AS type_label,
          CASE c.kind  WHEN '1' THEN 'Personal' WHEN '2' THEN 'Corporate'
                       ELSE COALESCE(c.kind,'Personal') END                         AS kind_label,
          CASE c.card_status
               WHEN '1'  THEN 'Active'       WHEN '2'  THEN 'Inactive'
               WHEN '3'  THEN 'Blocked'      WHEN '4'  THEN 'Expired'
               WHEN '6'  THEN 'Cancelled'    WHEN '9'  THEN 'Closed'
               WHEN '10' THEN 'Suspended'    WHEN '11' THEN 'Lost/Stolen'
               WHEN '20' THEN 'Pending'
               ELSE COALESCE(c.card_status,'Unknown') END                           AS card_status_label,
          COALESCE(CONVERT(VARCHAR(10), TRY_CAST(c.production_date AS DATE), 23), '') AS production_date,
          COALESCE(CONVERT(VARCHAR(10), TRY_CAST(c.delivery_date AS DATE), 23), '')   AS delivery_date,
          ROW_NUMBER() OVER (PARTITION BY c.NoCards ORDER BY TRY_CAST(c.production_date AS DATE) DESC) AS rn
        FROM [dbo].[Cards] c WITH (NOLOCK)
        WHERE TRY_CAST(c.PersonalID AS BIGINT) = TRY_CAST(@clientId AS BIGINT)
      )
      SELECT card_no, brand_label, type_label, kind_label, card_status_label, production_date, delivery_date
      FROM ranked WHERE rn = 1
      ORDER BY TRY_CAST(production_date AS DATE) DESC
    `, { clientId })
  } catch { return [] }
}

export async function getClientAmortization(clientId: string): Promise<AmortizationRow[]> {
  try {
    return await query<AmortizationRow>(`
      SELECT TOP 200
        ap.PARTIJA                                                          AS credit_account,
        COALESCE(TRY_CAST(ap.RB AS INT), 0)                               AS instalment_no,
        CONVERT(VARCHAR(10), TRY_CAST(ap.DATUMDOSPECA AS DATE), 23)       AS due_date,
        COALESCE(TRY_CAST(ap.IZNOS AS FLOAT), 0)                          AS principal,
        COALESCE(TRY_CAST(ap.KAMATA AS FLOAT), 0)                         AS interest,
        COALESCE(TRY_CAST(ap.ANUITET AS FLOAT), 0)                        AS annuity,
        COALESCE(TRY_CAST(ap.OTPLATA AS FLOAT), 0)                        AS paid_amount,
        COALESCE(TRY_CAST(ap.ZADOLZENO AS FLOAT), 0)                      AS outstanding,
        COALESCE(TRY_CAST(ap.InsuranceAmount AS FLOAT), 0)                AS insurance,
        CASE WHEN COALESCE(TRY_CAST(ap.OTPLATA AS FLOAT), 0) >= COALESCE(TRY_CAST(ap.ANUITET AS FLOAT), 0) * 0.9
             THEN 1 ELSE 0 END                                             AS is_paid
      FROM [dbo].[AmortizationPlan] ap WITH (NOLOCK)
      JOIN [dbo].[Credits] cr WITH (NOLOCK) ON cr.CreditAccount = ap.PARTIJA
      WHERE cr.NoCredit IN (
        SELECT contractNumber FROM [dbo].[RiskPortfolio] WITH (NOLOCK) WHERE TRY_CAST(clientID AS BIGINT) = TRY_CAST(@clientId AS BIGINT)
      )
        AND ap.DATUMDOSPECA IS NOT NULL
      ORDER BY ap.PARTIJA, ap.DATUMDOSPECA ASC
    `, { clientId })
  } catch { return [] }
}
// ─── Watchlist ─────────────────────────────────────────────────────────────────

export interface WatchlistClient {
  personal_id: string
  full_name: string
  stage: string
  exposure: number
  current_due_days: number
  region: string
  added_by: string
  added_at: string
  days_on_watch: number
}

/** All clients currently on the active watchlist with live risk data. */
export async function getWatchlistClients(): Promise<WatchlistClient[]> {
  try {
    const [mcd, mdid] = await Promise.all([maxCalcDate(), maxDateID()])
    return await query<WatchlistClient>(`
      SELECT TOP 200
        ca.clientId                                                                AS personal_id,
        COALESCE(cu.name + ' ' + cu.surname, ca.clientId)                        AS full_name,
        COALESCE('Stage ' + CAST(rp.Stage AS VARCHAR), 'N/A')                    AS stage,
        COALESCE(TRY_CAST(rp.totalExposure AS FLOAT), 0)                         AS exposure,
        COALESCE(TRY_CAST(ld.DueDays AS FLOAT), 0)                               AS current_due_days,
        COALESCE(cu.City, cu.Branch, 'Unknown')                                  AS region,
        ca.actionedBy                                                             AS added_by,
        CONVERT(VARCHAR(20), ca.createdAt, 120)                                  AS added_at,
        DATEDIFF(DAY, ca.createdAt, GETDATE())                                   AS days_on_watch
      FROM [dbo].[ClientActions] ca WITH (NOLOCK)
      LEFT JOIN [dbo].[Customer] cu WITH (NOLOCK)
        ON cu.PersonalID = ca.clientId
      LEFT JOIN (
        SELECT clientID, Stage, totalExposure
        FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
        WHERE CalculationDate = @mcd
      ) rp ON rp.clientID = ca.clientId
      LEFT JOIN (
        SELECT PersonalID, MAX(TRY_CAST(DueDays AS FLOAT)) AS DueDays
        FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
        WHERE dateID = @mdid GROUP BY PersonalID
      ) ld ON ld.PersonalID = ca.clientId
      WHERE ca.action IN ('Add to Watchlist', 'Add to watchlist')
        AND ca.status = 'active'
      ORDER BY ca.createdAt DESC
    `, { mcd, mdid })
  } catch {
    return []
  }
}

/** Count of active watchlisted clients (for sidebar badge). */
export async function getWatchlistCount(): Promise<number> {
  try {
    const rows = await query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[ClientActions] WITH (NOLOCK)
       WHERE action IN ('Add to Watchlist', 'Add to watchlist') AND status = 'active'`
    )
    return rows[0]?.cnt ?? 0
  } catch {
    return 0
  }
}

// ─── Concentration Risk ───────────────────────────────────────────────────────

export interface TopObligor {
  clientID: string
  exposure: number
  stage: number
  pct_of_portfolio: number
}

export interface ConcentrationSegment {
  segment: string
  exposure: number
  client_count: number
}

// Returned alongside concentration segment arrays: portfolio-level HHI pre-computed in SQL
export interface ConcentrationHHI {
  hhi: number
  hhi_label: string
}

export interface ConcentrationSummary {
  total_exposure: number
  top1_pct: number
  top10_pct: number
  hhi_product: number
  hhi_region: number
  large_exposure_count: number
}

export async function getTopObligors(): Promise<TopObligor[]> {
  const cached = rc<TopObligor[]>('topObligors'); if (cached) return cached
  const mcd = await maxCalcDate()
  const rows = await query<{ clientID: string; exposure: number; stage: number; grand_total: number }>(`
    WITH totals AS (
      SELECT SUM(TRY_CAST(totalExposure AS FLOAT)) AS grand_total
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd
    ),
    per_client AS (
      SELECT
        CAST(clientID AS VARCHAR(50)) AS clientID,
        SUM(TRY_CAST(totalExposure AS FLOAT)) AS exposure,
        MAX(Stage) AS stage
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd
      GROUP BY clientID
    )
    SELECT TOP 15
      pc.clientID,
      COALESCE(pc.exposure, 0) AS exposure,
      COALESCE(pc.stage, 1) AS stage,
      t.grand_total
    FROM per_client pc
    CROSS JOIN totals t
    WHERE pc.exposure > 0
    ORDER BY pc.exposure DESC
  `, { mcd })
  const result: TopObligor[] = rows.map(r => ({
    clientID: String(r.clientID),
    exposure: r.exposure ?? 0,
    stage: r.stage ?? 1,
    pct_of_portfolio: r.grand_total > 0 ? Math.round((r.exposure / r.grand_total) * 10000) / 100 : 0,
  }))
  sc('topObligors', result, TTL); return result
}

export async function getConcentrationByProduct(): Promise<ConcentrationSegment[]> {
  const cached = rc<ConcentrationSegment[]>('concProduct'); if (cached) return cached
  const rows = await query<ConcentrationSegment>(`
    SELECT
      COALESCE(TypeOfCalculatioin, 'Other') AS segment,
      SUM(TRY_CAST(Amount AS FLOAT)) AS exposure,
      COUNT(DISTINCT PersonalID) AS client_count
    FROM [dbo].[Credits] WITH (NOLOCK)
    WHERE TRY_CAST(Amount AS FLOAT) > 0
    GROUP BY TypeOfCalculatioin
    ORDER BY exposure DESC
  `)
  sc('concProduct', rows, TTL); return rows
}

/** HHI computed in SQL for product concentration (avoids TypeScript round-trip). */
export async function getProductHHI(): Promise<ConcentrationHHI> {
  const cached = rc<ConcentrationHHI>('productHHI'); if (cached) return cached
  const rows = await query<ConcentrationHHI>(`
    WITH exposure_data AS (
      SELECT
        COALESCE(TypeOfCalculatioin, 'Other') AS seg,
        SUM(TRY_CAST(Amount AS FLOAT)) AS exposure,
        SUM(SUM(TRY_CAST(Amount AS FLOAT))) OVER () AS total_exposure
      FROM [dbo].[Credits] WITH (NOLOCK)
      WHERE TRY_CAST(Amount AS FLOAT) > 0
      GROUP BY TypeOfCalculatioin
    )
    SELECT
      ROUND(SUM(POWER(100.0 * exposure / NULLIF(total_exposure, 0), 2)), 0)         AS hhi,
      CASE
        WHEN SUM(POWER(100.0 * exposure / NULLIF(total_exposure, 0), 2)) >= 2500 THEN 'Highly Concentrated'
        WHEN SUM(POWER(100.0 * exposure / NULLIF(total_exposure, 0), 2)) >= 1500 THEN 'Moderately Concentrated'
        ELSE 'Unconcentrated'
      END                                                                            AS hhi_label
    FROM exposure_data
  `)
  const result = rows[0] ?? { hhi: 0, hhi_label: 'Unconcentrated' }
  sc('productHHI', result, TTL); return result
}

export async function getConcentrationByRegion(): Promise<ConcentrationSegment[]> {
  const cached = rc<ConcentrationSegment[]>('concRegion'); if (cached) return cached
  const mcd = await maxCalcDate()
  const rows = await query<ConcentrationSegment>(`
    WITH rp_filtered AS (
      SELECT clientID, TRY_CAST(totalExposure AS FLOAT) AS exposure
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd AND TRY_CAST(totalExposure AS FLOAT) > 0
    )
    SELECT
      COALESCE(cu.City, cu.Branch, 'Unknown') AS segment,
      SUM(rp.exposure)            AS exposure,
      COUNT(DISTINCT rp.clientID) AS client_count
    FROM rp_filtered rp
    LEFT JOIN [dbo].[Customer] cu WITH (NOLOCK)
      ON TRY_CAST(cu.PersonalID AS BIGINT) = TRY_CAST(rp.clientID AS BIGINT)
    GROUP BY COALESCE(cu.City, cu.Branch, 'Unknown')
    ORDER BY exposure DESC
  `, { mcd })
  sc('concRegion', rows, TTL); return rows
}

/** HHI computed in SQL for geographic concentration (avoids TypeScript round-trip). */
export async function getRegionHHI(): Promise<ConcentrationHHI> {
  const cached = rc<ConcentrationHHI>('regionHHI'); if (cached) return cached
  const mcd = await maxCalcDate()
  const rows = await query<ConcentrationHHI>(`
    WITH rp_filtered AS (
      SELECT clientID, TRY_CAST(totalExposure AS FLOAT) AS exposure
      FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
      WHERE CalculationDate = @mcd AND TRY_CAST(totalExposure AS FLOAT) > 0
    ),
    exposure_data AS (
      SELECT
        COALESCE(cu.City, cu.Branch, 'Unknown') AS seg,
        SUM(rp.exposure) AS exposure,
        SUM(SUM(rp.exposure)) OVER () AS total_exposure
      FROM rp_filtered rp
      LEFT JOIN [dbo].[Customer] cu WITH (NOLOCK)
        ON TRY_CAST(cu.PersonalID AS BIGINT) = TRY_CAST(rp.clientID AS BIGINT)
      GROUP BY COALESCE(cu.City, cu.Branch, 'Unknown')
    )
    SELECT
      ROUND(SUM(POWER(100.0 * exposure / NULLIF(total_exposure, 0), 2)), 0)         AS hhi,
      CASE
        WHEN SUM(POWER(100.0 * exposure / NULLIF(total_exposure, 0), 2)) >= 2500 THEN 'Highly Concentrated'
        WHEN SUM(POWER(100.0 * exposure / NULLIF(total_exposure, 0), 2)) >= 1500 THEN 'Moderately Concentrated'
        ELSE 'Unconcentrated'
      END                                                                            AS hhi_label
    FROM exposure_data
  `, { mcd })
  const result = rows[0] ?? { hhi: 0, hhi_label: 'Unconcentrated' }
  sc('regionHHI', result, TTL); return result
}


// ─── Audit log ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string
  clientId: string
  action: string
  status: string
  actionedBy: string
  notes: string | null
  createdAt: string
}

export interface AuditStats {
  total_today: number
  total_week: number
  active_freezes: number
  total_all: number
}

export async function getAuditLog(limit = 100): Promise<AuditEntry[]> {
  await ensureActionsTable()
  return query<AuditEntry>(
    `SELECT TOP (@limit)
       CAST(id AS VARCHAR(36)) AS id,
       clientId, action, status, actionedBy, notes,
       CONVERT(VARCHAR(20), createdAt, 120) AS createdAt
     FROM [dbo].[ClientActions] WITH (NOLOCK)
     ORDER BY createdAt DESC`,
    { limit }
  )
}

export async function getAuditStats(): Promise<AuditStats> {
  await ensureActionsTable()
  const rows = await query<AuditStats>(
    `SELECT
       ISNULL(SUM(CASE WHEN CAST(createdAt AS DATE) = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END), 0) AS total_today,
       ISNULL(SUM(CASE WHEN createdAt >= DATEADD(DAY,-7,GETDATE()) THEN 1 ELSE 0 END), 0)             AS total_week,
       ISNULL(SUM(CASE WHEN action IN ('Freeze Account','Freeze account','Credit Limit Frozen') AND status='active' THEN 1 ELSE 0 END), 0) AS active_freezes,
       COUNT(*)                                                                                        AS total_all
     FROM [dbo].[ClientActions] WITH (NOLOCK)`
  )
  return rows[0] ?? { total_today: 0, total_week: 0, active_freezes: 0, total_all: 0 }
}

// ─── Cache control ─────────────────────────────────────────────────────────────

/** Flush all in-process result caches. Called by /api/cache/invalidate. */
export function clearAllCaches(): void {
  _maxCalcDate = ''; _maxCalcExp = 0
  _maxDateID   = ''; _maxDateExp  = 0
  _prevCalcDate = ''; _prevCalcExp = 0
  _ewiSummary = null; _ewiExp = 0
  _overdraftDep = null; _overdraftExp = 0
  _cardSpend = null; _cardSpendExp = 0
  _rc.clear()
  // Also flush the ML prediction file cache so fresh EWIPredictions data is returned
  try {
    const { clearPredictionCache } = require('@/lib/predictions') as typeof import('@/lib/predictions')
    clearPredictionCache()
  } catch { /* non-fatal */ }
}
