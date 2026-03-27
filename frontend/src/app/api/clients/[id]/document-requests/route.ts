import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { createDocumentRequest, getDocumentRequests, markDocumentsReceived } from '@/lib/documentRequestService'
import { recordRichClientAction } from '@/lib/queries'
import { createNotification } from '@/lib/notificationService'

async function auth(req: NextRequest) {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) throw new Error('Unauthorized')
  const session = await verifyToken(token)
  return { username: (session as { username?: string; role: string }).username ?? session.role ?? 'risk_officer' }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)
    const requests = await getDocumentRequests(id)
    return NextResponse.json({ requests })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let username: string
  try { ({ username } = await auth(req)) }
  catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  try {
    const body = await req.json() as {
      requestedDocs?: string[]
      dueDate?:       string
      notes?:         string
      creditId?:      string
    }
    if (!body.requestedDocs?.length) {
      return NextResponse.json({ error: 'requestedDocs must be a non-empty array' }, { status: 400 })
    }

    const reqId = await createDocumentRequest({
      clientId:      id,
      creditId:      body.creditId     ?? null,
      requestedDocs: body.requestedDocs,
      requestedBy:   username,
      dueDate:       body.dueDate      ?? null,
      notes:         body.notes        ?? null,
    })

    await recordRichClientAction(
      id, 'Documents Requested', username, body.notes ?? undefined,
      { doc_request_id: reqId, requested_docs: body.requestedDocs }
    )

    await createNotification({
      clientId:         id,
      creditId:         body.creditId ?? null,
      notificationType: 'risk_escalation',
      priority:         'medium',
      title:            'Document Request Raised',
      message:          `${username} requested documents from client ${id}: ${body.requestedDocs.join(', ')}`,
      assignedRM:       null,
    })

    return NextResponse.json({ ok: true, id: reqId }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// PATCH /:reqId/received — mark documents as received
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)
    const { reqId } = await req.json() as { reqId: string }
    if (!reqId) return NextResponse.json({ error: 'reqId required' }, { status: 400 })
    await markDocumentsReceived(reqId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
