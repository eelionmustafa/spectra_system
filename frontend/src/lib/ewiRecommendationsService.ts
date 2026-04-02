/**
 * SPECTRA EWI Recommendations Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the EWIRecommendations table (DDL-on-first-use).
 *
 * Each row is an actionable recommendation generated for a client based on
 * EWI signals, ML predictions, or rule triggers.
 *
 * Schema aligns with the index in performance_indexes.sql:
 *   IX_EWIRecommendations_ClientID_IsActioned →
 *     (client_id, is_actioned) INCLUDE (recommendation_type, created_at)
 */

import { query } from '@/lib/db.server'

// ─── DDL ──────────────────────────────────────────────────────────────────

const ENSURE_EWI_RECOMMENDATIONS = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'EWIRecommendations' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[EWIRecommendations] (
  id                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id            NVARCHAR(50)     NOT NULL,
  credit_id            NVARCHAR(50)     NULL,
  -- 'Urgent' | 'High' | 'Medium' | 'Low'
  priority             NVARCHAR(20)     NOT NULL DEFAULT 'Medium',
  -- e.g. 'Contact Client' | 'Restructure' | 'Escalate' | 'Monitor' | 'Legal Action'
  recommendation_type  NVARCHAR(50)     NOT NULL,
  description          NVARCHAR(MAX)    NULL,
  is_actioned          BIT              NOT NULL DEFAULT 0,
  actioned_by          NVARCHAR(100)    NULL,
  actioned_at          DATETIME         NULL,
  created_at           DATETIME         NOT NULL DEFAULT GETDATE()
)
`

const ENSURE_IDX_EWI_REC = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_EWIRecommendations_ClientID_IsActioned'
    AND object_id = OBJECT_ID('dbo.EWIRecommendations')
)
CREATE NONCLUSTERED INDEX [IX_EWIRecommendations_ClientID_IsActioned]
  ON [dbo].[EWIRecommendations] (client_id, is_actioned)
  INCLUDE (recommendation_type, created_at)
`

// ─── One-time DDL guard ────────────────────────────────────────────────────

let _ready    = false
let _inFlight: Promise<void> | null = null

export async function ensureEWIRecommendationsTable(): Promise<void> {
  if (_ready) return
  if (_inFlight) return _inFlight
  _inFlight = (async () => {
    await query(ENSURE_EWI_RECOMMENDATIONS)
    try { await query(ENSURE_IDX_EWI_REC) } catch { /* non-fatal */ }
    _ready = true
  })().finally(() => { _inFlight = null })
  return _inFlight
}

// ─── Types ────────────────────────────────────────────────────────────────

export type RecommendationPriority = 'Urgent' | 'High' | 'Medium' | 'Low'
export type RecommendationType =
  | 'Contact Client'
  | 'Restructure'
  | 'Escalate'
  | 'Monitor'
  | 'Legal Action'
  | 'Request Documents'
  | 'Freeze Account'
  | string

export interface EWIRecommendationRow {
  id:                  string
  client_id:           string
  credit_id:           string | null
  priority:            RecommendationPriority
  recommendation_type: string
  description:         string | null
  is_actioned:         boolean
  actioned_by:         string | null
  actioned_at:         string | null
  created_at:          string
}

// ─── Write ────────────────────────────────────────────────────────────────

export async function createEWIRecommendation(rec: {
  clientId:           string
  creditId?:          string | null
  priority:           RecommendationPriority
  recommendationType: string
  description?:       string | null
}): Promise<string> {
  await ensureEWIRecommendationsTable()
  const rows = await query<{ id: string }>(
    `INSERT INTO [dbo].[EWIRecommendations]
       (client_id, credit_id, priority, recommendation_type, description)
     OUTPUT CAST(inserted.id AS VARCHAR(36)) AS id
     VALUES (@clientId, @creditId, @priority, @recommendationType, @description)`,
    {
      clientId:           rec.clientId,
      creditId:           rec.creditId           ?? null,
      priority:           rec.priority,
      recommendationType: rec.recommendationType,
      description:        rec.description        ?? null,
    }
  )
  return rows[0].id
}

export async function markRecommendationActioned(
  id:          string,
  actionedBy:  string
): Promise<void> {
  await ensureEWIRecommendationsTable()
  await query(
    `UPDATE [dbo].[EWIRecommendations]
     SET is_actioned = 1,
         actioned_by = @actionedBy,
         actioned_at = GETDATE()
     WHERE CAST(id AS VARCHAR(36)) = @id
       AND is_actioned = 0`,
    { id, actionedBy }
  )
}

