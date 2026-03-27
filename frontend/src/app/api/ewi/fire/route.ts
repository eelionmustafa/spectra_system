/**
 * POST /api/ewi/fire
 * ─────────────────────────────────────────────────────────────────────────────
 * Called when a new EWI signal fires for a client — from the Python ML pipeline,
 * a scheduled job, or any internal process that detects a behavioural change.
 *
 * What happens:
 *  1. Receives the new EWI signal + full client signals snapshot.
 *  2. Recomputes the composite risk score.
 *  3. Derives the implied IFRS stage using SICR rules.
 *  4. If stage changed or risk score drifted ≥5 pts:
 *       a. Writes a SystemAction audit log entry (old stage → new stage).
 *       b. Creates a Notification for the assigned RM.
 *  5. Returns the full ClassificationResult.
 *
 * Request body:
 * {
 *   clientId:         string          — PersonalID
 *   creditId?:        string          — CreditAccount (optional)
 *   signal:           string          — e.g. 'salary_stopped' | 'overdraft_chronic'
 *                                             | 'dpd_change' | 'pd_update' | 'card_acceleration'
 *   currentStage:     1 | 2 | 3      — stage currently stored in RiskPortfolio
 *   currentRiskScore: number          — last stored composite risk score (0 = unknown)
 *   assignedRM:       string          — username of the RM who owns this client
 *   signals: {
 *     pdScore:            number      — 0–1
 *     currentDPD:         number
 *     missedPayments:     number
 *     salaryInflow:       string
 *     overdraft:          string
 *     cardUsage:          string
 *     stageMigrationProb: number
 *     ewiFlagCount:       number      — 0–6
 *     productType:        string
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { processEWISignal, EWISignalPayload } from '@/lib/classificationEngine'

const VALID_SIGNALS = new Set([
  'salary_stopped',
  'salary_alert',
  'overdraft_chronic',
  'overdraft_active',
  'card_acceleration',
  'card_critical',
  'dpd_change',
  'pd_update',
  'consecutive_lates',
  'exposure_spike',
  'zscore_anomaly',
  'score_deterioration',
])

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)

    const payload: EWISignalPayload = await req.json()

    // Validate required fields
    if (!payload.clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    }
    if (!payload.signal) {
      return NextResponse.json({ error: 'signal is required' }, { status: 400 })
    }
    if (!payload.signals) {
      return NextResponse.json({ error: 'signals object is required' }, { status: 400 })
    }

    // Warn on unknown signal types (non-fatal — future-proofs the API)
    if (!VALID_SIGNALS.has(payload.signal)) {
      console.warn(`[ewi/fire] Unknown signal type: ${payload.signal}`)
    }

    // Validate signal range bounds
    const s = payload.signals
    if (s.pdScore < 0 || s.pdScore > 1) {
      return NextResponse.json({ error: 'signals.pdScore must be between 0 and 1' }, { status: 400 })
    }
    if (s.ewiFlagCount < 0 || s.ewiFlagCount > 6) {
      return NextResponse.json({ error: 'signals.ewiFlagCount must be between 0 and 6' }, { status: 400 })
    }

    const result = await processEWISignal({
      clientId:         payload.clientId,
      creditId:         payload.creditId,
      signal:           payload.signal,
      currentStage:     payload.currentStage     ?? 1,
      currentRiskScore: payload.currentRiskScore ?? 0,
      assignedRM:       payload.assignedRM        ?? '',
      signals:          payload.signals,
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
