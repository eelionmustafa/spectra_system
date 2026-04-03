import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db.server'
import { clearAllCaches, recordRichClientAction } from '@/lib/queries'

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

    // Resolve credit account
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

    // Get current DueDays + latest dateID
    const prevRows = await query<{ DueDays: number | null; dateID: string }>(
      `SELECT TOP 1 DueDays, dateID FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
       WHERE CreditAccount = @creditAccount AND PersonalID = @personalId
       ORDER BY dateID DESC`,
      { personalId, creditAccount: resolvedAccount }
    )
    const previousDueDays = prevRows[0]?.DueDays ?? null
    const latestDateID    = prevRows[0]?.dateID ?? null

    // 1. Update DueDaysDaily — reset DPD to 0
    if (latestDateID) {
      await query(
        `UPDATE [dbo].[DueDaysDaily]
         SET DueDays = @newDueDays
         WHERE CreditAccount = @creditAccount AND PersonalID = @personalId AND dateID = @dateID`,
        { personalId, creditAccount: resolvedAccount, newDueDays, dateID: latestDateID }
      )
    } else {
      const todayStr = new Date().toISOString().slice(0, 10)
      await query(
        `INSERT INTO [dbo].[DueDaysDaily] (CreditAccount, PersonalID, dateID, DueDays)
         VALUES (@creditAccount, @personalId, @todayStr, @newDueDays)`,
        { personalId, creditAccount: resolvedAccount, todayStr, newDueDays }
      )
    }

    // 2. Update AmortizationPlan — mark overdue installments as fully paid (OTPLATA = ANUITET)
    await query(
      `UPDATE [dbo].[AmortizationPlan]
       SET OTPLATA = ANUITET
       WHERE PARTIJA = @creditAccount
         AND DATUMDOSPECA <= GETDATE()
         AND COALESCE(TRY_CAST(OTPLATA AS FLOAT), 0) < COALESCE(TRY_CAST(ANUITET AS FLOAT), 0)`,
      { creditAccount: resolvedAccount }
    ).catch(() => { /* non-fatal if table schema differs */ })

    // 3. Record in ClientActions — shows on client profile and portal
    const amount = previousDueDays && previousDueDays > 0
      ? `Client cleared overdue balance (was ${previousDueDays} DPD). All outstanding installments marked as paid.`
      : `Payment received. Account brought up to date.`

    await recordRichClientAction(
      personalId,
      'Payment Received',
      'client_portal',
      amount,
      {
        creditAccount:  resolvedAccount,
        previousDueDays,
        newDueDays,
        source:         'client_portal',
        paidAt:         new Date().toISOString(),
      }
    )

    // 4. Log to DemoPaymentEvents for live toast on /warnings
    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DemoPaymentEvents' AND schema_id = SCHEMA_ID('dbo'))
        CREATE TABLE [dbo].[DemoPaymentEvents] (
          id         INT IDENTITY PRIMARY KEY,
          personalId NVARCHAR(50) NOT NULL,
          paid_at    DATETIME NOT NULL DEFAULT GETDATE()
        );
      INSERT INTO [dbo].[DemoPaymentEvents] (personalId, paid_at) VALUES (@personalId, GETDATE())
    `, { personalId })

    clearAllCaches()

    return NextResponse.json({ ok: true, personalId, creditAccount: resolvedAccount, newDueDays, previousDueDays })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
