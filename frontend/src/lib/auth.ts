import { SignJWT, jwtVerify } from 'jose'
import type { Role } from './users'

export interface SessionPayload {
  userId: string
  username: string
  name: string
  role: Role
  department: string
  initials: string
}

export const COOKIE_NAME = 'spectra_session'

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    if (process.env.NODE_ENV !== 'development') throw new Error('JWT_SECRET env var is not set')
    return new TextEncoder().encode('spectra-dev-secret-change-in-production')
  }
  return new TextEncoder().encode(secret)
}

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  return payload as unknown as SessionPayload
}

