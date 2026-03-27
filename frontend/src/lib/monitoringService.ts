/**
 * SPECTRA Monitoring Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages two tables created on first use:
 *
 *   ClientMonitoring   — per-client review cadence and credit-freeze flag.
 *                        auto-updated by classificationEngine.ts on stage change.
 *                        review_frequency: 'Monthly' | 'Weekly' | 'Daily'
 *                        is_freezed:       BIT — set to 1 when stage >= 2
 *
 *   CollateralReview   — Collateral revaluation records: new market value,
 *                        recalculated LTV, revaluation date.
 *
 * DocumentRequests is managed by documentRequestService.ts — do not define
 * DDL for it here to avoid schema conflicts.
 */

import { query } from '@/lib/db.server'

// ─── DDL ──────────────────────────────────────────────────────────────────

const ENSURE_CLIENT_MONITORING = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'ClientMonitoring' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[ClientMonitoring] (
  client_id         NVARCHAR(50)  NOT NULL PRIMARY KEY,
  -- 'Monthly' | 'Weekly' | 'Daily'
  review_frequency  NVARCHAR(20)  NOT NULL DEFAULT 'Monthly',
  -- 1 = credit disbursements frozen; 0 = active
  is_freezed        BIT           NOT NULL DEFAULT 0,
  freeze_reason     NVARCHAR(500) NULL,
  frozen_at         DATETIME      NULL,
  updated_at        DATETIME      NOT NULL DEFAULT GETDATE()
)
`

const ENSURE_COLLATERAL_REVIEW = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'CollateralReview' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[CollateralReview] (
  id                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id           NVARCHAR(50)     NOT NULL,
  credit_id           NVARCHAR(50)     NULL,
  revaluation_date    DATE             NOT NULL,
  -- Market value before revaluation (NULL if first review)
  old_value           FLOAT            NULL,
  -- Market value after revaluation
  new_value           FLOAT            NOT NULL,
  -- Outstanding loan balance used for LTV calculation
  current_exposure    FLOAT            NULL,
  -- Recalculated LTV = current_exposure / new_value * 100
  ltv_recalculated    FLOAT            NULL,
  reviewed_by         NVARCHAR(100)    NOT NULL,
  notes               NVARCHAR(MAX)    NULL,
  created_at          DATETIME         NOT NULL DEFAULT GETDATE()
)
`

const ENSURE_IDX_COLLATERAL_CLIENT = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_CollateralReview_ClientID_RevalDate'
    AND object_id = OBJECT_ID('SPECTRA.dbo.CollateralReview')
)
CREATE INDEX IX_CollateralReview_ClientID_RevalDate
  ON [SPECTRA].[dbo].[CollateralReview] (client_id, revaluation_date DESC)
  INCLUDE (new_value, ltv_recalculated)
