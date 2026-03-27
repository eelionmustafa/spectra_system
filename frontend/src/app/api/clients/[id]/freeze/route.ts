import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { freezeClientLimit, unfreezeClientLimit, getActiveFreezeLimit } from '@/lib/frozenLimitService'
import { recordRichClientAction } from '@/lib/queries'
import { createNotification } from '@/lib/notificationService'
import { emitSpectraEvent } from '@/lib/eventBus'

async function getSession(req: NextRequest) {
  void req
  const jar   = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 })
  const session = await verifyToken(token)
  if (!['risk_officer', 'admin'].includes(session.role)) {
    throw Object.assign(new Error('Forbidden: Freeze/Unfreeze requires Risk Officer or Admin'), { status: 403 })
  }
  return session
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const jar   = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)
    const freeze = await getActiveFreezeLimit(id)
    return NextResponse.json({ freeze })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let session: Awaited<ReturnType<typeof getSession>>
  try { session = await getSession(req) }
  catch (err) {
    const e = err as Error & { status?: number }
    return NextResponse.json({ error: e.message }, { status: e.status ?? 401 })
  }

  try {
    const { reason } = await req.json().catch(() => ({})) as { reason?: string }
    const username   = session.username

    const freezeId = await freezeClientLimit(id, username, reason ?? null)

    await recordRichClientAction(id, 'Credit Limit Frozen', username, reason ?? undefined, {
      freeze_id: freezeId,
      action: 'freeze',
    })

    await createNotification({
      clientId:         id,
      creditId:         null,
      notificationType: 'risk_escalation',
      priority:         'high',
      title:            'Credit Limit Frozen',
      message:          `${username} has frozen the credit limit for client ${id}${reason ? `: ${reason}` : ''}.`,
      assignedRM:       null,
    })

    emitSpectraEvent({
      type:     'freeze',
      clientId: id,
      actor:    username,
      message:  `Credit limit frozen by ${username}${reason ? ` — ${reason}` : ''}`,
    })

    return NextResponse.json({ ok: true, freezeId }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let session: Awaited<ReturnType<typeof getSession>>
  try { session = await getSession(req) }
  catch (err) {
    const e = err as Error & { status?: number }
    return NextResponse.json({ error: e.message }, { status: e.status ?? 401 })
  }

  try {
    const username = session.username
    await unfreezeClientLimit(id, username)
    await recordRichClientAction(id, 'Credit Limit Unfrozen', username)
    await createNotification({
      clientId:         id,
      creditId:         null,
      notificationType: 'risk_escalation',
      priority:         'medium',
      title:            'Credit Limit Unfrozen',
      message:          `${username} has lifted the credit limit freeze for client ${id}.`,
      assignedRM:       null,
    })

    emitSpectraEvent({
      type:     'unfreeze',
      clientId: id,
      actor:    username,
      message:  `Credit limit unfrozen by ${username}`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
