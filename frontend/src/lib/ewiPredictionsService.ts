/**
 * SPECTRA EWI Predictions Service
 *
 * Production note:
 * The website reads deterioration predictions from SQL, not from local CSVs.
 * The ML pipeline can publish full prediction payloads here, while the existing
 * in-app heuristic generator can still seed simplified rows.
 */

import { query } from '@/lib/db.server'
import type { PredictionRow, ShapRow } from '@/lib/predictions'

const ENSURE_EWI_PREDICTIONS = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'EWIPredictions' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[EWIPredictions] (
  id                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id           NVARCHAR(50)     NOT NULL,
  risk_score          FLOAT            NOT NULL,
  deterioration_risk  NVARCHAR(20)     NOT NULL,
  risk_label          NVARCHAR(32)     NULL,
  key_signals         NVARCHAR(MAX)    NULL,
  ai_reasoning        NVARCHAR(MAX)    NULL,
  exposure            FLOAT            NULL,
  pd_30d              FLOAT            NULL,
  pd_60d              FLOAT            NULL,
  pd_90d              FLOAT            NULL,
  stage_migration_prob FLOAT           NULL,
  dpd_escalation_prob FLOAT            NULL,
  recommended_action  NVARCHAR(MAX)    NULL,
  top_factor_1        NVARCHAR(255)    NULL,
  top_factor_2        NVARCHAR(255)    NULL,
  top_factor_3        NVARCHAR(255)    NULL,
  shap_1              FLOAT            NULL,
  shap_2              FLOAT            NULL,
  shap_3              FLOAT            NULL,
  run_date            DATETIME         NOT NULL DEFAULT GETDATE()
)
`

const ENSURE_EWI_PREDICTION_COLUMNS = `
IF COL_LENGTH('dbo.EWIPredictions', 'risk_label') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD risk_label NVARCHAR(32) NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'exposure') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD exposure FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'pd_30d') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD pd_30d FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'pd_60d') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD pd_60d FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'pd_90d') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD pd_90d FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'stage_migration_prob') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD stage_migration_prob FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'dpd_escalation_prob') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD dpd_escalation_prob FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'recommended_action') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD recommended_action NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'top_factor_1') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD top_factor_1 NVARCHAR(255) NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'top_factor_2') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD top_factor_2 NVARCHAR(255) NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'top_factor_3') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD top_factor_3 NVARCHAR(255) NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'shap_1') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD shap_1 FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'shap_2') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD shap_2 FLOAT NULL;
IF COL_LENGTH('dbo.EWIPredictions', 'shap_3') IS NULL
  ALTER TABLE [dbo].[EWIPredictions] ADD shap_3 FLOAT NULL;
`

const ENSURE_IDX_EWI_PRED = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_EWIPredictions_ClientID'
    AND object_id = OBJECT_ID('dbo.EWIPredictions')
)
CREATE NONCLUSTERED INDEX [IX_EWIPredictions_ClientID]
  ON [dbo].[EWIPredictions] (client_id)
  INCLUDE (risk_score, deterioration_risk, run_date)
`

let _ready = false
let _inFlight: Promise<void> | null = null
let _failedAt = 0

export type DeteriorationRisk = 'Critical' | 'High' | 'Medium' | 'Low'

export interface EWIPredictionRow {
  id:                   string
  client_id:            string
  risk_score:           number
  deterioration_risk:   DeteriorationRisk
  risk_label:           string | null
  key_signals:          string | null
  ai_reasoning:         string | null
  exposure:             number | null
  pd_30d:               number | null
  pd_60d:               number | null
  pd_90d:               number | null
  stage_migration_prob: number | null
  dpd_escalation_prob:  number | null
  recommended_action:   string | null
  top_factor_1:         string | null
  top_factor_2:         string | null
  top_factor_3:         string | null
  shap_1:               number | null
  shap_2:               number | null
  shap_3:               number | null
  run_date:             string
}

export interface PredictionSnapshot {
  prediction: PredictionRow
  shap: ShapRow | null
  raw: EWIPredictionRow
}

function normalizeDeteriorationRisk(label?: string | null): DeteriorationRisk {
  if (label === 'High' || label === 'Medium' || label === 'Low') return label
  return 'Critical'
}

