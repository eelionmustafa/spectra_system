import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db.server'

export const dynamic = 'force-dynamic'

// Ensure the demo table exists once per process lifetime — DDL must never run inside the hot path
let tableReady = false
async function ensureTable() {
  if (tableReady) return
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DemoPaymentEvents' AND schema_id = SCHEMA_ID('dbo'))
      CREATE TABLE [dbo].[DemoPaymentEvents] (
        id                  INT IDENTITY PRIMARY KEY,
        personalId          NVARCHAR(50)  NOT NULL,
        paid_at             DATETIME      NOT NULL DEFAULT GETDATE(),
        previous_due_days   INT           NULL,
        previous_risk_label NVARCHAR(32)  NULL,
        new_risk_label      NVARCHAR(32)  NULL
      )
  `, {})
  tableReady = true
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable()

    const sinceParam = req.nextUrl.searchParams.get('since')
    const sinceSeconds = sinceParam
      ? (isNaN(Number(sinceParam)) ? Math.floor((Date.now() - new Date(sinceParam).getTime()) / 1000) : Number(sinceParam))
      : 10

    const rows = await query<{
      id: number
      personalId: string
      paid_at: string
      previous_due_days: number | null
      previous_risk_label: string | null
      new_risk_label: string | null
    }>(
      `SELECT TOP 5
         id, personalId,
         CONVERT(VARCHAR(30), paid_at, 127) AS paid_at,
         previous_due_days,
         previous_risk_label,
         new_risk_label
       FROM [dbo].[DemoPaymentEvents] WITH (NOLOCK)
       WHERE paid_at >= DATEADD(SECOND, -@sinceSeconds, GETDATE())
       ORDER BY paid_at DESC`,
      { sinceSeconds }
    )
    return NextResponse.json({ events: rows })
  } catch {
    return NextResponse.json({ events: [] })
  }
}
