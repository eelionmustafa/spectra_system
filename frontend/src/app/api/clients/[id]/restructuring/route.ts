/**
 * GET  /api/clients/[id]/restructuring
 * POST /api/clients/[id]/restructuring
 * ─────────────────────────────────────────────────────────────────────────────
 * Restructuring plan management for a single client.
 *
 * GET — returns all restructuring plans, newest first.
 *   Query params:
 *     limit  — max rows (default 20, max 50)
 *     status — 'Proposed' | 'Approved' | 'Rejected' | 'Active' | 'Completed' to filter
 *
 * POST — propose a new restructuring plan (status defaults to 'Proposed').
 *   Body:
 *   {
 *     type:                   'LoanExtension' | 'PaymentHoliday' | 'RateReduction' |
 *                             'DebtConsolidation' | 'PartialWriteOff'
 *     creditId?:              string
 *     newMaturityDate?:       string   — 'YYYY-MM-DD', required for LoanExtension
 *     holidayDurationMonths?: number   — positive integer, required for PaymentHoliday
 *     newInterestRate?:       number   — positive float, required for RateReduction
 *     forgivenAmount?:        number   — positive float, for DebtConsolidation / PartialWriteOff
 *     notes?:                 string
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { createRestructuringPlan, getRestructuringPlans } from '@/lib/restructuringService'
import { createNotification } from '@/lib/notificationService'
import { emitSpectraEvent } from '@/lib/eventBus'

const VALID_PLAN_TYPES = new Set([
  'LoanExtension',
  'PaymentHoliday',
  'RateReduction',
  'DebtConsolidation',
  'PartialWriteOff',
])

const VALID_STATUSES = new Set(['Proposed', 'Approved', 'Rejected', 'Active', 'Completed'])

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)

    const { id: clientId } = await params
    const { searchParams } = new URL(req.url)
    const limit        = Math.min(Number(searchParams.get('limit') ?? '20'), 50)
    const statusFilter = searchParams.get('status')

    let plans = await getRestructuringPlans(clientId, limit)

    if (statusFilter && VALID_STATUSES.has(statusFilter)) {
      plans = plans.filter(p => p.status === statusFilter)
    }

    return NextResponse.json({ plans, count: plans.length })
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
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    if (!['risk_underwriter', 'credit_risk_manager', 'senior_risk_manager'].includes(session.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Restructuring proposals require Risk Underwriter, Credit Risk Manager or Senior Risk Manager' },
        { status: 403 }
      )
    }

    const { id: clientId } = await params
    const body = await req.json()

    const {
      type,
      creditId,
      newMaturityDate,
      holidayDurationMonths,
      newInterestRate,
      forgivenAmount,
      notes,
    } = body as {
      type:                   string
      creditId?:              string
      newMaturityDate?:       string
      holidayDurationMonths?: number
      newInterestRate?:       number
      forgivenAmount?:        number
      notes?:                 string
    }

    if (!type) {
      return NextResponse.json({ error: 'type is required' }, { status: 400 })
    }
    if (!VALID_PLAN_TYPES.has(type)) {
      return NextResponse.json(
        { error: 'type must be: LoanExtension | PaymentHoliday | RateReduction | DebtConsolidation | PartialWriteOff' },
        { status: 400 }
      )
    }

    if (newMaturityDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(newMaturityDate)) {
      return NextResponse.json({ error: 'newMaturityDate must be YYYY-MM-DD' }, { status: 400 })
    }
    if (holidayDurationMonths !== undefined && (!Number.isInteger(holidayDurationMonths) || holidayDurationMonths <= 0)) {
      return NextResponse.json({ error: 'holidayDurationMonths must be a positive integer' }, { status: 400 })
    }
    if (newInterestRate !== undefined && (typeof newInterestRate !== 'number' || newInterestRate <= 0)) {
      return NextResponse.json({ error: 'newInterestRate must be a positive number' }, { status: 400 })
    }
    if (forgivenAmount !== undefined && (typeof forgivenAmount !== 'number' || forgivenAmount <= 0)) {
      return NextResponse.json({ error: 'forgivenAmount must be a positive number' }, { status: 400 })
    }

    const id = await createRestructuringPlan({
      clientId,
      creditId:              creditId              ?? null,
      type,
      newMaturityDate:       newMaturityDate        ?? null,
      holidayDurationMonths: holidayDurationMonths  ?? null,
      newInterestRate:       newInterestRate        ?? null,
      forgivenAmount:        forgivenAmount         ?? null,
      notes:                 notes                 ?? null,
      createdBy:             session.username,
    })

    await createNotification({
      clientId:         clientId,
      creditId:         creditId ?? null,
      notificationType: 'risk_escalation',
      priority:         'medium',
      title:            `Restructuring Proposed: ${type.replace(/([A-Z])/g, ' $1').trim()}`,
      message:          `${session.username ?? 'RM'} proposed a restructuring plan (${type}) for client ${clientId}.${notes ? ` Notes: ${notes}` : ''}`,
      assignedRM:       null,
    })

    emitSpectraEvent({
      type:     'restructuring',
      clientId: clientId,
      actor:    session.username,
      message:  `Restructuring proposed (${type}) by ${session.username}`,
    })

    return NextResponse.json({ ok: true, id }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
