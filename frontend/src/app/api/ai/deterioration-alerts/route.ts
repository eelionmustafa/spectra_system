import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { getDPDTrajectoryCandidates } from '@/lib/queries'
import { fmt } from '@/lib/formatters'

export async function POST(_req: NextRequest) {
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const groqApiKey = process.env.GROQ_API_KEY?.trim()
  if (!groqApiKey) {
    return NextResponse.json({ error: 'AI not configured. Set GROQ_API_KEY.' }, { status: 503 })
  }

  const candidates = await getDPDTrajectoryCandidates()
  if (candidates.length === 0) {
    return NextResponse.json({
      alerts: [],
      portfolio_note: null,
      analysed_at: new Date().toISOString(),
      candidates_scanned: 0,
    })
  }

  const groq = new OpenAI({ apiKey: groqApiKey, baseURL: 'https://api.groq.com/openai/v1' })

  const clientLines = candidates.map((c, i) =>
    `${i + 1}. ID:${c.personal_id} | ${c.full_name} | ${c.stage} | Exposure:${fmt(c.exposure)} | DPD now:${c.dpd_now}d | 1wk:${c.dpd_1w ?? '?'}d | 2wk:${c.dpd_2w ?? '?'}d | 3wk:${c.dpd_3w ?? '?'}d | Δ:+${c.dpd_delta}d`
  ).join('\n')

  const prompt = `You are a senior credit risk analyst at a European bank. Analyse these ${candidates.length} clients — all have non-trivial DPD — and identify those at genuine risk of further deterioration or default within 60 days.

Flag a client if ANY of these apply:
- DPD is rising week-over-week (trajectory Δ > 0)
- DPD is already high (≥ 30d) even if stable — persistent delinquency is its own risk
- Client is Stage 2 or Stage 3 with any DPD

Clients (sorted by current DPD, highest first):
${clientLines}

Return ONLY valid JSON, no markdown, no explanation. Flag as many as genuinely warrant attention.

{
  "alerts": [
    {
      "client_id": "string",
      "urgency": "Critical|High|Medium",
      "headline": "One sentence — what is happening and why it matters",
      "trajectory_summary": "Concise description: e.g. DPD steady at 45d for 3 weeks — persistent delinquency",
      "recommended_action": "The single most important next step for a credit officer"
    }
  ],
  "portfolio_note": "One sentence summary of the overall risk pattern you see"
}`

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = completion.choices[0]?.message?.content ?? ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Model did not return valid JSON' }, { status: 502 })

    const parsed = JSON.parse(jsonMatch[0])

    const enriched = (parsed.alerts ?? [])
      .map((alert: { client_id: string; urgency: string; headline: string; trajectory_summary: string; recommended_action: string }) => {
        const client = candidates.find(c => c.personal_id === alert.client_id)
        return client ? { ...alert, client } : null
      })
      .filter(Boolean)

    return NextResponse.json({
      alerts: enriched,
      portfolio_note: parsed.portfolio_note ?? null,
      analysed_at: new Date().toISOString(),
      candidates_scanned: candidates.length,
    })
  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
