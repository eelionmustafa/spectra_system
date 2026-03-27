import { NextRequest, NextResponse } from 'next/server'
import { clearAllCaches } from '@/lib/queries'
import { clearPredictionCache } from '@/lib/predictions'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  // Require admin role — this endpoint clears all caches and can degrade performance
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)
    if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  clearAllCaches()
  clearPredictionCache()
  return NextResponse.json({ ok: true, cleared_at: new Date().toISOString() })
}
