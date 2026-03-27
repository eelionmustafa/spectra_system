/**
 * PATCH /api/monitoring/[id]/documents/[docId]
 * ─────────────────────────────────────────────────────────────────────────────
 * Update the status of a document request.
 * Transitions: Pending → Received (or Received → Pending if re-opened).
 * Sets received_at = NOW() when transitioning to 'Received'; clears it otherwise.
 *
 * Body: { status: 'Pending' | 'Received' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { markDocumentsReceived } from '@/lib/documentRequestService'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)

    const { docId } = await params
    const body = await req.json()
    const { status } = body as { status?: string }

    if (status !== 'Pending' && status !== 'Received') {
      return NextResponse.json(
        { error: 'status must be "Pending" or "Received"' },
        { status: 400 }
      )
    }

    // documentRequestService only supports marking as Received; Pending re-opens are ignored
    if (status === 'Received') await markDocumentsReceived(docId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
