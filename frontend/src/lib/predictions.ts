import fs from "fs"
import path from "path"

// ─── Multi-path file reader (Vercel-safe) ────────────────────────────────────
function tryReadFile(filename: string): string | null {
  const candidates = [
    path.join(process.cwd(), '..', 'data', 'processed', filename),
    path.join(process.cwd(), 'data', 'processed', filename),
    path.join('/tmp', filename),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8')
    } catch { /* try next */ }
  }
  return null
}



export interface PredictionRow {
  clientID: string
  prediction_date: string
  pd_30d: number           // 30-day default probability (model_default_30d)
  pd_60d: number           // 60-day default probability (model_default_60d)
  pd_90d: number           // 90-day default probability (model_default_90d)
  pd_score: number         // alias for pd_90d — kept for backward compatibility
  risk_label: string       // derived from pd_90d (primary management horizon)
  stage_migration_prob: number
  dpd_escalation_prob: number
  recommended_action: string
  key_signals?: string
  signals?: string
  totalExposure?: number
  exposure?: number
}

export interface ShapRow {
  top_factor_1: string
  top_factor_2: string
  top_factor_3: string
  shap_1: number
  shap_2: number
  shap_3: number
}

export interface PDBand {
  band: string
  min: number
  max: number
  count: number
  pct: number
}

export interface LabelCount {
  label: string
  count: number
  pct: number
  color: string
}

export interface ShapDriver {
  factor: string
  label: string      // human-readable
  frequency: number
  pct: number
}

export interface PortfolioModelStats {
  total_scored: number
  prediction_date: string
  avg_pd: number            // as %
  critical_count: number    // PD >= 0.50
  high_risk_count: number   // PD 0.25–0.50
  label_counts: LabelCount[]
  pd_bands: PDBand[]
  shap_drivers: ShapDriver[]
  top_risk_clients: PredictionRow[]  // top 25 by PD, deduplicated
}

// ─── Factor name formatter ─────────────────────────────────────────────────────

const FACTOR_LABELS: Record<string, string> = {
  exposure_growth_rate:    'Exposure growth rate',
  stage_age_months:        'Time in current stage',
  rating_deterioration:    'Rating deterioration',
  dpd_trend:               'DPD trend',
  cure_rate:               'Repayment rate',
  repayment_rate_pct:      'Repayment rate',
  dti_ratio:               'Debt-to-income ratio',
  missed_payments:         'Missed payments',
  ltv_ratio:               'LTV ratio',
  overdraft_utilisation:   'Overdraft utilisation',
  card_utilisation:        'Card utilisation',
  salary_inflow_drop:      'Salary inflow drop',
  consecutive_lates:       'Consecutive late payments',
}

function labelFactor(raw: string): string {
  return FACTOR_LABELS[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n")
  if (lines.length < 2) return []
  const headers = lines[0].split(",").map(h => h.trim())
  return lines.slice(1).map(line => {
    const values = line.split(",")
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()]))
  })
}

// ─── Individual reads (module-level cached, 15 min TTL) ────────────────────────
// Predictions and SHAP files are written once per ML pipeline run (typically daily).
// Caching at module level avoids repeated disk I/O on every client page load.

let _predictionsCache: PredictionRow[] | null = null
let _predictionsExp = 0
let _shapCache: Record<string, ShapRow> | null = null
let _shapExp = 0
let _riskFlagsCache: Record<string, RiskFlagRow> | null = null
let _riskFlagsExp = 0
const FILE_CACHE_TTL = 15 * 60_000  // 15 minutes

export function readPredictions(): PredictionRow[] {
  if (_predictionsCache && Date.now() < _predictionsExp) return _predictionsCache
  const text = tryReadFile("predictions.csv")
  if (!text) return []
  try {
    const rows = parseCSV(text)
    _predictionsCache = rows.map(r => {
      const pd_90 = parseFloat(r.pd_90d ?? r.pd_score ?? "0") || 0
      const pd_30 = parseFloat(r.pd_30d ?? r.pd_score ?? "0") || 0
      const pd_60 = parseFloat(r.pd_60d ?? r.pd_score ?? "0") || 0
      return {
        clientID:             r.clientID ?? "",
        prediction_date:      r.prediction_date ?? "",
        pd_30d:               pd_30,
        pd_60d:               pd_60,
        pd_90d:               pd_90,
        pd_score:             pd_90,   // backward-compatible alias
        risk_label:           r.risk_label ?? "Low",
        stage_migration_prob: parseFloat(r.stage_migration_prob ?? "0") || 0,
        dpd_escalation_prob:  parseFloat(r.dpd_escalation_prob ?? "0") || 0,
        recommended_action:   r.recommended_action ?? "No action required",
      }
    })
    _predictionsExp = Date.now() + FILE_CACHE_TTL
    return _predictionsCache
  } catch {
    return []
  }
}

