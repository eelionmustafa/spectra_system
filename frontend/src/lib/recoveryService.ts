/**
 * SPECTRA Recovery Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the RecoveryCases table (DDL-on-first-use).
 *
 * Stage lifecycle:
 *   DebtCollection → CollateralEnforcement → LegalProceedings → DebtSale | WriteOff
 *
 * WriteOff path:
 *   writeOffClient() → markClientWrittenOff() (WrittenOffClients table)
 *                    → recordSystemAction('write_off')
 *                    → recordRichClientAction() (Actions Log)
 *
 * Written by: POST /api/clients/[id]/recovery
 * Read by:    clients/[id]/page.tsx  (active case for header banner)
 */

import { query } from '@/lib/db.server'
import { recordSystemAction } from '@/lib/notificationService'
import { recordRichClientAction } from '@/lib/queries'
import { markClientWrittenOff, ensureWrittenOffTable } from '@/lib/writtenOffService'

// ─── DDL ──────────────────────────────────────────────────────────────────

const ENSURE_RECOVERY_CASES = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'RecoveryCases' AND schema_id = SCHEMA_ID('dbo')
)
CREATE TABLE [dbo].[RecoveryCases] (
  id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id       NVARCHAR(50)     NOT NULL,
  credit_id       NVARCHAR(50)     NULL,
  -- 'DebtCollection' | 'CollateralEnforcement' | 'LegalProceedings' | 'DebtSale' | 'WriteOff'
  stage           NVARCHAR(30)     NOT NULL,
  assigned_to     NVARCHAR(100)    NULL,
  -- 'Open' | 'Closed'
  status          NVARCHAR(20)     NOT NULL DEFAULT 'Open',
  notes           NVARCHAR(MAX)    NULL,
  opened_at       DATETIME         NOT NULL DEFAULT GETDATE(),
  updated_at      DATETIME         NOT NULL DEFAULT GETDATE()
)
`

const ENSURE_IDX_RECOVERY_CLIENT = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_RecoveryCases_ClientID_OpenedAt'
    AND object_id = OBJECT_ID('SPECTRA.dbo.RecoveryCases')
)
CREATE INDEX IX_RecoveryCases_ClientID_OpenedAt
  ON [dbo].[RecoveryCases] (client_id, opened_at DESC)
  INCLUDE (stage, status, assigned_to)
`

// ─── One-time DDL guard ────────────────────────────────────────────────────

let _tablesReady    = false
let _tablesInFlight: Promise<void> | null = null

async function ensureTables(): Promise<void> {
  if (_tablesReady) return
  if (_tablesInFlight) return _tablesInFlight
  _tablesInFlight = (async () => {
    await query(ENSURE_RECOVERY_CASES)
    await ensureWrittenOffTable()   // also provision WrittenOffClients
    try { await query(ENSURE_IDX_RECOVERY_CLIENT) } catch { /* non-fatal */ }
    _tablesReady = true
  })().finally(() => { _tablesInFlight = null })
  return _tablesInFlight
}

// ─── Types ────────────────────────────────────────────────────────────────

export type RecoveryStage =
  | 'DebtCollection'
  | 'CollateralEnforcement'
  | 'LegalProceedings'
  | 'DebtSale'
  | 'WriteOff'

export interface RecoveryCaseRow {
  id:          string
  client_id:   string
  credit_id:   string | null
  stage:       RecoveryStage
  assigned_to: string | null
  status:      'Open' | 'Closed'
  notes:       string | null
  opened_at:   string
  updated_at:  string
}

export interface RecoveryCaseMutationResult {
  case: RecoveryCaseRow
  mode: 'created' | 'updated'
}

