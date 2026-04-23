import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db.server'

export async function GET() {
  const start = Date.now()
  try {
    const pool = await getPool()
    await pool.request().query('SELECT 1 AS ok')
    return NextResponse.json({
      connected: true,
      latency_ms: Date.now() - start,
    })
  } catch {
    return NextResponse.json({
      connected: false,
    }, { status: 503 })
  }
}
