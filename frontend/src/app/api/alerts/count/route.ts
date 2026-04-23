import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { getCriticalAlertCount } from '@/lib/queries'

export async function GET(_req: NextRequest) {
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ count: 0 })
    await verifyToken(token)

    const count = await getCriticalAlertCount()
    return NextResponse.json({ count }, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' },
    })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
