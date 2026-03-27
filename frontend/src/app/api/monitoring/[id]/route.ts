/**
 * GET /api/monitoring/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the full enhanced-monitoring snapshot for a single client.
 *
 * Response:
 * {
 *   monitoring: {
 *     client_id:        string
 *     review_frequency: 'Monthly' | 'Weekly' | 'Daily'
 *     is_freezed:       boolean
 *     freeze_reason:    string | null
 *     frozen_at:        string | null   (ISO datetime)
 *     updated_at:       string
 *   } | null,          — null when client has no monitoring record yet
 *   documentRequests:  DocumentRequestRow[]
 *   collateralReviews: CollateralReviewRow[]
 * }
 *
 * PATCH /api/monitoring/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * Manually update review_frequency or is_freezed for a client.
 * RMs can also manually unfreeze (is_freezed: false) from here.
 *
 * Body: { reviewFrequency?: 'Monthly'|'Weekly'|'Daily', isFreezed?: boolean, freezeReason?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import {
  getClientMonitoring,
  getCollateralReviews,
  upsertClientMonitoring,
} from '@/lib/monitoringService'
import { getDocumentRequests } from '@/lib/documentRequestService'

const VALID_FREQUENCIES = new Set(['Monthly', 'Weekly', 'Daily'])

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)

    const { id: clientId } = await params

    const [monitoring, documentRequests, collateralReviews] = await Promise.all([
      getClientMonitoring(clientId),
      getDocumentRequests(clientId),
      getCollateralReviews(clientId),
    ])

    return NextResponse.json({ monitoring, documentRequests, collateralReviews })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)

    const { id: clientId } = await params
    const body = await req.json()

    const { reviewFrequency, isFreezed, freezeReason } = body as {
      reviewFrequency?: string
      isFreezed?:       boolean
      freezeReason?:    string
    }

    if (reviewFrequency !== undefined && !VALID_FREQUENCIES.has(reviewFrequency)) {
      return NextResponse.json(
        { error: 'reviewFrequency must be one of: Monthly, Weekly, Daily' },
        { status: 400 }
      )
    }

    // Read current state so we can keep unchanged fields as-is
    const current = await getClientMonitoring(clientId)

    const newFrequency = (reviewFrequency ?? current?.review_frequency ?? 'Monthly') as 'Monthly' | 'Weekly' | 'Daily'
    const newFreezed   = isFreezed  !== undefined ? isFreezed  : (current?.is_freezed ?? false)
    const newReason    = freezeReason !== undefined ? freezeReason : (current?.freeze_reason ?? undefined)

    await upsertClientMonitoring(clientId, newFrequency, newFreezed, newReason)

    const updated = await getClientMonitoring(clientId)
    return NextResponse.json({ monitoring: updated })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