async function getRecoveryCaseById(caseId: string): Promise<RecoveryCaseRow | null> {
  const rows = await query<RecoveryCaseRow>(
    `SELECT TOP 1
       CAST(id AS VARCHAR(36)) AS id,
       client_id, credit_id, stage, assigned_to, status, notes,
       CONVERT(VARCHAR(30), opened_at, 127)  AS opened_at,
       CONVERT(VARCHAR(30), updated_at, 127) AS updated_at
     FROM [dbo].[RecoveryCases] WITH (NOLOCK)
     WHERE id = CAST(@caseId AS UNIQUEIDENTIFIER)`,
    { caseId }
  )
  return rows[0] ?? null
}

async function getOpenRecoveryCases(clientId: string): Promise<RecoveryCaseRow[]> {
  return query<RecoveryCaseRow>(
    `SELECT
       CAST(id AS VARCHAR(36)) AS id,
       client_id, credit_id, stage, assigned_to, status, notes,
       CONVERT(VARCHAR(30), opened_at, 127)  AS opened_at,
       CONVERT(VARCHAR(30), updated_at, 127) AS updated_at
     FROM [dbo].[RecoveryCases] WITH (NOLOCK)
     WHERE client_id = @clientId AND status = 'Open'
     ORDER BY opened_at DESC`,
    { clientId }
  )
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createRecoveryCase(
  clientId:   string,
  createdBy:  string,
  opts: {
    creditId?:   string | null
    stage:       RecoveryStage
    assignedTo?: string | null
    notes?:      string | null
  }
): Promise<RecoveryCaseMutationResult> {
  await ensureTables()

  const openCases = await getOpenRecoveryCases(clientId)
  let caseId: string
  let mode: RecoveryCaseMutationResult['mode'] = 'updated'

  if (openCases[0]) {
    caseId = openCases[0].id
    await query(
      `UPDATE [dbo].[RecoveryCases]
       SET
         credit_id    = @creditId,
         stage        = @stage,
         assigned_to  = @assignedTo,
         notes        = @notes,
         updated_at   = GETDATE()
       WHERE id = CAST(@caseId AS UNIQUEIDENTIFIER)`,
      {
        caseId,
        creditId:   opts.creditId   ?? null,
        stage:      opts.stage,
        assignedTo: opts.assignedTo ?? null,
        notes:      opts.notes      ?? null,
      }
    )
  } else {
    const rows = await query<{ id: string }>(
      `INSERT INTO [dbo].[RecoveryCases]
         (client_id, credit_id, stage, assigned_to, notes)
       OUTPUT CAST(inserted.id AS VARCHAR(36)) AS id
       VALUES (@clientId, @creditId, @stage, @assignedTo, @notes)`,
      {
        clientId,
        creditId:   opts.creditId   ?? null,
        stage:      opts.stage,
        assignedTo: opts.assignedTo ?? null,
        notes:      opts.notes      ?? null,
      }
    )
    caseId = rows[0].id
    mode = 'created'
  }

  const currentCase = await getRecoveryCaseById(caseId)
  if (!currentCase) {
    throw new Error(`Recovery case ${caseId} could not be loaded after mutation`)
  }

  // Mirror to Actions Log
  await recordRichClientAction(
    clientId,
    `${mode === 'created' ? 'Recovery Initiated' : 'Recovery Updated'}: ${opts.stage.replace(/([A-Z])/g, ' $1').trim()}`,
    createdBy,
    opts.notes ?? undefined,
    { recovery_case_id: caseId, stage: opts.stage, assigned_to: opts.assignedTo ?? null }
  )

  // WriteOff path — also mark in WrittenOffClients and write SystemAction
  if (opts.stage === 'WriteOff') {
    await markClientWrittenOff(clientId, createdBy, caseId, opts.notes ?? null)

    await recordSystemAction({
      clientId,
      creditId:      opts.creditId ?? null,
      eventType:     'write_off',
      oldStage:      3,
      newStage:      3,
      oldRiskScore:  null,
      newRiskScore:  null,
      triggerReason: JSON.stringify({
        recovery_case_id: caseId,
        stage:           opts.stage,
        assigned_to:     opts.assignedTo ?? null,
        triggeredBy:     `user:${createdBy}`,
      }),
      performedBy: createdBy,
    })
  }

  return { case: currentCase, mode }
}

// ─── Update ───────────────────────────────────────────────────────────────

const STAGE_ORDER: RecoveryStage[] = ['DebtCollection', 'CollateralEnforcement', 'LegalProceedings', 'DebtSale', 'WriteOff']

export async function updateRecoveryCase(
  caseId:    string,
  clientId:  string,
  updatedBy: string,
  updates: {
    stage?:      RecoveryStage
    assignedTo?: string | null
    status?:     'Open' | 'Closed'
    notes?:      string | null
  }
): Promise<void> {
  await ensureTables()

  if (updates.stage) {
    const currentCase = await getRecoveryCaseById(caseId)
    if (currentCase) {
      const currentIdx = STAGE_ORDER.indexOf(currentCase.stage)
      const newIdx     = STAGE_ORDER.indexOf(updates.stage)
      if (newIdx < currentIdx) {
        throw new Error('Cannot regress recovery case to an earlier stage')
      }
    }
  }

  await query(
    `UPDATE [dbo].[RecoveryCases]
     SET
       stage       = COALESCE(@stage,      stage),
       assigned_to = COALESCE(@assignedTo, assigned_to),
       status      = COALESCE(@status,     status),
       notes       = CASE WHEN @hasNotes = 1 THEN @notes ELSE notes END,
       updated_at  = GETDATE()
     WHERE id = CAST(@caseId AS UNIQUEIDENTIFIER)`,
    {
      caseId,
      stage:      updates.stage      ?? null,
      assignedTo: updates.assignedTo ?? null,
      status:     updates.status     ?? null,
      hasNotes:   'notes' in updates ? 1 : 0,
      notes:      updates.notes      ?? null,
    }
  )

  // WriteOff escalation path
  if (updates.stage === 'WriteOff') {
    await markClientWrittenOff(clientId, updatedBy, caseId, updates.notes ?? null)

    await recordSystemAction({
      clientId,
      creditId:      null,
      eventType:     'write_off',
      oldStage:      3,
      newStage:      3,
      oldRiskScore:  null,
      newRiskScore:  null,
      triggerReason: JSON.stringify({
        recovery_case_id: caseId,
        stage:           updates.stage,
        triggeredBy:     `user:${updatedBy}`,
      }),
      performedBy: updatedBy,
    })
  }

  await recordRichClientAction(
    clientId,
    updates.stage
      ? `Recovery Updated: ${updates.stage.replace(/([A-Z])/g, ' $1').trim()}`
      : updates.status === 'Closed'
        ? 'Recovery Case Closed'
        : 'Recovery Case Updated',
    updatedBy,
    updates.notes ?? undefined,
    { recovery_case_id: caseId, ...updates }
  )
}

// ─── Read ─────────────────────────────────────────────────────────────────

/** Returns the most-recent open recovery case for a client, or null. */
export async function getActiveRecoveryCase(
  clientId: string
): Promise<RecoveryCaseRow | null> {
  await ensureTables()
  const openCases = await getOpenRecoveryCases(clientId)
  return openCases[0] ?? null
}

export async function getRecoveryCaseHistory(clientId: string): Promise<RecoveryCaseRow[]> {
  await ensureTables()
  return query<RecoveryCaseRow>(
    `SELECT TOP 20
       CAST(id AS VARCHAR(36)) AS id,
       client_id, credit_id, stage, assigned_to, status, notes,
       CONVERT(VARCHAR(30), opened_at, 127)  AS opened_at,
       CONVERT(VARCHAR(30), updated_at, 127) AS updated_at
     FROM [dbo].[RecoveryCases] WITH (NOLOCK)
     WHERE client_id = @clientId
     ORDER BY opened_at DESC`,
    { clientId }
  )
}