function parseKeySignals(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(v => String(v)).filter(Boolean)
  } catch {
    // fall through to plain-text handling
  }
  return [raw]
}

function snapshotFromRow(row: EWIPredictionRow): PredictionSnapshot {
  const pd90 = row.pd_90d ?? row.risk_score ?? 0
  const pd60 = row.pd_60d ?? pd90
  const pd30 = row.pd_30d ?? pd60
  const riskLabel = row.risk_label ?? row.deterioration_risk ?? 'Low'
  const keySignals = parseKeySignals(row.key_signals)

  const prediction: PredictionRow = {
    clientID: row.client_id,
    prediction_date: row.run_date ? row.run_date.slice(0, 10) : '',
    pd_30d: pd30,
    pd_60d: pd60,
    pd_90d: pd90,
    pd_score: pd90,
    risk_label: riskLabel,
    stage_migration_prob: row.stage_migration_prob ?? 0,
    dpd_escalation_prob: row.dpd_escalation_prob ?? 0,
    recommended_action: row.recommended_action ?? row.ai_reasoning ?? 'Manual review required',
    key_signals: keySignals.join(' | ') || undefined,
    signals: keySignals.join(' | ') || undefined,
    totalExposure: row.exposure ?? undefined,
    exposure: row.exposure ?? undefined,
  }

  const hasShap = Boolean(
    row.top_factor_1 || row.top_factor_2 || row.top_factor_3 ||
    row.shap_1 != null || row.shap_2 != null || row.shap_3 != null
  )

  const shap: ShapRow | null = hasShap ? {
    top_factor_1: row.top_factor_1 ?? '',
    top_factor_2: row.top_factor_2 ?? '',
    top_factor_3: row.top_factor_3 ?? '',
    shap_1: row.shap_1 ?? 0,
    shap_2: row.shap_2 ?? 0,
    shap_3: row.shap_3 ?? 0,
  } : null

  return { prediction, shap, raw: row }
}

export async function ensureEWIPredictionsTable(): Promise<void> {
  if (_ready) return
  if (Date.now() - _failedAt < 10000) return
  if (_inFlight) return _inFlight
  _inFlight = (async () => {
    await query(ENSURE_EWI_PREDICTIONS)
    await query(ENSURE_EWI_PREDICTION_COLUMNS)
    try { await query(ENSURE_IDX_EWI_PRED) } catch { /* non-fatal */ }
    _ready = true
  })().catch(err => { _failedAt = Date.now(); throw err })
    .finally(() => { _inFlight = null })
  return _inFlight
}

