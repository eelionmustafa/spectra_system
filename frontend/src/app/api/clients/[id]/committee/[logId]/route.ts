/**
 * PATCH /api/clients/[id]/committee/[logId]
 * ─────────────────────────────────────────────────────────────────────────────
 * Record a credit committee decision on an existing escalation.
 *
 * Body:
 * {
 *   decision:     'Restructure' | 'LegalAction' | 'WriteOff'
 *   decisionDate?: 'YYYY-MM-DD'   (defaults to today)
 *   notes?:        string
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { updateCommitteeDecision } from '@/lib/committeeService'

const VALID_DECISIONS = new Set(['Restructure', 'LegalAction', 'WriteOff'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; logId: string }> }
) {
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    const { id: clientId, logId } = await params
    const body = await req.json() as {
      decision:      string
      decisionDate?: string
      notes?:        string
    }

    if (!body.decision) {
      return NextResponse.json({ error: 'decision is required' }, { status: 400 })
    }
    if (!VALID_DECISIONS.has(body.decision)) {
      return NextResponse.json(
        { error: 'decision must be: Restructure | LegalAction | WriteOff' },
        { status: 400 }
      )
    }
    if (body.decisionDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.decisionDate)) {
      return NextResponse.json({ error: 'decisionDate must be YYYY-MM-DD' }, { status: 400 })
    }

    await updateCommitteeDecision(
      logId,
      clientId,
      session.username,
      body.decision as 'Restructure' | 'LegalAction' | 'WriteOff',
      {
        decisionDate: body.decisionDate ?? new Date().toISOString().slice(0, 10),
        notes:        body.notes       ?? null,
      }
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
