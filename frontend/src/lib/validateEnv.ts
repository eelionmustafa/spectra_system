/**
 * Validates required environment variables at server startup.
 * Called once from the root layout — Next.js evaluates server modules on first request.
 *
 * In development: logs warnings only.
 * In production: throws immediately so the deployment fails loudly rather than
 * silently serving a broken app.
 */

const REQUIRED_PROD: Record<string, string> = {
  JWT_SECRET:              'Secret key for signing session tokens (min 32 chars)',
  CLIENT_PORTAL_PASSWORD:  'Shared password for the client self-service portal',
  DB_SERVER:               'SQL Server hostname or IP',
  DB_NAME:                 'Database name (e.g. SPECTRA)',
  GROQ_API_KEY:            'Groq API key for AI risk summaries',
}

const REQUIRED_DEV: Record<string, string> = {
  DB_SERVER: 'SQL Server hostname or IP',
  DB_NAME:   'Database name (e.g. SPECTRA)',
}

let _validated = false

export function validateEnv(): void {
  if (_validated) return
  _validated = true

  // Skip during Next.js build phase — env vars are only available at runtime
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  const isProd = process.env.NODE_ENV === 'production'
  const required = isProd ? REQUIRED_PROD : REQUIRED_DEV
  const missing: string[] = []

  for (const [key, desc] of Object.entries(required)) {
    if (!process.env[key]) missing.push(`  ${key} — ${desc}`)
  }

  if (missing.length === 0) return

  const msg = `SPECTRA: Missing required environment variables:\n${missing.join('\n')}`
  if (isProd) throw new Error(msg)
  console.warn('\n⚠  ' + msg + '\n')
}
