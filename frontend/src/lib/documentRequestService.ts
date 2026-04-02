/**
 * SPECTRA Document Request Service
 * Manages the DocumentRequests table (DDL-on-first-use).
 */

import { query } from '@/lib/db.server'

const ENSURE_DOCUMENT_REQUESTS = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'DocumentRequests' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[DocumentRequests] (
  id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id       NVARCHAR(50)     NOT NULL,
  credit_id       NVARCHAR(50)     NULL,
  -- JSON array of requested document types e.g. ["Pay Slips","Bank Statements"]
  requested_docs  NVARCHAR(MAX)    NOT NULL,
  requested_by    NVARCHAR(100)    NOT NULL,
  due_date        DATE             NULL,
  -- 'Pending' | 'Received' | 'Overdue'
  status          NVARCHAR(20)     NOT NULL DEFAULT 'Pending',
  notes           NVARCHAR(MAX)    NULL,
  fulfilled_at    DATETIME         NULL,
  created_at      DATETIME         NOT NULL DEFAULT GETDATE(),
  updated_at      DATETIME         NOT NULL DEFAULT GETDATE()
)
`

const ENSURE_IDX_DOCREQ_CLIENT = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_DocumentRequests_ClientID_CreatedAt'
    AND object_id = OBJECT_ID('SPECTRA.dbo.DocumentRequests')
)
CREATE INDEX IX_DocumentRequests_ClientID_CreatedAt
  ON [dbo].[DocumentRequests] (client_id, created_at DESC)
  INCLUDE (status, requested_by)
`

let _ready    = false
let _inflight: Promise<void> | null = null

async function ensureTable(): Promise<void> {
  if (_ready) return
  if (_inflight) return _inflight
  _inflight = (async () => {
    await query(ENSURE_DOCUMENT_REQUESTS)
    try { await query(ENSURE_IDX_DOCREQ_CLIENT) } catch { /* non-fatal */ }
    _ready = true
  })().finally(() => { _inflight = null })
  return _inflight
}

export interface DocumentRequestRow {
  id:             string
  client_id:      string
  credit_id:      string | null
  requested_docs: string   // JSON array
  requested_by:   string
  due_date:       string | null
  status:         'Pending' | 'Received' | 'Overdue'
  notes:          string | null
  fulfilled_at:   string | null
  created_at:     string
  updated_at:     string
}

export async function createDocumentRequest(rec: {
  clientId:      string
  creditId?:     string | null
  requestedDocs: string[]
  requestedBy:   string
  dueDate?:      string | null
  notes?:        string | null
}): Promise<string> {
  await ensureTable()
  const rows = await query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentRequests]
       (client_id, credit_id, requested_docs, requested_by, due_date, notes)
     OUTPUT CAST(inserted.id AS VARCHAR(36)) AS id
     VALUES (@clientId, @creditId, @requestedDocs, @requestedBy, @dueDate, @notes)`,
    {
      clientId:      rec.clientId,
      creditId:      rec.creditId     ?? null,
      requestedDocs: JSON.stringify(rec.requestedDocs),
      requestedBy:   rec.requestedBy,
      dueDate:       rec.dueDate      ?? null,
      notes:         rec.notes        ?? null,
    }
  )
  return rows[0].id
}

export async function getDocumentRequests(
  clientId: string,
  limit = 20
): Promise<DocumentRequestRow[]> {
  await ensureTable()
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
     FROM [dbo].[DocumentRequests] WITH (NOLOCK)
     WHERE client_id = @clientId
     ORDER BY created_at DESC`,
    { clientId, limit }
  )
}

export async function markDocumentsReceived(id: string): Promise<{ rowsAffected: number }> {
  await ensureTable()
  const result = await query<Record<string, unknown>>(
    `UPDATE [dbo].[DocumentRequests]
     SET status = 'Received', fulfilled_at = GETDATE(), updated_at = GETDATE()
     WHERE CAST(id AS VARCHAR(36)) = @id AND status = 'Pending'`,
    { id }
  )
  // query() returns an array of rows; for UPDATE we rely on the underlying result metadata
  // Use a SELECT to check if the row was actually updated (status was Pending)
  const check = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[DocumentRequests]
     WHERE CAST(id AS VARCHAR(36)) = @id AND status = 'Received' AND fulfilled_at IS NOT NULL`,
    { id }
  )
  void result
  const affected = check[0]?.cnt ?? 0
  return { rowsAffected: affected }
}
