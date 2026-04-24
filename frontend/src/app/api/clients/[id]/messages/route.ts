import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { getMessages, sendMessage, markAllRead } from '@/lib/messagingService'
import { emitSpectraEvent } from '@/lib/eventBus'
import { recordClientAction } from '@/lib/queries'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try {
    session = await verifyToken(token)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const messages = await getMessages(id)
  // Side-effect: mark all client messages as read
  markAllRead(id, session.username, 'officer').catch(() => {})

  return NextResponse.json({ messages })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try {
    session = await verifyToken(token)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { body: msgBody, attachment } = body as {
    body?: string
    attachment?: { name: string; url: string; type: string }
  }

  const message = await sendMessage(id, 'officer', session.username, session.name, msgBody ?? null, attachment)

  const auditLabel = attachment ? `Sent Document: ${attachment.name}` : 'Sent Message'
  recordClientAction(id, auditLabel, session.username).catch(() => {})

  emitSpectraEvent({
    type:     'officer_message',
    clientId: id,
    actor:    session.username,
    message:  attachment ? `${session.username} sent a document to client ${id}: ${attachment.name}` : `${session.username} → client ${id}: ${(msgBody ?? '').slice(0, 80)}`,
  })

  return NextResponse.json({ message }, { status: 201 })
}
