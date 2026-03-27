import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { recordClientAction } from '@/lib/queries'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'

const LOG_FILE = path.join(process.cwd(), '..', 'data', 'action_log.jsonl')

/** Actions that are written to the SQL database (not just the local log file) */
const DB_RECORD_ACTIONS = new Set([
  'Freeze Account', 'Freeze account',
  'Legal Review', 'Legal review', 'Legal referral',
  'Escalate', 'Escalate case', 'Escalate → Recovery',
  'Restructure',
  'Add to Watchlist', 'Add to watchlist',
  'Monthly Monitor',
  'Flag for Review',
  'Increase monitoring', 'Increase Monitoring',
])

async function getSessionUser(req: NextRequest): Promise<string> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return 'unknown'
  try {
    const session = await verifyToken(token)
    return session.username
  } catch {
    return 'unknown'
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    try { await verifyToken(token) } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { action, clientId, timestamp } = await req.json()
    if (!action) return NextResponse.json({ ok: false, error: 'action required' }, { status: 400 })

    const user = await getSessionUser(req)

    const entry = {
      id: crypto.randomUUID(),
      action,
      clientId: clientId ?? null,
      timestamp: timestamp ?? new Date().toISOString(),
      user,
    }

    // Always append to local log file
    const dir = path.dirname(LOG_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8')

    // Also write to SQL database for significant actions
    if (clientId && DB_RECORD_ACTIONS.has(action)) {
      await recordClientAction(clientId, action, user)
    }

    return NextResponse.json({ ok: true, id: entry.id })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { await verifyToken(token) } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  try {
    if (!fs.existsSync(LOG_FILE)) return NextResponse.json({ actions: [] })
    const lines = fs.readFileSync(LOG_FILE, 'utf-8').trim().split('\n').filter(Boolean)
    const actions = lines.map(l => JSON.parse(l)).reverse()   // newest first
    return NextResponse.json({ actions })
  } catch {
    return NextResponse.json({ actions: [] })
  }
}
