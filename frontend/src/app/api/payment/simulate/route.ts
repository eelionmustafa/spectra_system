import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { query } from '@/lib/db.server'
import { clearAllCaches } from '@/lib/queries'
import { seedPredictions } from '@/app/warnings/actions'
import fs from 'fs'
import path from 'path'

const LOG_PATH = path.join(process.cwd(), '..', 'data', 'action_log.jsonl')

function appendLog(entry: Record<string, unknown>) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n')
  } catch { /* non-fatal */ }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    const body = await req.json()
    const { creditAccount, personalId, newDueDays, note } = body

    if (!creditAccount || !personalId) {
      return NextResponse.json({ error: 'creditAccount and personalId are required' }, { status: 400 })
    }
    if (typeof newDueDays !== 'number' || newDueDays < 0 || newDueDays > 999) {
      return NextResponse.json({ error: 'newDueDays must be a number between 0 and 999' }, { status: 400 })
    }

    // Fetch current DueDays for this account (latest dateID)
    const prevRows = await query<{ DueDays: number | null }>(
      `SELECT TOP 1 DueDays
       FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
       WHERE CreditAccount = @creditAccount
         AND PersonalID = @personalId
       ORDER BY dateID DESC`,
      { personalId, creditAccount }
    )
    const previousDueDays = prevRows[0]?.DueDays ?? null

    // Insert new row with today's date as dateID
    const todayStr = new Date().toISOString().slice(0, 10)
    await query(
      `INSERT INTO [dbo].[DueDaysDaily] (CreditAccount, PersonalID, dateID, DueDays)
       VALUES (@creditAccount, @personalId, @todayStr, @newDueDays)`,
      { personalId, creditAccount, todayStr, newDueDays }
    )

    // Flush in-process cache
    clearAllCaches()

    // Re-score EWI predictions (heuristic seeder)
    await seedPredictions()

    appendLog({
      id: crypto.randomUUID(),
      action: 'Payment Simulation',
      creditAccount,
      personalId,
      newDueDays,
      previousDueDays,
      note: note ?? null,
      user: session.username,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true, creditAccount, newDueDays, previousDueDays })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
