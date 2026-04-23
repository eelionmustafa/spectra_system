/**
 * GET /api/notifications
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns notifications for the currently authenticated RM user.
 * Includes both notifications addressed to them and broadcast notifications
 * (assigned_rm IS NULL).
 *
 * Query params:
 *   limit    — max rows to return (default 50, max 100)
 *   unread   — 'true' to return only unread notifications
 *
 * Response:
 * {
 *   notifications: NotificationRow[],
 *   unreadCount:   number
 * }
 *
 * POST /api/notifications/mark-all-read
 * Marks all unread notifications for the current user as read.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import {
  getNotificationsForUser,
  getUnreadCountForUser,
  markAllReadForUser,
} from '@/lib/notificationService'

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    const { searchParams } = new URL(req.url)
    const limit      = Math.min(Number(searchParams.get('limit') ?? '50'), 100)
    const unreadOnly = searchParams.get('unread') === 'true'

    const [notifications, unreadCount] = await Promise.all([
      getNotificationsForUser(session.username, limit),
      getUnreadCountForUser(session.username),
    ])

    const result = unreadOnly ? notifications.filter(n => !n.read_at) : notifications

    return NextResponse.json({ notifications: result, unreadCount }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// Mark all as read for the current user
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    const body = await req.json().catch(() => ({}))
    if (body?.action !== 'mark-all-read') {
      return NextResponse.json({ error: 'Unsupported action — use { action: "mark-all-read" }' }, { status: 400 })
    }

    await markAllReadForUser(session.username)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
