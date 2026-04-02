import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { recordClientAction } from '@/lib/queries'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'

const LOG_FILE = path.join(process.cwd(), '..', 'data', 'action_log.jsonl')

// These actions should also persist into SQL so they remain visible across deployments.
const DB_RECORD_ACTIONS = new Set([
  'freeze account',
  'legal review',
  'legal referral',
  'escalate',
  'escalate case',
  'escalate -> recovery',
  'restructure',
  'add to watchlist',
  'monthly monitor',
  'flag for review',
  'increase monitoring',
])

function normalizeActionLabel(action: string): string {
  return action
    .replace(/→/g, '->')
    .replace(/â†’/g, '->')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function appendLocalLog(entry: Record<string, unknown>) {
  try {
    const dir = path.dirname(LOG_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8')
  } catch {
    // Non-fatal in serverless environments with a read-only filesystem.
  }
}

async function requireSession(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null

  try {
    return await verifyToken(token)
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req)
    if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    const { action, clientId, timestamp } = await req.json()
    if (!action) {
      return NextResponse.json({ ok: false, error: 'action required' }, { status: 400 })
    }

    const entry = {
      id: crypto.randomUUID(),
      action,
      clientId: clientId ?? null,
      timestamp: timestamp ?? new Date().toISOString(),
      user: session.username,
    }

    appendLocalLog(entry)

    if (clientId && DB_RECORD_ACTIONS.has(normalizeActionLabel(action))) {
      await recordClientAction(clientId, action, session.username)
    }

    return NextResponse.json({ ok: true, id: entry.id })
  } catch (err) {
    const message = (err as Error).message ?? String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await requireSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    if (!fs.existsSync(LOG_FILE)) return NextResponse.json({ actions: [] })
    const lines = fs.readFileSync(LOG_FILE, 'utf-8').trim().split('\n').filter(Boolean)
    const actions = lines.map(line => JSON.parse(line)).reverse()
    return NextResponse.json({ actions })
  } catch {
    return NextResponse.json({ actions: [] })
  }
}
