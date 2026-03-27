/**
 * POST /api/classify/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * Trigger a manual reclassification for a single client.
 * Accepts the current client signals, derives the implied IFRS stage and
 * composite risk score, persists a SystemAction if anything changed, and
 * notifies the assigned RM if the stage changed.
 *
 * GET /api/classify/[id]
 * Returns the SystemActions audit history for the client (stage change log).
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { classifyClient, ClassificationSignals } from '@/lib/classificationEngine'
import { getSystemActions } from '@/lib/notificationService'

// ─── POST — reclassify ─────────────────────────────────────────────────────

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
      creditId       = null,
      currentStage   = 1,
      currentRiskScore = 0,
      assignedRM     = session.username,
      signals,
    }: {
      creditId?:         string | null
      currentStage?:     number
      currentRiskScore?: number
      assignedRM?:       string
      signals:           ClassificationSignals
    } = body

    if (!signals) {
      return NextResponse.json({ error: 'signals object is required' }, { status: 400 })
    }

    const result = await classifyClient({
      clientId,
      creditId,
      currentStage,
      currentRiskScore,
      signals,
      assignedRM,
      triggeredBy: `manual:${session.username}`,
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// ─── GET — stage change audit history ─────────────────────────────────────

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
    const { searchParams }  = new URL(req.url)
    const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 100)

    const actions = await getSystemActions(clientId, limit)

    // Parse trigger_reason JSON for convenience
    const enriched = actions.map(a => ({
      ...a,
      trigger_reason: (() => {
        try { return a.trigger_reason ? JSON.parse(a.trigger_reason) : null }
        catch { return a.trigger_reason }
      })(),
    }))

    return NextResponse.json({ systemActions: enriched })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
