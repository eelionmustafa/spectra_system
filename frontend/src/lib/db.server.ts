import sql from 'mssql'

const useWindowsAuth = !process.env.DB_USER

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authOptions: any = useWindowsAuth
  ? { trustServerCertificate: process.env.NODE_ENV !== 'production', enableArithAbort: true }
  : { trustServerCertificate: process.env.NODE_ENV !== 'production', enableArithAbort: true }

const config: sql.config = useWindowsAuth
  ? {
      server:   process.env.DB_SERVER!,
      database: process.env.DB_NAME!,
      // domain: leave unset — tedious uses the current process identity
      options:  authOptions,
      pool: { max: 30, min: 2, idleTimeoutMillis: 60000, acquireTimeoutMillis: 15000 },
      requestTimeout: 60000,
    }
  : {
      server:   process.env.DB_SERVER!,
      database: process.env.DB_NAME!,
      user:     process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      options:  { trustServerCertificate: process.env.NODE_ENV !== 'production', enableArithAbort: true },
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
  const p = await sql.connect(config)
  // Reset our reference if the pool emits an error so the next call reconnects cleanly
  p.on('error', () => { if (g.__spectraPool === p) resetPool() })
  return p
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
    const sqlSnippet = sqlText.trim().split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3).join(' | ')
    console.error('[SPECTRA QUERY ERROR]', (err as Error).message, '\nSQL:', sqlSnippet)
    throw err
  }
}
