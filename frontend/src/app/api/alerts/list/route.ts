import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { getActiveAlerts } from '@/lib/queries'

export async function GET(_req: NextRequest) {
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)

    const all = await getActiveAlerts()
    // Return top 8 sorted by severity then DPD
    const top = all
      .sort((a, b) => {
        const sev = (x: typeof a) => x.severity === 'critical' ? 0 : x.severity === 'high' ? 1 : 2
        return sev(a) - sev(b) || b.due_days - a.due_days
      })
      .slice(0, 8)
    return NextResponse.json({ alerts: top, total: all.length }, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' },
    })
  } catch {
    return NextResponse.json({ alerts: [], total: 0 })
  }
}
