import sql from 'mssql'

const useWindowsAuth = !process.env.DB_USER

const baseOptions: sql.config['options'] = {
  trustServerCertificate: true,
  enableArithAbort: true,
  encrypt: true,          // required by Azure SQL
  port: 1433,
  connectTimeout:  30000, // TCP handshake timeout — Azure SQL cold starts need > 15s default
  cancelTimeout:   5000,
}

const windowsAuthOptions = baseOptions
const sqlAuthOptions      = baseOptions

const config: sql.config = useWindowsAuth
  ? {
      server:   process.env.DB_SERVER!,
      database: process.env.DB_NAME!,
      domain:   process.env.DB_DOMAIN,
      authentication: {
        type: 'ntlm',
        options: {
          domain:   process.env.DB_DOMAIN ?? '',
          userName: process.env.DB_NTLM_USER ?? '',
          password: process.env.DB_NTLM_PASSWORD ?? '',
        },
      },
      options:  windowsAuthOptions,
      pool: { max: 30, min: 2, idleTimeoutMillis: 60000, acquireTimeoutMillis: 15000 },
      requestTimeout: 60000,
    }
  : {
      server:   process.env.DB_SERVER!,
      database: process.env.DB_NAME!,
      user:     process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      options:  sqlAuthOptions,
      pool: { max: 30, min: 2, idleTimeoutMillis: 60000, acquireTimeoutMillis: 15000 },
      requestTimeout: 60000,
    }

// ── Singleton pool with in-flight serialisation ───────────────────────────────
// Without the in-flight guard, a cold start with N concurrent requests would
// spawn N competing connect() calls. Only the last one wins and the rest leak
// ODBC handles, saturating the driver pool and causing intermittent 10-14s hangs.

const g = globalThis as typeof globalThis & {
  __spectraPool?: sql.ConnectionPool | null
  __spectraPoolFlight?: Promise<sql.ConnectionPool> | null
}

function resetPool() {
  g.__spectraPool = null
  g.__spectraPoolFlight = null
}

async function createPool(): Promise<sql.ConnectionPool> {
  const MAX_ATTEMPTS = 3
  let lastErr: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const p = await sql.connect(config)
      // Reset our reference if the pool emits an error so the next call reconnects cleanly
      p.on('error', () => { if (g.__spectraPool === p) resetPool() })
      if (attempt > 1) {
        console.warn(`[SPECTRA DB] Connected on attempt ${attempt}`)
      }
      return p
    } catch (err) {
      lastErr = err
      const isTimeout = (err as Error).message?.includes('Failed to connect') ||
                        (err as Error).message?.includes('timeout')
      if (!isTimeout || attempt === MAX_ATTEMPTS) throw err
      const delay = attempt * 2000 // 2s, 4s
      console.warn(`[SPECTRA DB] Connection attempt ${attempt} failed — retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastErr
}

export async function getPool(): Promise<sql.ConnectionPool> {
  const current = g.__spectraPool
  if (current && current.connected) return current

  // Serialise: if a connect() is already in progress, piggyback on it
  if (g.__spectraPoolFlight) return g.__spectraPoolFlight

  g.__spectraPoolFlight = createPool()
    .then(p => { g.__spectraPool = p; g.__spectraPoolFlight = null; return p })
    .catch(err => { resetPool(); throw err })

  return g.__spectraPoolFlight
}

export async function query<T>(sqlText: string, params?: Record<string, unknown>, timeoutMs = 30000): Promise<T[]> {
  try {
    const p   = await getPool()
    const req = p.request()
    ;(req as unknown as { timeout: number }).timeout = timeoutMs
    if (params) {
      for (const [key, val] of Object.entries(params)) {
        req.input(key, val)
      }
    }
    const result = await req.query<T>(sqlText)
    return result.recordset
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      const sqlSnippet = sqlText.trim().split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3).join(' | ')
      console.error('[SPECTRA QUERY ERROR]', (err as Error).message, '\nSQL:', sqlSnippet)
    } else {
      console.error('[SPECTRA QUERY ERROR]', (err as Error).message)
    }
    throw err
  }
}
