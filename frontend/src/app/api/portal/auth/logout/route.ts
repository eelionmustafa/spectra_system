import { NextResponse } from 'next/server'
import { CLIENT_COOKIE } from '@/lib/clientAuth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(CLIENT_COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
