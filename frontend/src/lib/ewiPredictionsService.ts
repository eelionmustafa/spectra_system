/**
 * SPECTRA EWI Predictions Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the EWIPredictions table (DDL-on-first-use).
 *
 * Each row is an ML-driven deterioration prediction for one client, generated
 * by the pipeline or the /api/ewi/fire endpoint.
 *
 * Schema aligns with the index in performance_indexes.sql:
 *   IX_EWIPredictions_ClientID → (client_id) INCLUDE (risk_score, deterioration_risk, run_date)
 */

import { query } from '@/lib/db.server'

// ─── DDL ──────────────────────────────────────────────────────────────────

const ENSURE_EWI_PREDICTIONS = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'EWIPredictions' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[EWIPredictions] (
  id                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id         NVARCHAR(50)     NOT NULL,
  -- 0–1 ML deterioration probability
  risk_score        FLOAT            NOT NULL,
  -- 'Critical' | 'High' | 'Medium' | 'Low'
  deterioration_risk NVARCHAR(20)   NOT NULL,
  -- JSON array of signal strings, e.g. ["Salary stopped","DPD rising"]
  key_signals       NVARCHAR(MAX)    NULL,
  ai_reasoning      NVARCHAR(MAX)    NULL,
  run_date          DATETIME         NOT NULL DEFAULT GETDATE()
)
`

const ENSURE_IDX_EWI_PRED = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_EWIPredictions_ClientID'
    AND object_id = OBJECT_ID('SPECTRA.dbo.EWIPredictions')
)
CREATE NONCLUSTERED INDEX [IX_EWIPredictions_ClientID]
  ON [SPECTRA].[dbo].[EWIPredictions] (client_id)
  INCLUDE (risk_score, deterioration_risk, run_date)
`

// ─── One-time DDL guard ────────────────────────────────────────────────────

let _ready    = false
let _inFlight: Promise<void> | null = null
let _failedAt = 0

export async function ensureEWIPredictionsTable(): Promise<void> {
  if (_ready) return
  // Throttle retries — don't hammer the DB if the last attempt just failed
  if (Date.now() - _failedAt < 10000) return
  if (_inFlight) return _inFlight
  _inFlight = (async () => {
    await query(ENSURE_EWI_PREDICTIONS)
    try { await query(ENSURE_IDX_EWI_PRED) } catch { /* non-fatal */ }
    _ready = true
  })().catch(err => { _failedAt = Date.now(); throw err })
    .finally(() => { _inFlight = null })
  return _inFlight
}

// ─── Types ────────────────────────────────────────────────────────────────

export type DeteriorationRisk = 'Critical' | 'High' | 'Medium' | 'Low'

export interface EWIPredictionRow {
  id:                 string
  client_id:          string
  risk_score:         number
  deterioration_risk: DeteriorationRisk
  /** JSON-encoded string array */
  key_signals:        string | null
  ai_reasoning:       string | null
  run_date:           string
}

// ─── Write ────────────────────────────────────────────────────────────────

export async function upsertEWIPrediction(rec: {
  clientId:          string
  riskScore:         number
  deteriorationRisk: DeteriorationRisk
  keySignals?:       string[]
  aiReasoning?:      string | null
}): Promise<void> {
  await ensureEWIPredictionsTable()
  // MERGE so re-running the pipeline for the same client is idempotent per day
  await query(
    `MERGE [SPECTRA].[dbo].[EWIPredictions] AS target
     USING (VALUES (@clientId, @riskScore, @deteriorationRisk, @keySignals, @aiReasoning))
       AS source (client_id, risk_score, deterioration_risk, key_signals, ai_reasoning)
     ON target.client_id = source.client_id
        AND CAST(target.run_date AS DATE) = CAST(GETDATE() AS DATE)
     WHEN MATCHED THEN UPDATE SET
       risk_score         = source.risk_score,
       deterioration_risk = source.deterioration_risk,
       key_signals        = source.key_signals,
       ai_reasoning       = source.ai_reasoning,
       run_date           = GETDATE()
     WHEN NOT MATCHED THEN INSERT
       (client_id, risk_score, deterioration_risk, key_signals, ai_reasoning)
       VALUES (source.client_id, source.risk_score, source.deterioration_risk, source.key_signals, source.ai_reasoning);`,
    {
      clientId:          rec.clientId,
      riskScore:         rec.riskScore,
      deteriorationRisk: rec.deteriorationRisk,
      keySignals:        rec.keySignals ? JSON.stringify(rec.keySignals) : null,
      aiReasoning:       rec.aiReasoning ?? null,
    }
  )
}

