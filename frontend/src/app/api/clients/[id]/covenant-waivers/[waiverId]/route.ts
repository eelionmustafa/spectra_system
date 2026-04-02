/**
 * PATCH /api/clients/[id]/covenant-waivers/[waiverId]
 * ─────────────────────────────────────────────────────────────────────────────
 * Approve or reject a pending covenant waiver request.
 * Only risk_officer and admin roles may approve waivers.
 * Idempotent on already-decided waivers — the SQL WHERE clause filters for
 * status = 'Pending', so a second call is a silent no-op.
 *
 * Body:
 * {
 *   status:         'Approved' | 'Rejected'
 *   decisionNotes?: string
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { decideWaiver } from '@/lib/engagementService'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; waiverId: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    // Only risk officers and admins can approve / reject waivers
    if (!['credit_risk_manager', 'senior_risk_manager'].includes(session.role)) {
      return NextResponse.json({ error: 'Credit risk manager or senior risk manager role required' }, { status: 403 })
    }

    const { waiverId } = await params
    const body = await req.json()
    const { status, decisionNotes } = body as { status?: string; decisionNotes?: string }

    if (status !== 'Approved' && status !== 'Rejected') {
      return NextResponse.json({ error: 'status must be "Approved" or "Rejected"' }, { status: 400 })
    }

    await decideWaiver(waiverId, status, session.username, decisionNotes)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
