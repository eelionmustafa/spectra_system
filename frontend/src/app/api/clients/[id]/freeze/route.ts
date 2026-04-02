import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { freezeClientLimit, unfreezeClientLimit, getActiveFreezeLimit } from '@/lib/frozenLimitService'
import { recordRichClientAction, resolveClientFreezeAction } from '@/lib/queries'
import { createNotification } from '@/lib/notificationService'
import { emitSpectraEvent } from '@/lib/eventBus'
import { sendSystemMessage } from '@/lib/messagingService'
import { checkRateLimit, recordFailedAttempt, recordSuccess } from '@/lib/rateLimit'
import { upsertClientMonitoring } from '@/lib/monitoringService'

async function getSession(req: NextRequest) {
  void req
  const jar   = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 })
  const session = await verifyToken(token)
  if (!['credit_risk_manager', 'senior_risk_manager'].includes(session.role)) {
    throw Object.assign(new Error('Forbidden: Freeze/Unfreeze requires Credit Risk Manager or Senior Risk Manager'), { status: 403 })
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
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
  const rl = checkRateLimit(ip)
  if (!rl.allowed) {
    recordFailedAttempt(ip)
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }
  const { id } = await params
  let session: Awaited<ReturnType<typeof getSession>>
  try { session = await getSession(req) }
  catch (err) {
    const e = err as Error & { status?: number }
    return NextResponse.json({ error: e.message }, { status: e.status ?? 401 })
  }

  try {
    const { reason } = await req.json().catch(() => ({})) as { reason?: string }
    recordSuccess(ip)
    const username   = session.username
    const trimmedReason = reason?.trim() || null

    const freezeId = await freezeClientLimit(id, username, trimmedReason)

    await upsertClientMonitoring(id, 'Daily', true, trimmedReason ?? undefined)

    await recordRichClientAction(id, 'Credit Limit Frozen', username, trimmedReason ?? undefined, {
      freeze_id: freezeId,
      action: 'freeze',
    })

    await createNotification({
      clientId:         id,
      creditId:         null,
      notificationType: 'risk_escalation',
      priority:         'high',
      title:            'Credit Limit Frozen',
      message:          `${username} has frozen the credit limit for client ${id}${trimmedReason ? `: ${trimmedReason}` : ''}.`,
      assignedRM:       null,
    })

    emitSpectraEvent({
      type:     'freeze',
      clientId: id,
      actor:    username,
      message:  `Credit limit frozen by ${username}${trimmedReason ? ` — ${trimmedReason}` : ''}`,
    })

    sendSystemMessage(id, username, username, `🔒 Account Restricted\n\nYour credit limit has been temporarily frozen by our risk team.${trimmedReason ? `\n\nReason: ${trimmedReason}` : ''}\n\nPlease contact your branch or relationship manager to discuss next steps.`).catch(() => {})

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
    const { reason } = await req.json().catch(() => ({})) as { reason?: string }
    const trimmedReason = reason?.trim() || null

    await unfreezeClientLimit(id, username)
    await resolveClientFreezeAction(id)
    await upsertClientMonitoring(id, 'Monthly', false)

    const notes = trimmedReason
      ? `Credit limit restriction lifted. Reason: ${trimmedReason}`
      : 'Credit limit restriction lifted.'
    const metadata = { action: 'unfreeze', reason: trimmedReason }

    await recordRichClientAction(id, 'Credit Limit Unfrozen', username, notes, metadata)
    await createNotification({
      clientId:         id,
      creditId:         null,
      notificationType: 'risk_escalation',
      priority:         'medium',
      title:            'Credit Limit Unfrozen',
      message:          `${username} has lifted the credit limit freeze for client ${id}${trimmedReason ? `: ${trimmedReason}` : '.'}`,
      assignedRM:       null,
    })

    emitSpectraEvent({
      type:     'unfreeze',
      clientId: id,
      actor:    username,
      message:  `Credit limit unfrozen by ${username}${trimmedReason ? ` — ${trimmedReason}` : ''}`,
    })

    sendSystemMessage(id, username, username, `🔓 Account Restriction Lifted

Your credit limit restriction has been removed. Your account is now fully operational.

${trimmedReason ? `Reason: ${trimmedReason}\n\n` : ''}If you have any questions, please contact your branch.`).catch(() => {})

    return NextResponse.json({ ok: true, action: 'Credit Limit Unfrozen', notes, metadata })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
