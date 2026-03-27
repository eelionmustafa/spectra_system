import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'

export async function GET() {
  try {
    const jar   = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json(null)
    const session = await verifyToken(token)
    return NextResponse.json(session)
  } catch {
    return NextResponse.json(null)
  }
}
