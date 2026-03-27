/**
 * POST /api/notifications/[id]/read
 * ─────────────────────────────────────────────────────────────────────────────
 * Marks a single notification as read for the current user.
 * Sets read_at = NOW() only if the notification belongs to them (or is a
 * broadcast) and is currently unread.
 *
 * Idempotent — calling it on an already-read notification is a no-op.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { markNotificationRead } from '@/lib/notificationService'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    await markNotificationRead(id, session.username)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
