/**
 * GET  /api/monitoring/[id]/collateral
 * POST /api/monitoring/[id]/collateral
 * ─────────────────────────────────────────────────────────────────────────────
 * Collateral revaluation tracking for a single client.
 *
 * GET — returns collateral reviews, newest revaluation first.
 *   Query params:
 *     limit — max rows (default 20, max 100)
 *
 * POST — record a new collateral revaluation.
 *   Body:
 *   {
 *     revaluationDate:  string    — 'YYYY-MM-DD'
 *     newValue:         number    — updated market value (required)
 *     oldValue?:        number    — previous market value (optional)
 *     currentExposure?: number    — outstanding loan balance for LTV calculation
 *     creditId?:        string
 *     notes?:           string
 *   }
 *
 *   LTV is auto-calculated server-side as:
 *     ltv_recalculated = currentExposure / newValue × 100
 *   If currentExposure is omitted, ltv_recalculated is stored as NULL.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { createCollateralReview, getCollateralReviews } from '@/lib/monitoringService'

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
    const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 100)

    const reviews = await getCollateralReviews(clientId, limit)
    return NextResponse.json({ collateralReviews: reviews, count: reviews.length })
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

    const {
      revaluationDate,
      newValue,
      oldValue,
      currentExposure,
      creditId,
      notes,
    } = body as {
      revaluationDate:  string
      newValue:         number
      oldValue?:        number
      currentExposure?: number
      creditId?:        string
      notes?:           string
    }

    if (!revaluationDate) {
      return NextResponse.json({ error: 'revaluationDate is required (YYYY-MM-DD)' }, { status: 400 })
    }
    if (newValue == null || isNaN(Number(newValue)) || Number(newValue) <= 0) {
      return NextResponse.json({ error: 'newValue must be a positive number' }, { status: 400 })
    }
    // Loose ISO date check
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revaluationDate)) {
      return NextResponse.json({ error: 'revaluationDate must be in YYYY-MM-DD format' }, { status: 400 })
    }

    const id = await createCollateralReview({
      clientId,
      creditId:        creditId        ?? null,
      revaluationDate,
      oldValue:        oldValue        ?? null,
      newValue:        Number(newValue),
      currentExposure: currentExposure ?? null,
      reviewedBy:      session.username,
      notes:           notes           ?? null,
    })

    return NextResponse.json({ ok: true, id }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
