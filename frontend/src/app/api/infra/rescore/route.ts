import { NextRequest, NextResponse } from 'next/server'
import { clearAllCaches } from '@/lib/queries'
import { clearPredictionCache } from '@/lib/predictions'

const ML_URL = (process.env.ML_RESCORE_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export async function POST(req: NextRequest) {
  try {
    const { personalId } = await req.json()
    if (!personalId) {
      return NextResponse.json({ error: 'personalId is required' }, { status: 400 })
    }

    const res = await fetch(`${ML_URL}/rescore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: String(personalId) }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      return NextResponse.json(
        { error: `ML service error: ${err.detail ?? res.statusText}` },
        { status: 502 }
      )
    }

    const data = await res.json()
    clearAllCaches()
    clearPredictionCache()
    return NextResponse.json({ ok: true, prediction: data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 })
  }
}
