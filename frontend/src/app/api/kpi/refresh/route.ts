import { NextResponse } from 'next/server'
import { query } from '@/lib/db.server'

export const dynamic = 'force-dynamic'

/** POST /api/kpi/refresh
 *  Manually triggers usp_RefreshKPISummary.
 *  Useful after a manual ML pipeline run or data import without waiting for the nightly job.
 */
export async function POST() {
  try {
    await query('EXEC [dbo].[usp_RefreshKPISummary]', {}, 120_000)
    return NextResponse.json({ ok: true, refreshed_at: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** GET /api/kpi/refresh
 *  Returns the timestamp and calc_date of the last pre-computed snapshot.
 */
export async function GET() {
  const rows = await query<{ computed_at: string; calc_date: string }>(`
    SELECT TOP 1 CAST(computed_at AS VARCHAR(30)) AS computed_at, calc_date
    FROM [dbo].[kpi_summary] WITH (NOLOCK)
    ORDER BY computed_at DESC
  `).catch(() => [] as { computed_at: string; calc_date: string }[])

  if (rows.length === 0)
    return NextResponse.json({ last_refresh: null, message: 'kpi_summary is empty — run the SQL setup script first.' })

  return NextResponse.json({ last_refresh: rows[0].computed_at, calc_date: rows[0].calc_date })
}
