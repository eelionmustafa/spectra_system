/**
 * POST /api/automation/salary-sweep
 * ---------------------------------------------------------------------------
 * Runs a portfolio-wide salary sweep. Requires senior_risk_manager role.
 * Designed to be called by a nightly cron job or manually by an admin.
 *
 * Response: { processed, swept, skipped, errors, results[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { runPortfolioSweep } from '@/lib/salarySweepService'

export async function POST(_req: NextRequest) {
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    const allowedRoles = ['credit_risk_manager', 'senior_risk_manager', 'collections_officer']
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json({ error: 'Insufficient role — credit_risk_manager, senior_risk_manager or collections_officer required' }, { status: 403 })
    }

    const username = (session as { username?: string; role: string }).username ?? session.role

    const result = await runPortfolioSweep(username)

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
