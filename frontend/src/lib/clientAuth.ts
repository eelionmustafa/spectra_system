import { SignJWT, jwtVerify } from 'jose'
import crypto from 'crypto'

export interface ClientSessionPayload {
  clientId: string
  type: 'client'
}

const CLIENT_COOKIE = 'spectra_client_session'

function getClientPassword(): string {
  const pw = process.env.CLIENT_PORTAL_PASSWORD
  if (!pw) {
    if (process.env.NODE_ENV !== 'development') throw new Error('CLIENT_PORTAL_PASSWORD env var is not set')
    return 'spectra2025'  // dev fallback only
  }
  return pw
}

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    if (process.env.NODE_ENV !== 'development') throw new Error('JWT_SECRET env var is not set')
    return new TextEncoder().encode('spectra-dev-secret-change-in-production')
  }
  return new TextEncoder().encode(secret)
}

export async function signClientToken(clientId: string): Promise<string> {
  return new SignJWT({ clientId, type: 'client' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getSecret())
}

export async function verifyClientToken(token: string): Promise<ClientSessionPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.type !== 'client') throw new Error('Not a client token')
  return payload as unknown as ClientSessionPayload
}

export function checkClientPassword(password: string): boolean {
  try {
    const expected = getClientPassword()
    // Use constant-time comparison to prevent timing attacks
    const a = Buffer.from(password)
    const b = Buffer.from(expected)
    if (a.length !== b.length) {
      // Still run timingSafeEqual on equal-length buffers to consume constant time,
      // then return false so length difference doesn't leak via timing.
      crypto.timingSafeEqual(Buffer.alloc(b.length), b)
      return false
    }
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export { CLIENT_COOKIE }
