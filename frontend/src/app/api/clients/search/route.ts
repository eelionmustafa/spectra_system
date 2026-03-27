import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { searchClients, getHighRiskClientsList, getEWIFilteredClients, getFrozenClientIds } from '@/lib/queries'

export async function GET(req: NextRequest) {
  // Auth guard — every route must verify identity before touching client data
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const q   = req.nextUrl.searchParams.get('q')   ?? ''
    const ewi = req.nextUrl.searchParams.get('ewi') ?? ''
    const [results, frozenIds] = await Promise.all([
      ewi
        ? getEWIFilteredClients(ewi)
        : q.trim().length >= 2
          ? searchClients(q.trim())
          : getHighRiskClientsList(),
      getFrozenClientIds(),
    ])
    // Financial data must never be cached by CDN or shared caches.
    // private allows browser to cache for back-navigation but prevents proxies
    // from serving stale client data to wrong users.
    const resp = NextResponse.json(results.map(c => ({ ...c, frozen: frozenIds.has(c.personal_id) })))
    resp.headers.set('Cache-Control', 'no-store, private')
    return resp
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
