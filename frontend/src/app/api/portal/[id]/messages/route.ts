import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyClientToken, CLIENT_COOKIE } from '@/lib/clientAuth'
import { getMessages, sendMessage, markAllRead } from '@/lib/messagingService'
import { emitSpectraEvent } from '@/lib/eventBus'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(CLIENT_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let payload
  try {
    payload = await verifyClientToken(token)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (payload.clientId !== id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const messages = await getMessages(id)
  // Side-effect: mark all officer messages as read by client
  markAllRead(id, id, 'client').catch(() => {})

  return NextResponse.json({ messages })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(CLIENT_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let payload
  try {
    payload = await verifyClientToken(token)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (payload.clientId !== id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { body: msgBody, attachment } = body as {
    body?: string
    attachment?: { name: string; url: string; type: string }
  }

  const message = await sendMessage(id, 'client', id, null, msgBody ?? null, attachment)

  emitSpectraEvent({
    type:     'client_message',
    clientId: id,
    actor:    id,
    message:  attachment ? `Client ${id} sent a document: ${attachment.name}` : `Client ${id}: ${(msgBody ?? '').slice(0, 80)}`,
  })

  return NextResponse.json({ message }, { status: 201 })
}
