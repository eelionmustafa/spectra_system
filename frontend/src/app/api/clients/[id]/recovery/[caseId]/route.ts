/**
 * PATCH /api/clients/[id]/recovery/[caseId]  — update stage, status, assignedTo, or notes
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { updateRecoveryCase, type RecoveryStage } from '@/lib/recoveryService'

const VALID_STAGES: RecoveryStage[] = [
  'DebtCollection',
  'CollateralEnforcement',
  'LegalProceedings',
  'DebtSale',
  'WriteOff',
]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; caseId: string }> }
) {
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    const { id: clientId, caseId } = await params
    const body = await req.json() as {
      stage?:      string
      assignedTo?: string | null
      status?:     string
      notes?:      string | null
    }

    if (body.stage && !VALID_STAGES.includes(body.stage as RecoveryStage)) {
      return NextResponse.json(
        { error: `stage must be one of: ${VALID_STAGES.join(', ')}` },
        { status: 400 }
      )
    }

    if (body.status && body.status !== 'Open' && body.status !== 'Closed') {
      return NextResponse.json(
        { error: 'status must be Open or Closed' },
        { status: 400 }
      )
    }

    await updateRecoveryCase(caseId, clientId, session.username, {
      stage:      body.stage      as RecoveryStage | undefined,
      assignedTo: body.assignedTo,
      status:     body.status     as 'Open' | 'Closed' | undefined,
      notes:      body.notes,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
