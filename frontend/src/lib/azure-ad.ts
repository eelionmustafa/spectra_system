import crypto from 'crypto'
import type { Role } from './users'

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

export function buildAuthorizationUrl(codeChallenge: string, state: string): string {
  const tenantId  = env('AZURE_AD_TENANT_ID')
  const clientId  = env('AZURE_AD_CLIENT_ID')
  const redirectUri = env('AZURE_AD_REDIRECT_URI')
  const params = new URLSearchParams({
    client_id:             clientId,
    response_type:         'code',
    redirect_uri:          redirectUri,
    scope:                 'openid profile email User.Read',
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
    state,
  })
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`
}

export async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<string> {
  const tenantId    = env('AZURE_AD_TENANT_ID')
  const clientId    = env('AZURE_AD_CLIENT_ID')
  const clientSecret = env('AZURE_AD_CLIENT_SECRET')
  const redirectUri  = env('AZURE_AD_REDIRECT_URI')

  const body = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    code_verifier: codeVerifier,
  })

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${res.status} ${text}`)
  }
  const data = await res.json() as { access_token: string }
  return data.access_token
}

export interface GraphProfile {
  id:                string
  userPrincipalName: string
  displayName:       string
  department?:       string
  jobTitle?:         string
}

export async function fetchGraphProfile(accessToken: string): Promise<GraphProfile> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Graph /me failed: ${res.status}`)
  return res.json() as Promise<GraphProfile>
}

export async function fetchGraphGroups(accessToken: string): Promise<string[]> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me/memberOf', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Graph /memberOf failed: ${res.status}`)
  const data = await res.json() as { value: { id: string }[] }
  return data.value.map(g => g.id)
}

export function mapGroupsToRole(groupIds: string[]): Role | null {
  const roleMap = process.env.AZURE_AD_ROLE_MAP ?? ''
  // Format: "groupId1:role1|groupId2:role2"
  for (const entry of roleMap.split('|')) {
    const [groupId, role] = entry.split(':')
    if (groupId && role && groupIds.includes(groupId.trim())) {
      return role.trim() as Role
    }
  }
  return null
}

export function deriveInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/)
  if (parts.length === 0) return ''
  const first = parts[0][0] ?? ''
  const last  = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase()
}
