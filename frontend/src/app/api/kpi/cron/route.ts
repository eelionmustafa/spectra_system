import { NextResponse } from 'next/server'
import { query } from '@/lib/db.server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Called nightly by Vercel Cron (vercel.json: "0 2 * * *").
// Vercel Cron sets the Authorization header automatically when invoking cron routes.
// For external callers, pass ?secret=<CRON_SECRET>.
export async function GET(req: Request) {
  const isVercelCron = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  const isManual = new URL(req.url).searchParams.get('secret') === process.env.CRON_SECRET

  if (!isVercelCron && !isManual) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await query('EXEC [dbo].[usp_RefreshKPISummary]', {}, 120_000)
    return NextResponse.json({ ok: true, refreshed_at: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
