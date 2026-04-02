import crypto from 'crypto'

export type Role =
  | 'risk_underwriter'
  | 'credit_risk_manager'
  | 'collections_officer'
  | 'senior_risk_manager'
  | 'auditor'

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
 * Password hash registry
 * ─────────────────────────────────────────────────────────────────────────────
 * Last rotated: 2026-04-01
 * Rotation policy: every 90 days (next rotation: 2026-07-01)
 *
 * To regenerate hashes after a password change, run:
 *   node -e "
 *     const c = require('crypto')
 *     const pw = '<new_password>'
 *     const salt = '<username>_salt_v<n>'
 *     console.log(c.scryptSync(pw, salt, 64).toString('hex'))
 *   "
 * Use a unique salt per user (e.g. 'spectra_ana_v2'). Increment version on
 * each rotation so old tokens are automatically invalidated.
 * Demo exception: demo / demospectra
 *
 * Password per account: <username>spectra  (e.g. elionspectra, eraspectra, …)
 */
const STORED_USERS: StoredUser[] = [
  {
    id: '1', username: 'elion', name: 'Elion Mustafa',
    role: 'senior_risk_manager', department: 'Senior Risk', initials: 'EM',
    salt: 'spectra_elion_v1',
    passwordHash: '7df1a1e91329539e4f9f7a63fa10158833419d21a1e15d54f99a177fa2d7f416982d450bd1953a67d0c0402afa0239120772087d9bd8026e56aaf8bb0d0dbf3f',
  },
  {
    id: '2', username: 'era', name: 'Era Hoxha',
    role: 'credit_risk_manager', department: 'Credit Risk', initials: 'EH',
    salt: 'spectra_era_v1',
    passwordHash: '78dfcd40cce92d0bbca1d15e47cd2dc61c9fc4a54a572a044727fdc7fa56964313dc0e6f184cfba11e4543dbcb418519f8cea472d660195f837a3326d5a78016',
  },
  {
    id: '3', username: 'vagnesa', name: 'Vagnesa Rama',
    role: 'collections_officer', department: 'Collections', initials: 'VR',
    salt: 'spectra_vagnesa_v1',
    passwordHash: '9d98635b98b3fa6250b88eab0166cb9558b38d9d34f24cc07d7e03a60e1f1ad742c28e284d61df720d41868988fbee8b7c70cf4252cb872bf9a53b80951c63eb',
  },
  {
    id: '4', username: 'alma', name: 'Alma Kelmendi',
    role: 'risk_underwriter', department: 'Branch Risk', initials: 'AK',
    salt: 'spectra_alma_v1',
    passwordHash: '982569ff581ddd92f08338344b0253f4d212a3cac7d83a1f27a5d1b0c10f9162be9193aa20283442be0017a674f65a474f81221ec05d47192961d2cace68c618',
  },
  {
    id: '5', username: 'demo', name: 'Spectra Demo',
    role: 'auditor', department: 'App Testing', initials: 'SD',
    salt: 'spectra_demo_v1',
    passwordHash: '49e696f0983545e89b7864ce1a34ec9d63c327f1f8dc781d200c1f1042dc241cf3d961d2e3c00faf4eb49df8fbc48cbc189fff5d088b784bc56e243d35e18cbf',
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
function toPublicUser(stored: StoredUser): User {
  return {
    id: stored.id,
    username: stored.username,
    name: stored.name,
    role: stored.role,
    department: stored.department,
    initials: stored.initials,
  }
}

export const USERS: User[] = STORED_USERS.map(toPublicUser)

export function findUser(username: string, password: string): User | null {
  const stored = STORED_USERS.find(u => u.username === username)
  if (!stored) return null
  if (!_verify(password, stored.salt, stored.passwordHash)) return null
  return toPublicUser(stored)
}

/** Actions that require credit_risk_manager or senior_risk_manager role */
export const RESTRICTED_ACTIONS = new Set([
  'Freeze Account', 'Freeze account',
  'Legal Review', 'Legal review', 'Legal referral',
  'Escalate', 'Escalate case', 'Escalate → Recovery',
  'Restructure',
])

/** Role display labels and colours */
export const ROLE_BADGE: Record<Role, { label: string; color: string }> = {
  risk_underwriter:    { label: 'Risk Underwriter',    color: '#94A3B8' },
  credit_risk_manager: { label: 'Credit Risk Manager', color: '#60A5FA' },
  collections_officer: { label: 'Collections Officer', color: '#F59E0B' },
  senior_risk_manager: { label: 'Senior Risk Manager', color: '#C9A84C' },
  auditor:             { label: 'Auditor',             color: '#A78BFA' },
}
