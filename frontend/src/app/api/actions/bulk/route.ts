/**
 * POST /api/actions/bulk
 * ─────────────────────────────────────────────────────────────────────────────
 * Apply a single action to multiple clients at once.
 *
 * Body:
 * {
 *   clientIds: string[]   — non-empty, max 100
 *   action:    string     — one of ALLOWED_ACTIONS
 *   notes?:    string
 * }
 *
 * Returns: { ok: true, count: number, failed: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { recordClientAction, removeFromWatchlist } from '@/lib/queries'

const ALLOWED_ACTIONS = new Set([
  'Add to Watchlist',
  'Flag for Review',
  'Request Documents',
  'Remove from Watchlist',
])

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    const body = await req.json()
    const { clientIds, action, notes } = body as {
      clientIds?: unknown
      action?:    string
      notes?:     string
    }

    if (!Array.isArray(clientIds) || clientIds.length === 0) {
      return NextResponse.json({ error: 'clientIds must be a non-empty array' }, { status: 400 })
    }
    if (clientIds.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 clients per bulk action' }, { status: 400 })
    }
    if (!action || !ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({
        error: `action must be one of: ${[...ALLOWED_ACTIONS].join(' | ')}`,
      }, { status: 400 })
    }

    const failed: string[] = []
    let count = 0

    await Promise.all(
      (clientIds as string[]).map(async (clientId) => {
        try {
          if (action === 'Remove from Watchlist') {
            await removeFromWatchlist(clientId)
          } else {
            await recordClientAction(clientId, action, session.username)
          }
          count++
        } catch {
          failed.push(clientId)
        }
      })
    )

    return NextResponse.json({ ok: true, count, failed })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
