/**
 * SPECTRA Messaging Service
 * Manages the ClientMessages table (DDL-on-first-use).
 *
 * NOTE: Attachments are stored as base64 data URLs in attachment_url (NVARCHAR(MAX)).
 * In production this should be replaced with Azure Blob Storage or equivalent.
 */

import { query } from '@/lib/db.server'

const ENSURE_TABLE = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'ClientMessages' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[ClientMessages] (
  id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id       NVARCHAR(50)     NOT NULL,
  sender_type     NVARCHAR(10)     NOT NULL,
  sender_id       NVARCHAR(100)    NOT NULL,
  sender_name     NVARCHAR(200)    NULL,
  body            NVARCHAR(MAX)    NULL,
  attachment_name NVARCHAR(500)    NULL,
  attachment_url  NVARCHAR(MAX)    NULL,
  attachment_type NVARCHAR(100)    NULL,
  read_at         DATETIME         NULL,
  read_by         NVARCHAR(100)    NULL,
  created_at      DATETIME         NOT NULL DEFAULT GETDATE()
)
`

const ENSURE_IDX = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_ClientMessages_ClientID_CreatedAt'
    AND object_id = OBJECT_ID('[dbo].[ClientMessages]')
)
CREATE INDEX IX_ClientMessages_ClientID_CreatedAt
  ON [dbo].[ClientMessages] (client_id, created_at DESC)
`

const ADD_IS_SYSTEM_COL = `
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.ClientMessages') AND name = 'is_system'
)
ALTER TABLE [dbo].[ClientMessages] ADD is_system BIT NOT NULL DEFAULT 0
`

let _ready = false
let _inflight: Promise<void> | null = null

export async function ensureMessagingTable(): Promise<void> {
  if (_ready) return
  if (_inflight) return _inflight
  _inflight = (async () => {
    await query(ENSURE_TABLE)
    try { await query(ENSURE_IDX) } catch { /* non-fatal */ }
    try { await query(ADD_IS_SYSTEM_COL) } catch { /* non-fatal */ }
    _ready = true
  })().finally(() => { _inflight = null })
  return _inflight
}

export interface MessageRow {
  id: string
  client_id: string
  sender_type: 'client' | 'officer'
  sender_id: string
  sender_name: string | null
  body: string | null
  attachment_name: string | null
  attachment_url: string | null
  attachment_type: string | null
  is_system: boolean
  read_at: string | null
  read_by: string | null
  created_at: string
}

export interface AttachmentInput {
  name: string
  url: string
  type: string
}

async function insertMessage(
  clientId: string,
  senderType: 'client' | 'officer',
  senderId: string,
  senderName: string | null,
  body: string | null,
  isSystem: boolean,
  attachment?: AttachmentInput
): Promise<MessageRow> {
  await ensureMessagingTable()

  const rows = await query<MessageRow>(`
    INSERT INTO [dbo].[ClientMessages]
      (client_id, sender_type, sender_id, sender_name, body, is_system, attachment_name, attachment_url, attachment_type)
    OUTPUT
      CAST(inserted.id AS VARCHAR(36))             AS id,
      inserted.client_id,
      inserted.sender_type,
      inserted.sender_id,
      inserted.sender_name,
      inserted.body,
      inserted.attachment_name,
      inserted.attachment_url,
      inserted.attachment_type,
      inserted.is_system,
      inserted.read_at,
      inserted.read_by,
      CONVERT(VARCHAR(30), inserted.created_at, 127) AS created_at
    VALUES (
      @clientId, @senderType, @senderId, @senderName, @body, @isSystem,
      @attachmentName, @attachmentUrl, @attachmentType
    )
  `, {
    clientId,
    senderType,
    senderId,
    senderName: senderName ?? null,
    body: body ?? null,
    isSystem,
    attachmentName: attachment?.name ?? null,
    attachmentUrl: attachment?.url ?? null,
    attachmentType: attachment?.type ?? null,
  })

  return rows[0]
}

export async function sendMessage(
  clientId: string,
  senderType: 'client' | 'officer',
  senderId: string,
  senderName: string | null,
  body: string | null,
  attachment?: AttachmentInput
): Promise<MessageRow> {
  return insertMessage(clientId, senderType, senderId, senderName, body, false, attachment)
}

export async function sendSystemMessage(
  clientId: string,
  senderId: string,
  senderName: string | null,
  body: string
): Promise<MessageRow> {
  return insertMessage(clientId, 'officer', senderId, senderName, body, true)
}

export async function getMessages(clientId: string, limit = 100): Promise<MessageRow[]> {
  await ensureMessagingTable()

  return query<MessageRow>(`
    SELECT TOP (@limit)
      CAST(id AS VARCHAR(36))              AS id,
      client_id,
      sender_type,
      sender_id,
      sender_name,
      body,
      attachment_name,
      attachment_url,
      attachment_type,
      ISNULL(is_system, 0)                 AS is_system,
      CONVERT(VARCHAR(30), read_at, 127)   AS read_at,
      read_by,
      CONVERT(VARCHAR(30), created_at, 127) AS created_at
    FROM [dbo].[ClientMessages]
    WHERE client_id = @clientId
    ORDER BY created_at ASC
  `, { clientId, limit })
}

export async function markRead(messageId: string, readBy: string): Promise<void> {
  await ensureMessagingTable()

  await query(`
    UPDATE [dbo].[ClientMessages]
    SET read_at = GETDATE(), read_by = @readBy
    WHERE id = @messageId AND read_at IS NULL
  `, { messageId, readBy })
}

export async function markAllRead(clientId: string, readBy: string, readerType: 'client' | 'officer'): Promise<void> {
  await ensureMessagingTable()

  // Officer marks client messages as read; client marks officer messages as read
  const senderType = readerType === 'officer' ? 'client' : 'officer'

  await query(`
    UPDATE [dbo].[ClientMessages]
    SET read_at = GETDATE(), read_by = @readBy
    WHERE client_id = @clientId
      AND sender_type = @senderType
      AND read_at IS NULL
  `, { clientId, readBy, senderType })
}

export async function getUnreadCount(clientId: string, readerType: 'client' | 'officer'): Promise<number> {
  await ensureMessagingTable()

  const senderType = readerType === 'officer' ? 'client' : 'officer'

  const rows = await query<{ cnt: number }>(`
    SELECT COUNT(*) AS cnt
    FROM [dbo].[ClientMessages]
    WHERE client_id = @clientId
      AND sender_type = @senderType
      AND read_at IS NULL
  `, { clientId, senderType })

  return rows[0]?.cnt ?? 0
}