export async function upsertEWIPrediction(rec: {
  clientId:            string
  riskScore?:          number | null
  deteriorationRisk?:  string | null
  riskLabel?:          string | null
  keySignals?:         string[]
  aiReasoning?:        string | null
  exposure?:           number | null
  pd30d?:              number | null
  pd60d?:              number | null
  pd90d?:              number | null
  stageMigrationProb?: number | null
  dpdEscalationProb?:  number | null
  recommendedAction?:  string | null
  topFactor1?:         string | null
  topFactor2?:         string | null
  topFactor3?:         string | null
  shap1?:              number | null
  shap2?:              number | null
  shap3?:              number | null
  runDate?:            Date | string | null
}): Promise<void> {
  await ensureEWIPredictionsTable()

  const riskScore = rec.riskScore ?? rec.pd90d ?? 0
  const deteriorationRisk = normalizeDeteriorationRisk(rec.deteriorationRisk ?? rec.riskLabel)
  const runDate = rec.runDate ? new Date(rec.runDate) : new Date()

  await query(
    `MERGE [dbo].[EWIPredictions] AS target
     USING (VALUES (
       @clientId, @riskScore, @deteriorationRisk, @riskLabel, @keySignals, @aiReasoning,
       @exposure, @pd30d, @pd60d, @pd90d, @stageMigrationProb, @dpdEscalationProb,
       @recommendedAction, @topFactor1, @topFactor2, @topFactor3, @shap1, @shap2, @shap3, @runDate
     ))
       AS source (
         client_id, risk_score, deterioration_risk, risk_label, key_signals, ai_reasoning,
         exposure, pd_30d, pd_60d, pd_90d, stage_migration_prob, dpd_escalation_prob,
         recommended_action, top_factor_1, top_factor_2, top_factor_3, shap_1, shap_2, shap_3, run_date
       )
     ON target.client_id = source.client_id
        AND CAST(target.run_date AS DATE) = CAST(source.run_date AS DATE)
     WHEN MATCHED THEN UPDATE SET
       risk_score           = source.risk_score,
       deterioration_risk   = source.deterioration_risk,
       risk_label           = source.risk_label,
       key_signals          = source.key_signals,
       ai_reasoning         = source.ai_reasoning,
       exposure             = source.exposure,
       pd_30d               = source.pd_30d,
       pd_60d               = source.pd_60d,
       pd_90d               = source.pd_90d,
       stage_migration_prob = source.stage_migration_prob,
       dpd_escalation_prob  = source.dpd_escalation_prob,
       recommended_action   = source.recommended_action,
       top_factor_1         = source.top_factor_1,
       top_factor_2         = source.top_factor_2,
       top_factor_3         = source.top_factor_3,
       shap_1               = source.shap_1,
       shap_2               = source.shap_2,
       shap_3               = source.shap_3,
       run_date             = source.run_date
     WHEN NOT MATCHED THEN INSERT (
       client_id, risk_score, deterioration_risk, risk_label, key_signals, ai_reasoning,
       exposure, pd_30d, pd_60d, pd_90d, stage_migration_prob, dpd_escalation_prob,
       recommended_action, top_factor_1, top_factor_2, top_factor_3, shap_1, shap_2, shap_3, run_date
     )
     VALUES (
       source.client_id, source.risk_score, source.deterioration_risk, source.risk_label,
       source.key_signals, source.ai_reasoning, source.exposure, source.pd_30d, source.pd_60d,
       source.pd_90d, source.stage_migration_prob, source.dpd_escalation_prob,
       source.recommended_action, source.top_factor_1, source.top_factor_2, source.top_factor_3,
       source.shap_1, source.shap_2, source.shap_3, source.run_date
     );`,
    {
      clientId: rec.clientId,
      riskScore,
      deteriorationRisk,
      riskLabel: rec.riskLabel ?? null,
      keySignals: rec.keySignals ? JSON.stringify(rec.keySignals) : null,
      aiReasoning: rec.aiReasoning ?? null,
      exposure: rec.exposure ?? null,
      pd30d: rec.pd30d ?? null,
      pd60d: rec.pd60d ?? null,
      pd90d: rec.pd90d ?? null,
      stageMigrationProb: rec.stageMigrationProb ?? null,
      dpdEscalationProb: rec.dpdEscalationProb ?? null,
      recommendedAction: rec.recommendedAction ?? null,
      topFactor1: rec.topFactor1 ?? null,
      topFactor2: rec.topFactor2 ?? null,
      topFactor3: rec.topFactor3 ?? null,
      shap1: rec.shap1 ?? null,
      shap2: rec.shap2 ?? null,
      shap3: rec.shap3 ?? null,
      runDate,
    }
  )
}

async function latestPredictionRows(where = '', params: Record<string, unknown> = {}): Promise<EWIPredictionRow[]> {
  await ensureEWIPredictionsTable()
  return query<EWIPredictionRow>(
    `SELECT
       CAST(id AS VARCHAR(36))         AS id,
       client_id,
       risk_score,
       deterioration_risk,
       risk_label,
       key_signals,
       ai_reasoning,
       exposure,
       pd_30d,
       pd_60d,
       pd_90d,
       stage_migration_prob,
       dpd_escalation_prob,
       recommended_action,
       top_factor_1,
       top_factor_2,
       top_factor_3,
       shap_1,
       shap_2,
       shap_3,
       CONVERT(VARCHAR(30), run_date, 127) AS run_date
     FROM (
       SELECT *,
         ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY run_date DESC) AS rn
       FROM [dbo].[EWIPredictions] WITH (NOLOCK)
     ) t
     WHERE rn = 1
       ${where}
     ORDER BY COALESCE(pd_90d, risk_score) DESC`,
    params
  )
}