export function readShapExplanations(): Record<string, ShapRow> {
  if (_shapCache && Date.now() < _shapExp) return _shapCache
  const text = tryReadFile("shap_explanations.csv")
  if (!text) return {}
  try {
    const rows = parseCSV(text)
    const result: Record<string, ShapRow> = {}
    for (const r of rows) {
      if (!r.clientID) continue
      result[r.clientID] = {
        top_factor_1: r.top_factor_1 ?? "",
        top_factor_2: r.top_factor_2 ?? "",
        top_factor_3: r.top_factor_3 ?? "",
        shap_1: parseFloat(r.shap_1 ?? "0") || 0,
        shap_2: parseFloat(r.shap_2 ?? "0") || 0,
        shap_3: parseFloat(r.shap_3 ?? "0") || 0,
      }
    }
    _shapCache = result
    _shapExp = Date.now() + FILE_CACHE_TTL
    return _shapCache
  } catch {
    return {}
  }
}

// ─── Risk flags ───────────────────────────────────────────────────────────────

export interface RiskFlagRow {
  clientID: string
  flag_zscore_anomaly: boolean
  flag_score_deterioration: boolean
  flag_exposure_spike: boolean
  flag_salary_stopped: boolean
  flag_overdraft_dependent: boolean
  flag_card_acceleration: boolean
  risk_flag_count: number
}

export interface RiskFlagSummary {
  zscore_anomaly: number
  score_deterioration: number
  exposure_spike: number
  salary_stopped: number       // already in EWI but now also from Python pipeline
  overdraft_dependent: number
  card_acceleration: number
  available: boolean           // false when risk_flags.csv has not been run yet
}

export function readRiskFlags(): Record<string, RiskFlagRow> {
  if (_riskFlagsCache && Date.now() < _riskFlagsExp) return _riskFlagsCache
  const text = tryReadFile("risk_flags.csv")
  if (!text) return {}
  try {
    const rows = parseCSV(text)
    const result: Record<string, RiskFlagRow> = {}
    for (const r of rows) {
      if (!r.clientID) continue
      result[r.clientID] = {
        clientID:                r.clientID,
        flag_zscore_anomaly:     r.flag_zscore_anomaly === "True",
        flag_score_deterioration: r.flag_score_deterioration === "True",
        flag_exposure_spike:     r.flag_exposure_spike === "True",
        flag_salary_stopped:     r.flag_salary_stopped === "True",
        flag_overdraft_dependent: r.flag_overdraft_dependent === "True",
        flag_card_acceleration:  r.flag_card_acceleration === "True",
        risk_flag_count:         parseInt(r.risk_flag_count ?? "0") || 0,
      }
    }
    _riskFlagsCache = result
    _riskFlagsExp = Date.now() + FILE_CACHE_TTL
    return _riskFlagsCache
  } catch {
    return {}
  }
}

export function getRiskFlagSummary(): RiskFlagSummary {
  const flags = readRiskFlags()
  const rows = Object.values(flags)
  if (rows.length === 0) {
    return { zscore_anomaly: 0, score_deterioration: 0, exposure_spike: 0, salary_stopped: 0, overdraft_dependent: 0, card_acceleration: 0, available: false }
  }
  return {
    zscore_anomaly:       rows.filter(r => r.flag_zscore_anomaly).length,
    score_deterioration:  rows.filter(r => r.flag_score_deterioration).length,
    exposure_spike:       rows.filter(r => r.flag_exposure_spike).length,
    salary_stopped:       rows.filter(r => r.flag_salary_stopped).length,
    overdraft_dependent:  rows.filter(r => r.flag_overdraft_dependent).length,
    card_acceleration:    rows.filter(r => r.flag_card_acceleration).length,
    available:            true,
  }
}

// ─── Training metadata ────────────────────────────────────────────────────────

export interface TrainingMeta {
  training_date: string
  targets: Record<string, {
    best_model: string | null
    auc: number | null
    skipped?: boolean
  }>
}

export function readTrainingMeta(): TrainingMeta | null {
  const filePath = path.join(process.cwd(), "..", "models", "training_meta.json")
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as TrainingMeta
  } catch {
    return null
  }
}

