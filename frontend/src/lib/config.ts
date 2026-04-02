/**
 * SPECTRA — Central Risk Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for ALL business-rule thresholds and regulatory
 * parameters. Every value can be overridden via environment variable.
 *
 * To change a threshold:
 *   1. Update this file AND scripts/config.py in the same commit.
 *   2. For IFRS 9 / Basel-classified parameters, risk-committee sign-off required.
 *   3. Document the reason in the commit message.
 *
 * Regulatory sources referenced in comments:
 *   IFRS 9   — International Financial Reporting Standard 9 (Financial Instruments)
 *   Basel III — Basel Committee on Banking Supervision framework
 *   EBA       — European Banking Authority guidelines
 */

function envNum(key: string, fallback: number): number {
  const v = process.env[key]
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// ─── PD Risk Label Thresholds ─────────────────────────────────────────────────
// Defines the five risk tiers derived from the 90-day PD score.
// Shared with: scripts/predict.py, stress/page.tsx, actionEngine.ts
// Source: Internal credit policy (calibrated to model output distribution)
export const PD_LABELS = {
  DEFAULT_IMMINENT: envNum('PD_THRESHOLD_DEFAULT_IMMINENT', 0.86),
  CRITICAL:         envNum('PD_THRESHOLD_CRITICAL',         0.66),
  HIGH:             envNum('PD_THRESHOLD_HIGH',             0.41),
  MEDIUM:           envNum('PD_THRESHOLD_MEDIUM',           0.21),
} as const

/** Map a 0–1 PD score to its risk label string. */
export function pdToLabel(pd: number): string {
  if (pd >= PD_LABELS.DEFAULT_IMMINENT) return 'Default imminent'
  if (pd >= PD_LABELS.CRITICAL)         return 'Critical'
  if (pd >= PD_LABELS.HIGH)             return 'High'
  if (pd >= PD_LABELS.MEDIUM)           return 'Medium'
  return 'Low'
}

// ─── Tier Derivation ──────────────────────────────────────────────────────────
// Maps PD score to one of three operational tiers used throughout the action engine.
// Source: Internal credit policy
export const TIER = {
  CRITICAL_PD:      envNum('TIER_CRITICAL_PD',      0.66),  // → default-imminent tier
  DETERIORATING_PD: envNum('TIER_DETERIORATING_PD', 0.4),   // → deteriorating tier
} as const

// ─── IFRS 9 / SICR Thresholds ────────────────────────────────────────────────
// Significant Increase in Credit Risk — triggers Stage 1 → Stage 2 migration.
// Source: IFRS 9 §5.5, paragraphs B5.5.1–B5.5.9
export const SICR = {
  PD_THRESHOLD:    envNum('SICR_PD_THRESHOLD',    0.2),   // quantitative PD trigger
  DPD_BACKSTOP:    envNum('SICR_DPD_BACKSTOP',    30),    // rebuttable presumption (IFRS 9 §B5.5.19)
  MISSED_PAYMENTS: envNum('SICR_MISSED_PAYMENTS', 2),     // qualitative backstop
  NPL_DPD:         envNum('SICR_NPL_DPD',         90),    // Stage 2 → 3: 90-day NPL definition
  MORTGAGE_DPD:    envNum('SICR_MORTGAGE_DPD',    60),    // lower threshold for secured (collateral risk)
  STAGE_MIG_PROB:  envNum('SICR_STAGE_MIG_PROB',  0.4),  // model-based migration probability trigger
} as const

// ─── Action Engine Thresholds ────────────────────────────────────────────────
// Govern when recommended actions are triggered for a given client.
// Source: Internal credit policy
export const ACTIONS = {
  FREEZE_PD:               envNum('ACTION_FREEZE_PD',               0.7),
  FREEZE_DPD:              envNum('ACTION_FREEZE_DPD',              30),
  URGENT_CALL_PD:          envNum('ACTION_URGENT_CALL_PD',          0.5),
  URGENT_CALL_DPD_MIN:     envNum('ACTION_URGENT_CALL_DPD_MIN',     30),
  URGENT_CALL_DPD_MAX:     envNum('ACTION_URGENT_CALL_DPD_MAX',     90),
  DPD_ESCALATION_PROB:     envNum('ACTION_DPD_ESCALATION_PROB',     0.4),
  STAGE2_RESTRUCTURE_DPD:  envNum('ACTION_STAGE2_RESTRUCTURE_DPD',  15),
  STAGE2_RESTRUCTURE_PROB: envNum('ACTION_STAGE2_RESTRUCTURE_PROB', 0.25),
  DTI_RESTRUCTURE:         envNum('ACTION_DTI_RESTRUCTURE',         55),   // % DTI
  WATCHLIST_ROUTINE_LOW:   envNum('ACTION_WATCHLIST_ROUTINE_LOW',   0.25),
  WATCHLIST_ROUTINE_HIGH:  envNum('ACTION_WATCHLIST_ROUTINE_HIGH',  0.5),
  MONITOR_PD_LOW:          envNum('ACTION_MONITOR_PD_LOW',          0.15),
  MONITOR_PD_HIGH:         envNum('ACTION_MONITOR_PD_HIGH',         0.25),
} as const

// ─── IFRS 9 ECL Parameters ────────────────────────────────────────────────────
// Parameters for the full PD × LGD × EAD ECL formula (IFRS 9 §5.5).
// ECL_RATES (eclProvisionService.ts) are derived from these — do not set
// the flat rates there directly; change PD / LGD here instead.
//
// Stage 1 (12-month ECL):   PD_12M      × LGD          ≈ 0.0222 × 0.45 = 1%
// Stage 2 (Lifetime ECL):   PD_LIFETIME × LGD          ≈ 0.1111 × 0.45 = 5%
// Stage 3 (Credit-impaired): PD_IMPAIRED × LGD_IMPAIRED = 1.00   × 0.20 = 20%
//
// Sources:
//   PD_12M / PD_LIFETIME: internal model calibration, approved by risk committee
//   LGD: Basel II/III unsecured retail (IRBA floor = 0.45)
//   LGD_IMPAIRED: collateral-adjusted LGD for Stage 3 secured assets (IFRS 9 §B5.5.17)
//
// Risk-committee sign-off required before changing any value.
export const ECL = {
  PD_12M:       envNum('ECL_PD_12M',       0.0222), // Stage 1 — 12-month PD
  PD_LIFETIME:  envNum('ECL_PD_LIFETIME',  0.1111), // Stage 2 — lifetime PD
  PD_IMPAIRED:  envNum('ECL_PD_IMPAIRED',  1.0),    // Stage 3 — credit-impaired (certain default)
  LGD:          envNum('ECL_LGD',          0.45),   // Loss Given Default, unsecured (Basel retail)
  LGD_IMPAIRED: envNum('ECL_LGD_IMPAIRED', 0.20),   // Stage 3 collateral-adjusted LGD
} as const

// ─── Stress Testing ───────────────────────────────────────────────────────────
// PD shock scenarios and LGD assumption for ELR calculation.
// Source: Basel II/III unsecured retail LGD; scenario multipliers by risk committee
export const STRESS = {
  LGD:                envNum('STRESS_LGD',               0.45), // Loss Given Default — Basel unsecured retail
  ADVERSE_MULTIPLIER: envNum('STRESS_ADVERSE_MULTIPLIER', 1.5), // moderate downturn (GDP ~-2%)
  SEVERE_MULTIPLIER:  envNum('STRESS_SEVERE_MULTIPLIER',  2.5), // systemic crisis (GDP ~-5%+)
} as const

// ─── KPI Traffic-Light Thresholds ────────────────────────────────────────────
// Determine red / amber / green colouring on KPI cards and charts.
// Source: Internal portfolio management policy
export const KPI = {
  // NPL ratio (Stage 3 %)
  NPL_RED:   envNum('KPI_NPL_RED',   5),  // % — red above this
  NPL_AMBER: envNum('KPI_NPL_AMBER', 3),  // % — amber between AMBER and RED

  // Stage 2 / SICR rate
  STAGE2_RED:   envNum('KPI_STAGE2_RED',   15), // %
  STAGE2_AMBER: envNum('KPI_STAGE2_AMBER', 8),  // %

  // Portfolio delinquency rate (% clients ≥ 30 DPD) — home dashboard
  DELINQUENCY_RED: envNum('KPI_DELINQUENCY_RED', 10), // %

  // Per-segment delinquency colouring — portfolio page product table
  DELINQUENCY_SEGMENT_RED:   envNum('KPI_DELINQUENCY_SEGMENT_RED',   8), // %
  DELINQUENCY_SEGMENT_AMBER: envNum('KPI_DELINQUENCY_SEGMENT_AMBER', 6), // %

  // DPD coloring on loan tables
  DPD_RED: envNum('KPI_DPD_RED', 30), // days — red at or above

  // Provision coverage ratio
  PROVISION_ADEQUATE: envNum('KPI_PROVISION_ADEQUATE', 95), // % — adequate above
  PROVISION_WARN:     envNum('KPI_PROVISION_WARN',     80), // % — under-provisioned below

  // Cure rate (90-day)
  CURE_RATE_WARN: envNum('KPI_CURE_RATE_WARN', 15), // % — low below

  // Vintage delinquency flagging — analytics page
  VINTAGE_DELINQUENCY_WARN: envNum('KPI_VINTAGE_DELINQUENCY_WARN', 10), // %
} as const

// ─── Concentration Risk Limits ────────────────────────────────────────────────
// Source: Basel III Article 395 (large exposure limit = 25% Tier 1 capital);
//         EBA guidelines on concentration risk (watchlist threshold = 10%)
export const CONCENTRATION = {
  TOP1_OBLIGOR_WARN:         envNum('CONC_TOP1_OBLIGOR_WARN',          10),   // % — EBA watchlist
  TOP10_TOTAL_WARN:          envNum('CONC_TOP10_TOTAL_WARN',           50),   // %
  LARGE_EXPOSURE_MIN_PCT:    envNum('CONC_LARGE_EXPOSURE_MIN_PCT',      2),   // % — floor for "large"
  LARGE_EXPOSURE_COUNT_WARN: envNum('CONC_LARGE_EXPOSURE_COUNT_WARN',   5),   // count
  HHI_CONCENTRATED:          envNum('CONC_HHI_CONCENTRATED',         1500),  // Herfindahl-Hirschman Index — monitor above
  HHI_HIGHLY_CONCENTRATED:   envNum('CONC_HHI_HIGHLY_CONCENTRATED',  2500),  // Regulatory concern — EBA/GL/2018/06
} as const

// ─── Early Warning Indicator Thresholds ──────────────────────────────────────
// Source: Internal credit policy
export const EWI = {
  PD_THRESHOLD: envNum('EWI_PD_THRESHOLD', 0.4), // minimum PD to surface as a warning
} as const

// ─── Cache TTLs ───────────────────────────────────────────────────────────────
export const CACHE = {
  TTL_MS:     envNum('CACHE_TTL_MS',     5 * 60_000),  // 5 min — portfolio / analytics queries
  EWI_TTL_MS: envNum('CACHE_EWI_TTL_MS', 10 * 60_000), // 10 min — EWI aggregate table scans
} as const
