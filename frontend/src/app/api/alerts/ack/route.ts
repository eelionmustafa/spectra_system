/**
 * POST /api/alerts/ack
 * Acknowledges an alert — upserts into AlertAcknowledgements DB table.
 * Body: { credit_id: string, personal_id: string, action: 'reviewed' | 'actioned' | 'false_positive', note?: string }
 *
 * GET /api/alerts/ack
 * Returns all acknowledgements (admin use / EWI page).
 *
 * Prerequisite: run sql/alert_acks_table.sql on the SPECTRA database once.
 */
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db.server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'

export type AckAction = 'reviewed' | 'actioned' | 'false_positive'

export interface AlertAck {
  credit_id: string
  personal_id: string
  action: AckAction
  note: string
  acknowledged_by: string
  acknowledged_at: string  // ISO string
}

async function getUsername(): Promise<string> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return 'unknown'
    const session = await verifyToken(token)
    return session.username ?? session.role ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function POST(req: NextRequest) {
  try {
    const username = await getUsername()
    const body = await req.json() as { credit_id?: string; personal_id?: string; action?: AckAction; note?: string }
    const { credit_id, personal_id, action, note = '' } = body

    if (!credit_id || !personal_id || !action) {
      return NextResponse.json({ error: 'credit_id, personal_id and action are required' }, { status: 400 })
    }
    if (!['reviewed', 'actioned', 'false_positive'].includes(action)) {
      return NextResponse.json({ error: 'action must be reviewed | actioned | false_positive' }, { status: 400 })
    }

    // Atomic upsert via MERGE — no gap between delete and insert
    const now = new Date().toISOString()
    await query(`
      MERGE [SPECTRA].[dbo].[AlertAcknowledgements] WITH (HOLDLOCK) AS tgt
      USING (SELECT @credit_id AS credit_id) AS src ON tgt.credit_id = src.credit_id
      WHEN MATCHED THEN
        UPDATE SET personal_id = @personal_id, action = @action, note = @note,
                   acknowledged_by = @acknowledged_by, acknowledged_at = @acknowledged_at
      WHEN NOT MATCHED THEN
        INSERT (credit_id, personal_id, action, note, acknowledged_by, acknowledged_at)
        VALUES (@credit_id, @personal_id, @action, @note, @acknowledged_by, @acknowledged_at);
    `, { credit_id, personal_id, action, note, acknowledged_by: username, acknowledged_at: now })

    const ack: AlertAck = { credit_id, personal_id, action, note, acknowledged_by: username, acknowledged_at: now }
    return NextResponse.json({ ok: true, ack })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const rows = await query<AlertAck>(`
      SELECT credit_id, personal_id, action, note, acknowledged_by,
             CONVERT(VARCHAR(30), acknowledged_at, 127) AS acknowledged_at
      FROM [SPECTRA].[dbo].[AlertAcknowledgements] WITH (NOLOCK)
      ORDER BY acknowledged_at DESC
    `)
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
