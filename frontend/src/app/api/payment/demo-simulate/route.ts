import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db.server'
import { clearAllCaches } from '@/lib/queries'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { creditAccount, personalId, newDueDays } = body

    if (!personalId) {
      return NextResponse.json({ error: 'personalId is required' }, { status: 400 })
    }
    if (typeof newDueDays !== 'number' || newDueDays < 0) {
      return NextResponse.json({ error: 'newDueDays must be a non-negative number' }, { status: 400 })
    }

    // If no creditAccount provided, look up the first active credit for this client
    let resolvedAccount = creditAccount
    if (!resolvedAccount) {
      const rows = await query<{ CreditAccount: string }>(
        `SELECT TOP 1 CreditAccount FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
         WHERE PersonalID = @personalId ORDER BY dateID DESC`,
        { personalId }
      )
      resolvedAccount = rows[0]?.CreditAccount ?? null
    }

    if (!resolvedAccount) {
      return NextResponse.json({ error: 'No credit account found for this client' }, { status: 404 })
    }

    const prevRows = await query<{ DueDays: number | null }>(
      `SELECT TOP 1 DueDays FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
       WHERE CreditAccount = @creditAccount AND PersonalID = @personalId
       ORDER BY dateID DESC`,
      { personalId, creditAccount: resolvedAccount }
    )
    const previousDueDays = prevRows[0]?.DueDays ?? null

    const todayStr = new Date().toISOString().slice(0, 10)
    await query(
      `INSERT INTO [dbo].[DueDaysDaily] (CreditAccount, PersonalID, dateID, DueDays)
       VALUES (@creditAccount, @personalId, @todayStr, @newDueDays)`,
      { personalId, creditAccount: resolvedAccount, todayStr, newDueDays }
    )

    clearAllCaches()

    return NextResponse.json({ ok: true, personalId, creditAccount: resolvedAccount, newDueDays, previousDueDays })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
