/**
 * In-memory rate limiter for login endpoints.
 * Tracks failed attempts per IP. After MAX_ATTEMPTS failures within WINDOW_MS,
 * the IP is locked out for LOCKOUT_MS.
 *
 * This is a single-process store — sufficient for a bank internal deployment
 * running on one server. Replace with Redis if horizontally scaled.
 */

const MAX_ATTEMPTS = 5
const WINDOW_MS    = 15 * 60 * 1000  // 15-minute sliding window
const LOCKOUT_MS   = 15 * 60 * 1000  // 15-minute lockout after max failures

interface Entry {
  attempts: number
  windowStart: number
  lockedUntil: number
}

const _store = new Map<string, Entry>()

// Prune stale entries every 10 minutes to avoid unbounded growth
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of _store) {
    if (now > entry.lockedUntil && now - entry.windowStart > WINDOW_MS) {
      _store.delete(key)
    }
  }
}, 10 * 60 * 1000)

export interface RateLimitResult {
  allowed: boolean
  remaining: number   // attempts left before lockout
  retryAfterMs: number
}

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now()
  let entry = _store.get(ip)

  if (!entry) {
    entry = { attempts: 0, windowStart: now, lockedUntil: 0 }
    _store.set(ip, entry)
  }

  // Still locked out
  if (now < entry.lockedUntil) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.lockedUntil - now }
  }

  // Window expired — reset
  if (now - entry.windowStart > WINDOW_MS) {
    entry.attempts = 0
    entry.windowStart = now
    entry.lockedUntil = 0
  }

  const remaining = MAX_ATTEMPTS - entry.attempts
  return { allowed: true, remaining, retryAfterMs: 0 }
}

export function recordFailedAttempt(ip: string): void {
  const now = Date.now()
  const entry = _store.get(ip) ?? { attempts: 0, windowStart: now, lockedUntil: 0 }
  entry.attempts++
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS
  }
  _store.set(ip, entry)
}

export function recordSuccess(ip: string): void {
  _store.delete(ip)
}
