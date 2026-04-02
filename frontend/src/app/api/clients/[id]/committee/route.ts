/**
 * GET  /api/clients/[id]/committee  — list all committee entries for a client
 * POST /api/clients/[id]/committee  — create a new escalation (Decision = 'Pending')
 *                                     Requires role: risk_officer | admin
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { createCommitteeEscalation, getCommitteeLog } from '@/lib/committeeService'
import { createNotification } from '@/lib/notificationService'
import { emitSpectraEvent } from '@/lib/eventBus'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const jar   = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)

    const { id: clientId } = await params
    const log = await getCommitteeLog(clientId)
    return NextResponse.json({ log, count: log.length })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const jar   = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    if (!['credit_risk_manager', 'senior_risk_manager'].includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Committee escalation requires Credit Risk Manager or Senior Risk Manager' },
        { status: 403 }
      )
    }

    const { id: clientId } = await params
    const body = await req.json() as { creditId?: string; notes?: string }

    const id = await createCommitteeEscalation(
      clientId,
      session.username,
      { creditId: body.creditId ?? null, notes: body.notes ?? null }
    )

    await createNotification({
      clientId:         clientId,
      creditId:         body.creditId ?? null,
      notificationType: 'risk_escalation',
      priority:         'high',
      title:            'Escalated to Credit Committee',
      message:          `${session.username ?? 'RM'} escalated client ${clientId} to the Credit Committee. Decision pending.${body.notes ? ` Notes: ${body.notes}` : ''}`,
      assignedRM:       null,
    })

    emitSpectraEvent({
      type:     'committee',
      clientId: clientId,
      actor:    session.username,
      message:  `Escalated to Credit Committee by ${session.username}`,
    })

    return NextResponse.json({ ok: true, id }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
