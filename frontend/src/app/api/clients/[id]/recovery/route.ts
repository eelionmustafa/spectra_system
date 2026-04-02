/**
 * GET  /api/clients/[id]/recovery  — list recovery case history for a client
 * POST /api/clients/[id]/recovery  — create or update the active recovery case
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
import { checkRateLimit, recordFailedAttempt, recordSuccess } from '@/lib/rateLimit'

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
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
  const rl = checkRateLimit(ip)
  if (!rl.allowed) {
    recordFailedAttempt(ip)
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }
  try {
    const jar   = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)
    recordSuccess(ip)

    if (!['credit_risk_manager', 'senior_risk_manager', 'collections_officer'].includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Recovery initiation requires Credit Risk Manager or Senior Risk Manager' },
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

    const result = await createRecoveryCase(clientId, session.username, {
      stage:      body.stage as RecoveryStage,
      creditId:   body.creditId   ?? null,
      assignedTo: body.assignedTo ?? null,
      notes:      body.notes      ?? null,
    })
    const actionLabel = result.mode === 'created' ? 'Recovery Initiated' : 'Recovery Updated'
    const eventVerb = result.mode === 'created' ? 'initiated' : 'updated'

    await createNotification({
      clientId:         clientId,
      creditId:         body.creditId ?? null,
      notificationType: 'risk_escalation',
      priority:         body.stage === 'WriteOff' ? 'critical' : 'high',
      title:            `${actionLabel}: ${body.stage!.replace(/([A-Z])/g, ' $1').trim()}`,
      message:          `${session.username ?? 'RM'} ${eventVerb} a recovery case for client ${clientId}. Stage: ${body.stage}. ${body.assignedTo ? `Assigned to: ${body.assignedTo}.` : ''}`,
      assignedRM:       null,
    })

    emitSpectraEvent({
      type:     'recovery',
      clientId: clientId,
      actor:    session.username,
      message:  `Recovery ${eventVerb} (${body.stage}) by ${session.username}`,
    })

    return NextResponse.json(
      { ok: true, caseId: result.case.id, case: result.case, mode: result.mode },
      { status: result.mode === 'created' ? 201 : 200 }
    )
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
