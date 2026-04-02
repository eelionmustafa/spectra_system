import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { resolveClient, unresolveClient } from '@/lib/resolutionService'
import { recordRichClientAction } from '@/lib/queries'
import { emitSpectraEvent } from '@/lib/eventBus'
import { sendSystemMessage } from '@/lib/messagingService'

async function getSession(req: NextRequest) {
  void req
  const jar   = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 })
  return verifyToken(token)
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
    if (!['credit_risk_manager', 'senior_risk_manager'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { notes } = await req.json().catch(() => ({})) as { notes?: string }
    const username  = session.username

    await resolveClient(id, username, notes ?? null)
    await recordRichClientAction(id, 'Client Resolved', username, notes ?? undefined)
    emitSpectraEvent({
      type:    'resolve',
      clientId: id,
      actor:   username,
      message: `Client marked as resolved by ${username}${notes ? ` — ${notes}` : ''}`,
    })

    sendSystemMessage(id, username, username, `✅ Case Resolved\n\nYour account is now in good standing. All concerns have been reviewed and resolved by our risk team.\n\nNo further action is required on your end.${notes ? `\n\nNote: ${notes}` : ''}`).catch(() => {})

    return NextResponse.json({ ok: true }, { status: 201 })
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
    await unresolveClient(id)
    await recordRichClientAction(id, 'Resolution Removed', username)
    emitSpectraEvent({
      type:    'unresolve',
      clientId: id,
      actor:   username,
      message: `Client resolution removed by ${username}`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
