import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { executeSweep, detectSalaryCredit, getOverdueInstalments } from '@/lib/salarySweepService'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)

    const [salaryCredit, instalments] = await Promise.all([
      detectSalaryCredit(id),
      getOverdueInstalments(id),
    ])

    const overdueTotal = instalments.reduce((s, i) => s + i.overdueAmount, 0)

    return NextResponse.json({
      clientId:     id,
      salaryCredit,
      instalments,
      overdueTotal,
      eligible:     !!salaryCredit && instalments.length > 0,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)
    if (!['admin', 'risk_officer'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const username = (session as { username?: string; role: string }).username ?? session.role ?? 'risk_officer'

    const result = await executeSweep(id, username)

    if (!result.eligible && !result.alreadySwept) {
      return NextResponse.json({ ok: false, reason: result.reason, result }, { status: 200 })
    }

    return NextResponse.json({ ok: true, result }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
