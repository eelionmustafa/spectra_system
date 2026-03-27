/**
 * GET  /api/monitoring/[id]/documents
 * POST /api/monitoring/[id]/documents
 * ─────────────────────────────────────────────────────────────────────────────
 * Document request tracking for a single client.
 *
 * GET — returns list of document requests, newest first.
 *   Query params:
 *     limit  — max rows (default 50, max 100)
 *     status — 'Pending' | 'Received' to filter by status
 *
 * POST — create a new document request (status defaults to 'Pending').
 *   Body:
 *   {
 *     documentType: 'financial_statement' | 'bank_statement' | 'tax_return' | 'other'
 *     creditId?:    string
 *     notes?:       string
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { createDocumentRequest, getDocumentRequests } from '@/lib/documentRequestService'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)

    const { id: clientId } = await params
    const { searchParams } = new URL(req.url)
    const limit        = Math.min(Number(searchParams.get('limit') ?? '50'), 100)
    const statusFilter = searchParams.get('status')

    let requests = await getDocumentRequests(clientId, limit)

    if (statusFilter === 'Pending' || statusFilter === 'Received' || statusFilter === 'Overdue') {
      requests = requests.filter(r => r.status === statusFilter)
    }

    return NextResponse.json({ documentRequests: requests, count: requests.length })
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
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    const { id: clientId } = await params
    const body = await req.json()

    const { requestedDocs, creditId, dueDate, notes } = body as {
      requestedDocs?: string[]
      creditId?:      string
      dueDate?:       string
      notes?:         string
    }

    if (!requestedDocs?.length) {
      return NextResponse.json({ error: 'requestedDocs must be a non-empty array' }, { status: 400 })
    }

    const id = await createDocumentRequest({
      clientId,
      creditId:      creditId   ?? null,
      requestedDocs,
      requestedBy:   (session as { username?: string }).username ?? session.role ?? 'system',
      dueDate:       dueDate    ?? null,
      notes:         notes      ?? null,
    })

    return NextResponse.json({ ok: true, id }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
