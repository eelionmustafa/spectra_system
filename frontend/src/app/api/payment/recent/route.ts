import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db.server'

export const dynamic = 'force-dynamic'

// Returns payments from DemoPaymentEvents newer than ?since= (ISO string)
export async function GET(req: NextRequest) {
  try {
    const since = req.nextUrl.searchParams.get('since') ?? new Date(Date.now() - 10000).toISOString()
    const rows = await query<{ id: number; personalId: string; paid_at: string }>(
      `SELECT TOP 5 id, personalId,
         CONVERT(VARCHAR(30), paid_at, 127) AS paid_at
       FROM [dbo].[DemoPaymentEvents] WITH (NOLOCK)
       WHERE paid_at > @since
       ORDER BY paid_at DESC`,
      { since }
    )
    return NextResponse.json({ events: rows })
  } catch {
    return NextResponse.json({ events: [] })
  }
}
