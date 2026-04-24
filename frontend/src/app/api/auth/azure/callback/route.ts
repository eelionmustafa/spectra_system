import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  exchangeCodeForToken,
  fetchGraphProfile,
  fetchGraphGroups,
  mapGroupsToRole,
  deriveInitials,
} from '@/lib/azure-ad'
import { signToken, COOKIE_NAME } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const code  = searchParams.get('code')
    const state = searchParams.get('state')

    if (!code || !state) {
      return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
    }

    const jar = await cookies()
    const storedVerifier = jar.get('pkce_verifier')?.value
    const storedState    = jar.get('azure_state')?.value

    if (!storedVerifier || !storedState || state !== storedState) {
      return NextResponse.json({ error: 'Invalid state — possible CSRF attempt' }, { status: 400 })
    }

    const accessToken = await exchangeCodeForToken(code, storedVerifier)

    const [profile, groupIds] = await Promise.all([
      fetchGraphProfile(accessToken),
      fetchGraphGroups(accessToken),
    ])

    const role = mapGroupsToRole(groupIds)
    if (!role) {
      return NextResponse.json(
        { error: 'Your account is not assigned to a SPECTRA role. Contact your administrator.' },
        { status: 403 }
      )
    }

    const token = await signToken({
      userId:     profile.id,
      username:   profile.userPrincipalName,
      name:       profile.displayName,
      role,
      department: profile.department ?? profile.jobTitle ?? '',
      initials:   deriveInitials(profile.displayName),
    })

    const res = NextResponse.redirect(new URL('/', req.url))

    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 8,
      path:     '/',
    })

    // Clear PKCE cookies
    res.cookies.set('pkce_verifier', '', { maxAge: 0, path: '/' })
    res.cookies.set('azure_state',   '', { maxAge: 0, path: '/' })

    return res
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