// ─── Read ─────────────────────────────────────────────────────────────────

/**
 * Returns the latest prediction per client, ranked by risk_score descending.
 * Uses a window function to deduplicate, then limits to top N.
 */
export async function getTopPredictions(limit = 100): Promise<EWIPredictionRow[]> {
  await ensureEWIPredictionsTable()
  return query<EWIPredictionRow>(
    `SELECT TOP (@limit)
       CAST(id AS VARCHAR(36))         AS id,
       client_id, risk_score, deterioration_risk,
       key_signals, ai_reasoning,
       CONVERT(VARCHAR(30), run_date, 127) AS run_date
     FROM (
       SELECT *,
         ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY run_date DESC) AS rn
       FROM [SPECTRA].[dbo].[EWIPredictions] WITH (NOLOCK)
     ) t
     WHERE rn = 1
     ORDER BY risk_score DESC`,
    { limit }
  )
}

export async function getClientPredictions(clientId: string): Promise<EWIPredictionRow[]> {
  await ensureEWIPredictionsTable()
  return query<EWIPredictionRow>(
    `SELECT TOP 10
       CAST(id AS VARCHAR(36))         AS id,
       client_id, risk_score, deterioration_risk,
       key_signals, ai_reasoning,
       CONVERT(VARCHAR(30), run_date, 127) AS run_date
     FROM [SPECTRA].[dbo].[EWIPredictions] WITH (NOLOCK)
     WHERE client_id = @clientId
     ORDER BY run_date DESC`,
    { clientId }
  )
}

export async function getPredictionsPaginated(
  q: string,
  page: number,
  riskFilter = ''
): Promise<{ rows: EWIPredictionRow[]; total: number }> {
  await ensureEWIPredictionsTable()
  const offset  = (Math.max(1, page) - 1) * 25
  const pattern = q ? `%${q}%` : '%%'

  const dataQ = query<EWIPredictionRow>(
    `SELECT CAST(id AS VARCHAR(36)) AS id,
       client_id, risk_score, deterioration_risk,
       key_signals, ai_reasoning,
       CONVERT(VARCHAR(30), run_date, 127) AS run_date
     FROM (
       SELECT *, ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY run_date DESC) AS rn
       FROM [SPECTRA].[dbo].[EWIPredictions] WITH (NOLOCK)
     ) t
     WHERE rn = 1
       AND (@riskFilter = '' OR deterioration_risk = @riskFilter)
       AND (@pattern = '%%' OR client_id LIKE @pattern)
     ORDER BY risk_score DESC
     OFFSET @offset ROWS FETCH NEXT 25 ROWS ONLY`,
    { pattern, offset, riskFilter }
  )

  const cntQ = query<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM (
       SELECT *, ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY run_date DESC) AS rn
       FROM [SPECTRA].[dbo].[EWIPredictions] WITH (NOLOCK)
     ) t
     WHERE rn = 1
       AND (@riskFilter = '' OR deterioration_risk = @riskFilter)
       AND (@pattern = '%%' OR client_id LIKE @pattern)`,
    { pattern, riskFilter }
  )

  const [rows, countRows] = await Promise.all([dataQ, cntQ])
  return { rows, total: countRows[0]?.total ?? 0 }
}
