import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db.server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // Ensure table exists before querying
    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DemoPaymentEvents' AND schema_id = SCHEMA_ID('dbo'))
        CREATE TABLE [dbo].[DemoPaymentEvents] (
          id         INT IDENTITY PRIMARY KEY,
          personalId NVARCHAR(50) NOT NULL,
          paid_at    DATETIME NOT NULL DEFAULT GETDATE()
        )
    `, {})

    const sinceParam = req.nextUrl.searchParams.get('since')
    // Accept plain seconds number or ISO string
    const sinceSeconds = sinceParam
      ? (isNaN(Number(sinceParam)) ? Math.floor((Date.now() - new Date(sinceParam).getTime()) / 1000) : Number(sinceParam))
      : 10

    const rows = await query<{ id: number; personalId: string; paid_at: string }>(
      `SELECT TOP 5 id, personalId,
         CONVERT(VARCHAR(30), paid_at, 127) AS paid_at
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
