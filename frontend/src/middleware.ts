import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { COOKIE_NAME } from '@/lib/auth'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'spectra-dev-secret-change-in-production'
)

const PUBLIC = ['/login', '/api/auth/login', '/api/auth/logout', '/api/db/ping', '/demo', '/api/payment/demo-simulate', '/api/payment/recent', '/api/payment/demo-reset']

// Portal routes handle their own auth (spectra_client_session)
const PORTAL = ['/portal', '/api/portal']

function withPathname(res: NextResponse, pathname: string) {
  res.headers.set('x-pathname', pathname)
  return res
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow public auth paths and Next.js internals
  if (PUBLIC.some(p => pathname.startsWith(p))) return withPathname(NextResponse.next(), pathname)
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') return NextResponse.next()

  // Portal routes manage their own session — let them through
  if (PORTAL.some(p => pathname.startsWith(p))) return withPathname(NextResponse.next(), pathname)

  const token = req.cookies.get(COOKIE_NAME)?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  try {
    await jwtVerify(token, SECRET)
    return withPathname(NextResponse.next(), pathname)
  } catch {
    // Expired or tampered token — clear it and redirect to login
    const res = NextResponse.redirect(new URL('/login', req.url))
    res.cookies.delete(COOKIE_NAME)
    return res
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
