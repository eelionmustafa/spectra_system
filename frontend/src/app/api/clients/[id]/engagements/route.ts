/**
 * GET  /api/clients/[id]/engagements
 * POST /api/clients/[id]/engagements
 * ─────────────────────────────────────────────────────────────────────────────
 * RM meeting and call log for a single client.
 *
 * GET — returns engagements newest-first.
 *   Query params:
 *     limit  — max rows (default 50, max 100)
 *     type   — 'call' | 'meeting' to filter by type
 *     status — 'scheduled' | 'completed' | 'cancelled' to filter by status
 *
 * POST — schedule a new engagement (status defaults to 'scheduled').
 *   Body:
 *   {
 *     type:          'call' | 'meeting'
 *     scheduledAt?:  string   — ISO datetime, defaults to now
 *     creditId?:     string
 *     notes?:        string
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { createEngagement, getEngagements } from '@/lib/engagementService'
import { createNotification } from '@/lib/notificationService'
import { emitSpectraEvent } from '@/lib/eventBus'
import { sendSystemMessage } from '@/lib/messagingService'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)

    const { id: clientId } = await params
    const { searchParams } = new URL(req.url)
    const limit      = Math.min(Number(searchParams.get('limit') ?? '50'), 100)
    const typeFilter = searchParams.get('type')
    const statusFilter = searchParams.get('status')

    let engagements = await getEngagements(clientId, limit)

    if (typeFilter === 'call' || typeFilter === 'meeting') {
      engagements = engagements.filter(e => e.type === typeFilter)
    }
    if (statusFilter === 'scheduled' || statusFilter === 'completed' || statusFilter === 'cancelled') {
      engagements = engagements.filter(e => e.status === statusFilter)
    }

    return NextResponse.json({ engagements, count: engagements.length })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    const { id: clientId } = await params
    const body = await req.json()

    const { type, scheduledAt, creditId, notes } = body as {
      type:          string
      scheduledAt?:  string
      creditId?:     string
      notes?:        string
    }

    if (type !== 'call' && type !== 'meeting') {
      return NextResponse.json({ error: 'type must be "call" or "meeting"' }, { status: 400 })
    }

    const id = await createEngagement({
      clientId,
      creditId:    creditId    ?? null,
      type,
      scheduledAt: scheduledAt ?? new Date().toISOString(),
      notes:       notes       ?? null,
      loggedBy:    session.username,
    })

    await createNotification({
      clientId:         clientId,
      creditId:         creditId ?? null,
      notificationType: 'risk_escalation',
      priority:         'low',
      title:            type === 'call' ? 'Call Scheduled' : 'Meeting Scheduled',
      message:          `${session.username ?? 'RM'} scheduled a ${type} with client ${clientId} for ${scheduledAt ?? 'now'}.`,
      assignedRM:       null,
    })

    emitSpectraEvent({
      type:     'engagement',
      clientId: clientId,
      actor:    session.username,
      message:  `${type === 'call' ? 'Call' : 'Meeting'} scheduled by ${session.username}`,
    })

    const when = scheduledAt ? new Date(scheduledAt).toLocaleString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'shortly'
    sendSystemMessage(clientId, session.username, session.username, `📅 ${type === 'call' ? 'Call' : 'Meeting'} Scheduled\n\nYour advisor has scheduled a ${type} with you on ${when}.${notes ? `\n\n${notes}` : ''}\n\nPlease ensure you are available at the scheduled time.`).catch(() => {})

    return NextResponse.json({ ok: true, id }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
