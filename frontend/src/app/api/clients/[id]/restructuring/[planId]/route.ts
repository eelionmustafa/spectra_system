/**
 * PATCH /api/clients/[id]/restructuring/[planId]
 * ─────────────────────────────────────────────────────────────────────────────
 * Advance or close a restructuring plan.
 * Approving a plan is gated to risk_officer and admin roles only.
 *
 * Body (all fields optional):
 * {
 *   status?:  'Proposed' | 'Approved' | 'Rejected' | 'Active' | 'Completed'
 *   notes?:   string
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { updateRestructuringPlan } from '@/lib/restructuringService'

const VALID_STATUSES = new Set(['Proposed', 'Approved', 'Rejected', 'Active', 'Completed'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    const { planId } = await params
    const body = await req.json()
    const { status, notes } = body as { status?: string; notes?: string }

    if (!status && notes === undefined) {
      return NextResponse.json({ error: 'At least one of status or notes is required' }, { status: 400 })
    }
    if (status !== undefined && !VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { error: 'status must be: Proposed | Approved | Rejected | Active | Completed' },
        { status: 400 }
      )
    }

    // Approving a plan requires elevated role
    if (status === 'Approved' && !['credit_risk_manager', 'senior_risk_manager'].includes(session.role)) {
      return NextResponse.json({ error: 'Credit risk manager or senior risk manager required to approve plans' }, { status: 403 })
    }

    await updateRestructuringPlan(planId, {
      status:     status as 'Proposed' | 'Approved' | 'Rejected' | 'Active' | 'Completed',
      approvedBy: status === 'Approved' ? session.username : undefined,
      notes,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