/** Returns the best-model name for the primary default target, or null. */
export function getPrimaryModelName(): string | null {
  const meta = readTrainingMeta()
  return meta?.targets?.["label_default_90d"]?.best_model ?? null
}

// ─── Portfolio-level model analytics (cached 15 min) ──────────────────────────

const PRED_TTL = 15 * 60_000
let _portfolioStats: PortfolioModelStats | null = null
let _portfolioStatsExp = 0

export function clearPredictionCache(): void {
  _portfolioStats = null
  _portfolioStatsExp = 0
  _predictionsCache = null
  _predictionsExp = 0
  _shapCache = null
  _shapExp = 0
  _riskFlagsCache = null
  _riskFlagsExp = 0
}

const LABEL_ORDER = ['Low', 'Medium', 'High', 'Default imminent', 'Critical']
const LABEL_COLORS: Record<string, string> = {
  'Low':               'var(--green)',
  'Medium':            'var(--amber)',
  'High':              'var(--red)',
  'Default imminent':  '#C43A3A',
  'Critical':          '#7C1D1D',
}

export function getPortfolioModelStats(): PortfolioModelStats {
  if (_portfolioStats && Date.now() < _portfolioStatsExp) return _portfolioStats

  const preds = readPredictions()
  const shap  = readShapExplanations()
  const total = preds.length

  if (total === 0) {
    const empty: PortfolioModelStats = {
      total_scored: 0, prediction_date: '', avg_pd: 0,
      critical_count: 0, high_risk_count: 0,
      label_counts: [], pd_bands: [], shap_drivers: [], top_risk_clients: [],
    }
    return empty
  }

  // Avg PD
  const avgPD = preds.reduce((s, p) => s + p.pd_score, 0) / total
  const criticalCount  = preds.filter(p => p.pd_score >= 0.50).length
  const highRiskCount  = preds.filter(p => p.pd_score >= 0.25 && p.pd_score < 0.50).length
  const predDate       = preds[0]?.prediction_date ?? ''

  // Label distribution
  const labelMap = new Map<string, number>()
  for (const p of preds) labelMap.set(p.risk_label, (labelMap.get(p.risk_label) ?? 0) + 1)
  const label_counts: LabelCount[] = LABEL_ORDER
    .filter(l => labelMap.has(l))
    .map(l => ({
      label: l,
      count: labelMap.get(l)!,
      pct: Math.round(labelMap.get(l)! / total * 1000) / 10,
      color: LABEL_COLORS[l] ?? 'var(--muted)',
    }))

  // PD bands
  const BANDS = [
    { band: '0–5%',   min: 0,    max: 0.05 },
    { band: '5–10%',  min: 0.05, max: 0.10 },
    { band: '10–20%', min: 0.10, max: 0.20 },
    { band: '20–30%', min: 0.20, max: 0.30 },
    { band: '30–50%', min: 0.30, max: 0.50 },
    { band: '50%+',   min: 0.50, max: 1.01 },
  ]
  const pd_bands: PDBand[] = BANDS.map(b => {
    const count = preds.filter(p => p.pd_score >= b.min && p.pd_score < b.max).length
    return { ...b, count, pct: Math.round(count / total * 1000) / 10 }
  })

  // SHAP driver frequency across portfolio
  const factorMap = new Map<string, number>()
  const shapValues = Object.values(shap)
  for (const s of shapValues) {
    for (const f of [s.top_factor_1, s.top_factor_2, s.top_factor_3]) {
      if (f) factorMap.set(f, (factorMap.get(f) ?? 0) + 1)
    }
  }
  const totalFactorRefs = shapValues.length * 3 || 1
  const shap_drivers: ShapDriver[] = Array.from(factorMap.entries())
    .map(([factor, frequency]) => ({
      factor,
      label: labelFactor(factor),
      frequency,
      pct: Math.round(frequency / totalFactorRefs * 1000) / 10,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 8)

  // Top risk clients — deduplicated, sorted by PD desc
  const seen = new Set<string>()
  const top_risk_clients = preds
    .filter(p => { if (seen.has(p.clientID)) return false; seen.add(p.clientID); return true })
    .sort((a, b) => b.pd_score - a.pd_score)
    .slice(0, 25)

  const result: PortfolioModelStats = {
    total_scored:    total,
    prediction_date: predDate,
    avg_pd:          Math.round(avgPD * 10000) / 100,
    critical_count:  criticalCount,
    high_risk_count: highRiskCount,
    label_counts,
    pd_bands,
    shap_drivers,
    top_risk_clients,
  }

  _portfolioStats = result
  _portfolioStatsExp = Date.now() + PRED_TTL
  return result
}