// ─── Read ─────────────────────────────────────────────────────────────────

/**
 * Returns open (is_actioned = 0) recommendations across all clients,
 * sorted by priority severity then created_at descending.
 */
export async function getOpenRecommendations(limit = 200): Promise<EWIRecommendationRow[]> {
  await ensureEWIRecommendationsTable()
  return query<EWIRecommendationRow>(
    `SELECT TOP (@limit)
       CAST(id AS VARCHAR(36))            AS id,
       client_id, credit_id, priority,
       recommendation_type, description,
       CAST(is_actioned AS BIT)           AS is_actioned,
       actioned_by,
       CONVERT(VARCHAR(30), actioned_at, 127) AS actioned_at,
       CONVERT(VARCHAR(30), created_at,  127) AS created_at
     FROM [dbo].[EWIRecommendations] WITH (NOLOCK)
     WHERE is_actioned = 0
     ORDER BY
       CASE priority
         WHEN 'Urgent' THEN 1 WHEN 'High' THEN 2
         WHEN 'Medium' THEN 3 ELSE 4
       END,
       created_at DESC`,
    { limit }
  )
}

/** All recommendations for a single client (open and closed), newest first. */
export async function getClientRecommendations(clientId: string): Promise<EWIRecommendationRow[]> {
  await ensureEWIRecommendationsTable()
  return query<EWIRecommendationRow>(
    `SELECT TOP 50
       CAST(id AS VARCHAR(36))            AS id,
       client_id, credit_id, priority,
       recommendation_type, description,
       CAST(is_actioned AS BIT)           AS is_actioned,
       actioned_by,
       CONVERT(VARCHAR(30), actioned_at, 127) AS actioned_at,
       CONVERT(VARCHAR(30), created_at,  127) AS created_at
     FROM [dbo].[EWIRecommendations] WITH (NOLOCK)
     WHERE client_id = @clientId
     ORDER BY
       CASE priority
         WHEN 'Urgent' THEN 1 WHEN 'High' THEN 2
         WHEN 'Medium' THEN 3 ELSE 4
       END,
       created_at DESC`,
    { clientId }
  )
}

export async function getRecommendationsPaginated(
  q: string,
  page: number,
  priorityFilter = '',
  showAll = false
): Promise<{ rows: EWIRecommendationRow[]; total: number }> {
  await ensureEWIRecommendationsTable()
  const offset  = (Math.max(1, page) - 1) * 25
  const pattern = q ? `%${q}%` : '%%'
  const showAllBit = showAll ? 1 : 0

  const dataQ = query<EWIRecommendationRow>(
    `SELECT CAST(id AS VARCHAR(36)) AS id,
       client_id, credit_id, priority, recommendation_type, description,
       CAST(is_actioned AS BIT) AS is_actioned,
       actioned_by,
       CONVERT(VARCHAR(30), actioned_at, 127) AS actioned_at,
       CONVERT(VARCHAR(30), created_at,  127) AS created_at
     FROM [dbo].[EWIRecommendations] WITH (NOLOCK)
     WHERE (@showAll = 1 OR is_actioned = 0)
       AND (@priorityFilter = '' OR priority = @priorityFilter)
       AND (@pattern = '%%' OR client_id LIKE @pattern OR COALESCE(credit_id, '') LIKE @pattern)
     ORDER BY
       CASE priority WHEN 'Urgent' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
       created_at DESC
     OFFSET @offset ROWS FETCH NEXT 25 ROWS ONLY`,
    { pattern, offset, priorityFilter, showAll: showAllBit }
  )

  const cntQ = query<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM [dbo].[EWIRecommendations] WITH (NOLOCK)
     WHERE (@showAll = 1 OR is_actioned = 0)
       AND (@priorityFilter = '' OR priority = @priorityFilter)
       AND (@pattern = '%%' OR client_id LIKE @pattern OR COALESCE(credit_id, '') LIKE @pattern)`,
    { pattern, priorityFilter, showAll: showAllBit }
  )

  const [rows, countRows] = await Promise.all([dataQ, cntQ])
  return { rows, total: countRows[0]?.total ?? 0 }
}
