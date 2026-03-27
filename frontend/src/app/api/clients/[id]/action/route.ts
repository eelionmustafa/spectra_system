import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { recordRichClientAction } from '@/lib/queries'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let username = 'risk_officer'
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)
    username = (session as { username?: string; role: string }).username ?? session.role ?? 'risk_officer'
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { action, notes } = await req.json() as { action?: string; notes?: string }
    if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 })
    await recordRichClientAction(id, action, username, notes)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
