import crypto from 'crypto'

export type Role = 'admin' | 'risk_officer' | 'analyst'

/** Public user type — never exposes credential fields. */
export interface User {
  id:         string
  username:   string
  name:       string
  role:       Role
  department: string
  initials:   string
}

// Internal stored record — includes hashed credential material.
interface StoredUser extends User {
  salt:         string  // per-user random salt
  passwordHash: string  // hex-encoded scrypt(password, salt, 64)
}

/**
 * Password hashes generated with:
 *   crypto.scryptSync(password, salt, 64).toString('hex')
 *
 * To add or update a user run:
 *   node -e "
 *     const c = require('crypto')
 *     console.log(c.scryptSync('<password>', '<salt>', 64).toString('hex'))
 *   "
 * Use a unique salt per user (random string, not secret).
 */
const STORED_USERS: StoredUser[] = [
  {
    id: '1', username: 'admin', name: 'System Admin',
    role: 'admin', department: 'IT Administration', initials: 'SA',
    salt: 'spectra_sa_v1',
    passwordHash: '307bd0cfd55661a00ede9a84f8aa54abd07396ada2961c265e0c41e7d0bddc2d331df965531a31d6f7339442c5da468d2f8cb60b7dd997d1de558a3cc0ab0362',
  },
  {
    id: '2', username: 'risk_officer', name: 'Risk Officer',
    role: 'risk_officer', department: 'Credit Risk Dept', initials: 'RO',
    salt: 'spectra_ro_v1',
    passwordHash: '962a0a6621f91479db678b2b8863a7372be14e46506e4f4f8eced29fccc20502098476090ce4dcd81eb898c760787caad4185a2e832988329caee7aa90fb5a6f',
  },
  {
    id: '3', username: 'analyst', name: 'Junior Analyst',
    role: 'analyst', department: 'Credit Risk Dept', initials: 'JA',
    salt: 'spectra_ja_v1',
    passwordHash: '4980a2e4dc24bc3c60467b5164155c221a054fc72b23215ce5c4727d1b8c14b2b2fa4211defe0f779bbeb424cae0dc7cf65ae5fe7e3929035665137e572b627c',
  },
]

function _verify(password: string, salt: string, storedHash: string): boolean {
  try {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex')
    return crypto.timingSafeEqual(
      Buffer.from(hash,       'hex'),
      Buffer.from(storedHash, 'hex'),
    )
  } catch {
    return false
  }
}

/** Public user list — credential fields stripped. Used by settings/page.tsx. */
export const USERS: User[] = STORED_USERS.map(({ salt: _s, passwordHash: _h, ...u }) => u)

export function findUser(username: string, password: string): User | null {
  const stored = STORED_USERS.find(u => u.username === username)
  if (!stored) return null
  if (!_verify(password, stored.salt, stored.passwordHash)) return null
  const { salt: _s, passwordHash: _h, ...user } = stored
  return user
}

/** Actions that require risk_officer or admin role */
export const RESTRICTED_ACTIONS = new Set([
  'Freeze Account', 'Freeze account',
  'Legal Review', 'Legal review', 'Legal referral',
  'Escalate', 'Escalate case', 'Escalate → Recovery',
  'Restructure',
])

/** Role display labels and colours */
export const ROLE_BADGE: Record<Role, { label: string; color: string }> = {
  admin:        { label: 'Admin',        color: '#C9A84C' },
  risk_officer: { label: 'Risk Officer', color: '#60A5FA' },
  analyst:      { label: 'Analyst',      color: '#94A3B8' },
}
