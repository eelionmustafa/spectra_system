import { NextRequest, NextResponse } from 'next/server'
import { findUser } from '@/lib/users'
import { signToken, COOKIE_NAME } from '@/lib/auth'
import { checkRateLimit, recordFailedAttempt, recordSuccess } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
    const rl = await checkRateLimit(ip)
    if (!rl.allowed) {
      const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000)
      return NextResponse.json(
        { ok: false, error: `Too many failed attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minutes.` },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
      )
    }

    const { username, password } = await req.json()

    const user = findUser(username?.trim() ?? '', password ?? '')
    if (!user) {
      await recordFailedAttempt(ip)
      return NextResponse.json(
        { ok: false, error: 'Invalid username or password' },
        { status: 401 }
      )
    }
    await recordSuccess(ip)

    const token = await signToken({
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      department: user.department,
      initials: user.initials,
    })

    const res = NextResponse.json({ ok: true })
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,  // 8 hours
      path: '/',
    })
    return res
  } catch {
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
