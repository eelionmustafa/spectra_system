import { NextRequest, NextResponse } from 'next/server'
import { signClientToken, checkClientPassword, CLIENT_COOKIE } from '@/lib/clientAuth'
import { getClientProfile } from '@/lib/queries'
import { checkRateLimit, recordFailedAttempt, recordSuccess } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
    const rl = checkRateLimit(ip)
    if (!rl.allowed) {
      const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000)
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minutes.` },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
      )
    }

    const { accountId, password } = await req.json()

    if (!accountId || !password) {
      return NextResponse.json({ error: 'Account ID and password are required.' }, { status: 400 })
    }
    const pwOk = checkClientPassword(password)
    if (!pwOk) {
      recordFailedAttempt(ip)
      return NextResponse.json({ error: 'Invalid account number or password.' }, { status: 401 })
    }

    // Verify account exists in DB
    const profile = await getClientProfile(String(accountId).trim())
    if (!profile) {
      return NextResponse.json({ error: 'Invalid account number or password.' }, { status: 401 })
    }

    recordSuccess(ip)
    const token = await signClientToken(profile.personal_id)
    const res = NextResponse.json({ ok: true, clientId: profile.personal_id })
    res.cookies.set(CLIENT_COOKIE, token, {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    return res
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
