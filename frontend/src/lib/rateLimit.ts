/**
 * Rate limiter for login endpoints.
 * When REDIS_URL is set, state is shared across all server instances via Redis.
 * Without REDIS_URL, falls back to an in-process Map (single-server only).
 *
 * Redis key schema:
 *   spectra:rl:<ip>:attempts  — INCR counter, TTL = WINDOW_MS
 *   spectra:rl:<ip>:locked    — SET "1", TTL = LOCKOUT_MS
 */

const MAX_ATTEMPTS = 5
const WINDOW_SEC   = 15 * 60   // 15-minute sliding window
const LOCKOUT_SEC  = 15 * 60   // 15-minute lockout after max failures
const WINDOW_MS    = WINDOW_SEC  * 1000
const LOCKOUT_MS   = LOCKOUT_SEC * 1000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

// ── Redis backend ─────────────────────────────────────────────────────────────

type RedisClient = {
  get(key: string): Promise<string | null>
  set(key: string, value: string, exMode: 'EX', ttl: number): Promise<unknown>
  incr(key: string): Promise<number>
  expire(key: string, ttl: number): Promise<unknown>
  del(key: string): Promise<unknown>
  ttl(key: string): Promise<number>
}

let _redis: RedisClient | null = null
let _redisChecked = false

async function getRedis(): Promise<RedisClient | null> {
  if (_redisChecked) return _redis
  _redisChecked = true
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    const { default: Redis } = await import('ioredis')
    _redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false }) as unknown as RedisClient
    return _redis
  } catch {
    return null
  }
}

async function redisCheck(ip: string): Promise<RateLimitResult | null> {
  const r = await getRedis()
  if (!r) return null
  try {
    const lockedTtl = await r.ttl(`spectra:rl:${ip}:locked`)
    if (lockedTtl > 0) {
      return { allowed: false, remaining: 0, retryAfterMs: lockedTtl * 1000 }
    }
    const attempts = parseInt((await r.get(`spectra:rl:${ip}:attempts`)) ?? '0', 10)
    return { allowed: true, remaining: MAX_ATTEMPTS - attempts, retryAfterMs: 0 }
  } catch {
    return null  // Redis error → fall through to in-memory
  }
}

async function redisRecordFailure(ip: string): Promise<boolean> {
  const r = await getRedis()
  if (!r) return false
  try {
    const count = await r.incr(`spectra:rl:${ip}:attempts`)
    await r.expire(`spectra:rl:${ip}:attempts`, WINDOW_SEC)
    if (count >= MAX_ATTEMPTS) {
      await r.set(`spectra:rl:${ip}:locked`, '1', 'EX', LOCKOUT_SEC)
    }
    return true
  } catch {
    return false
  }
}

async function redisRecordSuccess(ip: string): Promise<boolean> {
  const r = await getRedis()
  if (!r) return false
  try {
    await r.del(`spectra:rl:${ip}:attempts`)
    await r.del(`spectra:rl:${ip}:locked`)
    return true
  } catch {
    return false
  }
}

// ── In-memory fallback ────────────────────────────────────────────────────────

interface Entry {
  attempts: number
  windowStart: number
  lockedUntil: number
}

const _store = new Map<string, Entry>()

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of _store) {
    if (now > entry.lockedUntil && now - entry.windowStart > WINDOW_MS) {
      _store.delete(key)
    }
  }
}, 10 * 60 * 1000)

function memCheck(ip: string): RateLimitResult {
  const now = Date.now()
  let entry = _store.get(ip)
  if (!entry) {
    entry = { attempts: 0, windowStart: now, lockedUntil: 0 }
    _store.set(ip, entry)
  }
  if (now < entry.lockedUntil) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.lockedUntil - now }
  }
  if (now - entry.windowStart > WINDOW_MS) {
    entry.attempts = 0
    entry.windowStart = now
    entry.lockedUntil = 0
  }
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.attempts, retryAfterMs: 0 }
}

function memRecordFailure(ip: string): void {
  const now = Date.now()
  const entry = _store.get(ip) ?? { attempts: 0, windowStart: now, lockedUntil: 0 }
  entry.attempts++
  if (entry.attempts >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCKOUT_MS
  _store.set(ip, entry)
}

function memRecordSuccess(ip: string): void {
  _store.delete(ip)
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  return (await redisCheck(ip)) ?? memCheck(ip)
}

export async function recordFailedAttempt(ip: string): Promise<void> {
  if (!(await redisRecordFailure(ip))) memRecordFailure(ip)
}

export async function recordSuccess(ip: string): Promise<void> {
  if (!(await redisRecordSuccess(ip))) memRecordSuccess(ip)
}
