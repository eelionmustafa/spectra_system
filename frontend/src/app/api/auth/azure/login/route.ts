import { NextResponse } from 'next/server'
import { generateCodeVerifier, generateCodeChallenge, buildAuthorizationUrl } from '@/lib/azure-ad'
import crypto from 'crypto'

export async function GET() {
  try {
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)
    const state = crypto.randomBytes(16).toString('hex')
    const authUrl = buildAuthorizationUrl(codeChallenge, state)

    const res = NextResponse.redirect(authUrl)
    const cookieOpts = 'HttpOnly; SameSite=Lax; Path=/; Max-Age=600'
    res.headers.append('Set-Cookie', `pkce_verifier=${codeVerifier}; ${cookieOpts}`)
    res.headers.append('Set-Cookie', `azure_state=${state}; ${cookieOpts}`)
    return res
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
