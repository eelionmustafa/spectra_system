/**
 * GET  /api/clients/[id]/recovery  — list recovery case history for a client
 * POST /api/clients/[id]/recovery  — create a new recovery case
 *                                    Requires role: risk_officer | admin
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import {
  createRecoveryCase,
  getRecoveryCaseHistory,
  type RecoveryStage,
} from '@/lib/recoveryService'
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
    const cases = await getRecoveryCaseHistory(clientId)
    return NextResponse.json({ cases, count: cases.length })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

const VALID_STAGES: RecoveryStage[] = [
  'DebtCollection',
  'CollateralEnforcement',
  'LegalProceedings',
  'DebtSale',
  'WriteOff',
]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const jar   = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    if (!['risk_officer', 'admin'].includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Recovery initiation requires Risk Officer or Admin' },
        { status: 403 }
      )
    }

    const { id: clientId } = await params
    const body = await req.json() as {
      stage?: string
      creditId?: string
      assignedTo?: string
      notes?: string
    }

    if (!body.stage || !VALID_STAGES.includes(body.stage as RecoveryStage)) {
      return NextResponse.json(
        { error: `stage must be one of: ${VALID_STAGES.join(', ')}` },
        { status: 400 }
      )
    }

    const caseId = await createRecoveryCase(clientId, session.username, {
      stage:      body.stage as RecoveryStage,
      creditId:   body.creditId   ?? null,
      assignedTo: body.assignedTo ?? null,
      notes:      body.notes      ?? null,
    })

    await createNotification({
      clientId:         clientId,
      creditId:         body.creditId ?? null,
      notificationType: 'risk_escalation',
      priority:         body.stage === 'WriteOff' ? 'critical' : 'high',
      title:            `Recovery Initiated: ${body.stage!.replace(/([A-Z])/g, ' $1').trim()}`,
      message:          `${session.username ?? 'RM'} initiated a recovery case for client ${clientId}. Stage: ${body.stage}. ${body.assignedTo ? `Assigned to: ${body.assignedTo}.` : ''}`,
      assignedRM:       null,
    })

    emitSpectraEvent({
      type:     'recovery',
      clientId: clientId,
      actor:    session.username,
      message:  `Recovery initiated (${body.stage}) by ${session.username}`,
    })

    return NextResponse.json({ ok: true, caseId }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