`

// ─── One-time DDL guard ────────────────────────────────────────────────────

let _tablesReady    = false
let _tablesInFlight: Promise<void> | null = null

async function ensureTables(): Promise<void> {
  if (_tablesReady) return
  if (_tablesInFlight) return _tablesInFlight
  _tablesInFlight = (async () => {
    await query(ENSURE_CLIENT_MONITORING)
    await query(ENSURE_COLLATERAL_REVIEW)
    try { await query(ENSURE_IDX_COLLATERAL_CLIENT) } catch { /* non-fatal */ }
    _tablesReady = true
  })().finally(() => { _tablesInFlight = null })
  return _tablesInFlight
}

// ─── ClientMonitoring ─────────────────────────────────────────────────────

export interface ClientMonitoringRow {
  client_id:        string
  review_frequency: 'Monthly' | 'Weekly' | 'Daily'
  is_freezed:       boolean
  freeze_reason:    string | null
  frozen_at:        string | null
  updated_at:       string
}

/**
 * Map a numeric IFRS stage to a review frequency.
 * Stage 1 = Monthly, Stage 2 = Weekly, Stage 3 = Daily.
 */
export function stageToReviewFrequency(stage: number): 'Monthly' | 'Weekly' | 'Daily' {
  if (stage >= 3) return 'Daily'
  if (stage >= 2) return 'Weekly'
  return 'Monthly'
}

/**
 * UPSERT client monitoring state.
 * Called automatically by classificationEngine on stage change, and
 * can also be called manually from the monitoring API.
 */
export async function upsertClientMonitoring(
  clientId:        string,
  reviewFrequency: 'Monthly' | 'Weekly' | 'Daily',
  isFreezed:       boolean,
  freezeReason?:   string
): Promise<void> {
  await ensureTables()
  // MERGE = atomic upsert; avoids race between INSERT and UPDATE under concurrency
  await query(
    `MERGE [SPECTRA].[dbo].[ClientMonitoring] AS target
     USING (VALUES (@clientId, @reviewFrequency, @isFreezed, @freezeReason)) AS src
       (client_id, review_frequency, is_freezed, freeze_reason)
     ON target.client_id = src.client_id
     WHEN MATCHED THEN
       UPDATE SET
         review_frequency = src.review_frequency,
         is_freezed       = src.is_freezed,
         freeze_reason    = CASE WHEN src.is_freezed = 1 THEN src.freeze_reason ELSE NULL END,
         frozen_at        = CASE
                              WHEN src.is_freezed = 1 AND target.is_freezed = 0 THEN GETDATE()
                              WHEN src.is_freezed = 1                            THEN target.frozen_at
                              ELSE NULL
                            END,
         updated_at       = GETDATE()
     WHEN NOT MATCHED THEN
       INSERT (client_id, review_frequency, is_freezed, freeze_reason, frozen_at)
       VALUES (
         src.client_id,
         src.review_frequency,
         src.is_freezed,
         CASE WHEN src.is_freezed = 1 THEN src.freeze_reason ELSE NULL END,
         CASE WHEN src.is_freezed = 1 THEN GETDATE() ELSE NULL END
       );`,
    {
      clientId,
      reviewFrequency,
      isFreezed: isFreezed ? 1 : 0,
      freezeReason: freezeReason ?? null,
    }
  )
}

export async function getClientMonitoring(clientId: string): Promise<ClientMonitoringRow | null> {
  await ensureTables()
  const rows = await query<{
    client_id:        string
    review_frequency: string
    is_freezed:       number
    freeze_reason:    string | null
    frozen_at:        string | null
    updated_at:       string
  }>(
    `SELECT
       client_id, review_frequency,
       CAST(is_freezed AS INT)                  AS is_freezed,
       freeze_reason,
       CONVERT(VARCHAR(30), frozen_at,  127)    AS frozen_at,
       CONVERT(VARCHAR(30), updated_at, 127)    AS updated_at
     FROM [SPECTRA].[dbo].[ClientMonitoring] WITH (NOLOCK)
     WHERE client_id = @clientId`,
    { clientId }
  )
  if (!rows[0]) return null
  return {
    ...rows[0],
    is_freezed:       rows[0].is_freezed === 1,
    review_frequency: rows[0].review_frequency as 'Monthly' | 'Weekly' | 'Daily',
  }
}

// ─── DocumentRequests (portfolio view only) ───────────────────────────────
// CRUD is in documentRequestService.ts — this section only exports the
// portfolio-level query used by the monitoring page.

/** Matches documentRequestService.DocumentRequestRow */
export interface DocumentRequestRow {
  id:             string
  client_id:      string
  credit_id:      string | null
  requested_docs: string   // JSON array, e.g. '["Pay Slips","Bank Statements"]'
  requested_by:   string
  due_date:       string | null
  status:         'Pending' | 'Received' | 'Overdue'
  notes:          string | null
  fulfilled_at:   string | null
  created_at:     string
  updated_at:     string
}

// ─── CollateralReview ─────────────────────────────────────────────────────

export interface CollateralReviewRecord {
  clientId:         string
  creditId?:        string | null
  revaluationDate:  string   // ISO date: 'YYYY-MM-DD'
  oldValue?:        number | null
  newValue:         number
  currentExposure?: number | null
  reviewedBy:       string
  notes?:           string | null
}

export interface CollateralReviewRow {
  id:                string
  client_id:         string
  credit_id:         string | null
  revaluation_date:  string
  old_value:         number | null
  new_value:         number
  current_exposure:  number | null
  ltv_recalculated:  number | null
  reviewed_by:       string
  notes:             string | null
  created_at:        string
}

export async function createCollateralReview(rec: CollateralReviewRecord): Promise<string> {
  await ensureTables()
  // LTV = current_exposure / new_value * 100, rounded to 2dp
  const ltv =
    rec.currentExposure != null && rec.newValue > 0
      ? Math.round((rec.currentExposure / rec.newValue) * 10000) / 100
      : null

  const rows = await query<{ id: string }>(
    `INSERT INTO [SPECTRA].[dbo].[CollateralReview]
       (client_id, credit_id, revaluation_date, old_value, new_value,
        current_exposure, ltv_recalculated, reviewed_by, notes)
     OUTPUT CAST(inserted.id AS VARCHAR(36)) AS id
     VALUES (
       @clientId, @creditId, @revaluationDate, @oldValue, @newValue,
       @currentExposure, @ltv, @reviewedBy, @notes
     )`,
    {
      clientId:        rec.clientId,
      creditId:        rec.creditId        ?? null,
      revaluationDate: rec.revaluationDate,
      oldValue:        rec.oldValue        ?? null,
      newValue:        rec.newValue,
      currentExposure: rec.currentExposure ?? null,
      ltv,
      reviewedBy:      rec.reviewedBy,
      notes:           rec.notes           ?? null,
    }
  )
  return rows[0].id
}

export async function getCollateralReviews(
  clientId: string,
  limit = 20
): Promise<CollateralReviewRow[]> {
  await ensureTables()
  return query<CollateralReviewRow>(
    `SELECT TOP (@limit)
       CAST(id AS VARCHAR(36))                       AS id,
       client_id, credit_id,
       CONVERT(VARCHAR(10), revaluation_date, 23)    AS revaluation_date,
       old_value, new_value, current_exposure, ltv_recalculated,
       reviewed_by, notes,
       CONVERT(VARCHAR(30), created_at, 127)         AS created_at
     FROM [SPECTRA].[dbo].[CollateralReview] WITH (NOLOCK)
     WHERE client_id = @clientId
     ORDER BY revaluation_date DESC, created_at DESC`,
    { clientId, limit }
  )
}

// ─── Portfolio-level queries ───────────────────────────────────────────────

export interface FrozenClientRow {
  client_id:        string
  review_frequency: string
  freeze_reason:    string | null
  frozen_at:        string | null
  updated_at:       string
}

export async function getAllFrozenClients(): Promise<FrozenClientRow[]> {
  await ensureTables()
  return query<FrozenClientRow>(
    `SELECT
       client_id, review_frequency, freeze_reason,
       CONVERT(VARCHAR(30), frozen_at,  127) AS frozen_at,
       CONVERT(VARCHAR(30), updated_at, 127) AS updated_at
     FROM [SPECTRA].[dbo].[ClientMonitoring] WITH (NOLOCK)
     WHERE is_freezed = 1
     ORDER BY frozen_at DESC`,
    {}
  )
}

export async function getAllPendingDocumentRequests(limit = 50): Promise<DocumentRequestRow[]> {
  await ensureTables()
  return query<DocumentRequestRow>(
    `SELECT TOP (@limit)
       CAST(id AS VARCHAR(36))                      AS id,
       client_id, credit_id, requested_docs,
       requested_by,
       CONVERT(VARCHAR(10), due_date, 23)           AS due_date,
       status, notes,
       CONVERT(VARCHAR(30), fulfilled_at, 127)      AS fulfilled_at,
       CONVERT(VARCHAR(30), created_at,   127)      AS created_at,
       CONVERT(VARCHAR(30), updated_at,   127)      AS updated_at
     FROM [SPECTRA].[dbo].[DocumentRequests] WITH (NOLOCK)
     ORDER BY created_at DESC`,
    { limit }
  )
}

export async function getAllRecentCollateralReviews(limit = 20): Promise<CollateralReviewRow[]> {
  await ensureTables()
  return query<CollateralReviewRow>(
    `SELECT TOP (@limit)
       CAST(id AS VARCHAR(36))                       AS id,
       client_id, credit_id,
       CONVERT(VARCHAR(10), revaluation_date, 23)    AS revaluation_date,
       old_value, new_value, current_exposure, ltv_recalculated,
       reviewed_by, notes,
       CONVERT(VARCHAR(30), created_at, 127)         AS created_at
     FROM [SPECTRA].[dbo].[CollateralReview] WITH (NOLOCK)
     ORDER BY revaluation_date DESC, created_at DESC`,
    { limit }
  )
}