export async function getTopPredictions(limit = 100): Promise<EWIPredictionRow[]> {
  await ensureEWIPredictionsTable()
  return query<EWIPredictionRow>(
    `SELECT TOP (@limit)
       CAST(id AS VARCHAR(36))         AS id,
       client_id,
       risk_score,
       deterioration_risk,
       risk_label,
       key_signals,
       ai_reasoning,
       exposure,
       pd_30d,
       pd_60d,
       pd_90d,
       stage_migration_prob,
       dpd_escalation_prob,
       recommended_action,
       top_factor_1,
       top_factor_2,
       top_factor_3,
       shap_1,
       shap_2,
       shap_3,
       CONVERT(VARCHAR(30), run_date, 127) AS run_date
     FROM (
       SELECT *,
         ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY run_date DESC) AS rn
       FROM [dbo].[EWIPredictions] WITH (NOLOCK)
     ) t
     WHERE rn = 1
     ORDER BY COALESCE(pd_90d, risk_score) DESC`,
    { limit }
  )
}

export async function getLatestPredictions(): Promise<EWIPredictionRow[]> {
  return latestPredictionRows()
}

export async function getClientPredictions(clientId: string): Promise<EWIPredictionRow[]> {
  await ensureEWIPredictionsTable()
  return query<EWIPredictionRow>(
    `SELECT TOP 10
       CAST(id AS VARCHAR(36))         AS id,
       client_id,
       risk_score,
       deterioration_risk,
       risk_label,
       key_signals,
       ai_reasoning,
       exposure,
       pd_30d,
       pd_60d,
       pd_90d,
       stage_migration_prob,
       dpd_escalation_prob,
       recommended_action,
       top_factor_1,
       top_factor_2,
       top_factor_3,
       shap_1,
       shap_2,
       shap_3,
       CONVERT(VARCHAR(30), run_date, 127) AS run_date
     FROM [dbo].[EWIPredictions] WITH (NOLOCK)
     WHERE client_id = @clientId
     ORDER BY run_date DESC`,
    { clientId }
  )
}

export async function getLatestPrediction(clientId: string): Promise<EWIPredictionRow | null> {
  const rows = await latestPredictionRows('AND client_id = @clientId', { clientId })
  return rows[0] ?? null
}

export async function getPredictionSnapshot(clientId: string): Promise<PredictionSnapshot | null> {
  const row = await getLatestPrediction(clientId)
  return row ? snapshotFromRow(row) : null
}

export async function getLatestPredictionSnapshots(): Promise<PredictionSnapshot[]> {
  const rows = await getLatestPredictions()
  return rows.map(snapshotFromRow)
}

export async function getPredictionsPaginated(
  q: string,
  page: number,
  riskFilter = ''
): Promise<{ rows: EWIPredictionRow[]; total: number }> {
  await ensureEWIPredictionsTable()
  const offset = (Math.max(1, page) - 1) * 25
  const pattern = q ? `%${q}%` : '%%'

  const dataQ = query<EWIPredictionRow>(
    `SELECT
       CAST(id AS VARCHAR(36)) AS id,
       client_id,
       risk_score,
       deterioration_risk,
       risk_label,
       key_signals,
       ai_reasoning,
       exposure,
       pd_30d,
       pd_60d,
       pd_90d,
       stage_migration_prob,
       dpd_escalation_prob,
       recommended_action,
       top_factor_1,
       top_factor_2,
       top_factor_3,
       shap_1,
       shap_2,
       shap_3,
       CONVERT(VARCHAR(30), run_date, 127) AS run_date
     FROM (
       SELECT *, ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY run_date DESC) AS rn
       FROM [dbo].[EWIPredictions] WITH (NOLOCK)
     ) t
     WHERE rn = 1
       AND (@riskFilter = '' OR deterioration_risk = @riskFilter)
       AND (@pattern = '%%' OR client_id LIKE @pattern)
     ORDER BY COALESCE(pd_90d, risk_score) DESC
     OFFSET @offset ROWS FETCH NEXT 25 ROWS ONLY`,
    { pattern, offset, riskFilter }
  )

  const cntQ = query<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM (
       SELECT *, ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY run_date DESC) AS rn
       FROM [dbo].[EWIPredictions] WITH (NOLOCK)
     ) t
     WHERE rn = 1
       AND (@riskFilter = '' OR deterioration_risk = @riskFilter)
       AND (@pattern = '%%' OR client_id LIKE @pattern)`,
    { pattern, riskFilter }
  )

  const [rows, countRows] = await Promise.all([dataQ, cntQ])
  return { rows, total: countRows[0]?.total ?? 0 }
}
