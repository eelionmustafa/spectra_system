/**
 * GET  /api/clients/[id]/covenant-waivers
 * POST /api/clients/[id]/covenant-waivers
 * ─────────────────────────────────────────────────────────────────────────────
 * Covenant waiver request tracking for a single client.
 *
 * GET — returns waiver requests, newest first.
 *   Query params:
 *     limit  — max rows (default 50, max 100)
 *     status — 'Pending' | 'Approved' | 'Rejected' to filter
 *
 * POST — raise a new waiver request (status defaults to 'Pending').
 *   Body:
 *   {
 *     waiverType:    'financial_covenant' | 'reporting_covenant' | 'maintenance_covenant' | 'other'
 *     requestedDate: string    — 'YYYY-MM-DD', defaults to today
 *     reason?:       string
 *     creditId?:     string
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { createWaiver, getWaivers } from '@/lib/engagementService'

const VALID_WAIVER_TYPES = new Set([
  'financial_covenant',
  'reporting_covenant',
  'maintenance_covenant',
  'other',
])

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

    let waivers = await getWaivers(clientId, limit)

    if (statusFilter === 'Pending' || statusFilter === 'Approved' || statusFilter === 'Rejected') {
      waivers = waivers.filter(w => w.status === statusFilter)
    }

    return NextResponse.json({ waivers, count: waivers.length })
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

    const { waiverType, requestedDate, reason, creditId } = body as {
      waiverType:     string
      requestedDate?: string
      reason?:        string
      creditId?:      string
    }

    if (!waiverType) {
      return NextResponse.json({ error: 'waiverType is required' }, { status: 400 })
    }
    if (!VALID_WAIVER_TYPES.has(waiverType)) {
      return NextResponse.json(
        { error: 'waiverType must be: financial_covenant | reporting_covenant | maintenance_covenant | other' },
        { status: 400 }
      )
    }

    const today = new Date().toISOString().slice(0, 10)
    const date  = requestedDate ?? today

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'requestedDate must be YYYY-MM-DD' }, { status: 400 })
    }

    const id = await createWaiver({
      clientId,
      creditId:      creditId ?? null,
      waiverType,
      requestedDate: date,
      requestedBy:   session.username,
      reason:        reason   ?? null,
    })

    return NextResponse.json({ ok: true, id }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
