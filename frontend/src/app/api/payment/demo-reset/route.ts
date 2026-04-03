import { NextResponse } from 'next/server'
import { query } from '@/lib/db.server'

export async function POST() {
  try {
    await query(`
      IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DemoClientAssignments' AND schema_id = SCHEMA_ID('dbo'))
        DELETE FROM [dbo].[DemoClientAssignments]
    `, {})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
