/**
 * PATCH /api/clients/[id]/engagements/[engId]
 * ─────────────────────────────────────────────────────────────────────────────
 * Update the status and/or outcome of an engagement after it has occurred.
 *
 * Body (all fields optional — only provided fields are updated):
 * {
 *   status?:  'scheduled' | 'completed' | 'cancelled'
 *   outcome?: string
 *     — Calls:    'reached' | 'no_answer' | 'rescheduled'
 *     — Meetings: 'productive' | 'inconclusive' | 'cancelled'
 *   notes?:   string    — updated or appended notes
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { updateEngagement } from '@/lib/engagementService'

const VALID_STATUSES  = new Set(['scheduled', 'completed', 'cancelled'])
const VALID_OUTCOMES  = new Set(['reached', 'no_answer', 'rescheduled', 'productive', 'inconclusive', 'cancelled'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; engId: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)

    const { engId } = await params
    const body = await req.json()
    const { status, outcome, notes } = body as {
      status?:  string
      outcome?: string
      notes?:   string
    }

    if (status !== undefined && !VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { error: 'status must be: scheduled | completed | cancelled' },
        { status: 400 }
      )
    }
    if (outcome !== undefined && !VALID_OUTCOMES.has(outcome)) {
      return NextResponse.json(
        { error: 'outcome must be: reached | no_answer | rescheduled | productive | inconclusive | cancelled' },
        { status: 400 }
      )
    }
    if (!status && !outcome && notes === undefined) {
      return NextResponse.json({ error: 'At least one of status, outcome, or notes is required' }, { status: 400 })
    }

    await updateEngagement(engId, { status: status as 'scheduled' | 'completed' | 'cancelled', outcome, notes })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
