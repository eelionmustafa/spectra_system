import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'

// ── SSE helpers ─────────────────────────────────────────────────────────────
const enc = new TextEncoder()
function sseChunk(data: unknown): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(data)}\n\n`)
}
function sseError(msg: string): Uint8Array {
  return enc.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // ── Auth ──────────────────────────────────────────────────────────────────
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { profile: Record<string, unknown>; prediction: Record<string, unknown> | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  })

  const { profile, prediction } = body

  const pdLine = prediction
    ? `ML PD (30/60/90d): ${(Number(prediction.pd_30d) * 100).toFixed(1)}% / ${(Number(prediction.pd_60d) * 100).toFixed(1)}% / ${(Number(prediction.pd_90d) * 100).toFixed(1)}%
ML Risk Label: ${prediction.risk_label}
Stage Migration Prob: ${(Number(prediction.stage_migration_prob) * 100).toFixed(1)}%
DPD Escalation Prob: ${(Number(prediction.dpd_escalation_prob) * 100).toFixed(1)}%
ML Recommended Action: ${prediction.recommended_action}`
    : 'No ML predictions available.'

  const prompt = `You are a senior credit risk officer at a European bank. Analyse this client's risk profile and return ONLY valid JSON — no markdown, no explanation, no code fences.

Client: ${profile.full_name || profile.personal_id}
ID: ${profile.personal_id} | Age: ${profile.age} | Region: ${profile.region}
Employment: ${profile.employment_type} | Tenure: ${profile.tenure_years}y
Stage: ${profile.stage} | Risk Score: ${profile.risk_score}/10 | SICR Flagged: ${profile.sicr_flagged}
Exposure: €${Number(profile.total_exposure).toLocaleString()} (on-balance: €${Number(profile.on_balance).toLocaleString()})
Current DPD: ${profile.current_due_days}d | Max DPD 12M: ${profile.max_due_days_12m}d
Missed Payments: ${profile.missed_payments} of ${profile.total_payments} | Repayment Rate: ${profile.repayment_rate_pct}%
DTI Ratio: ${profile.dti_ratio}% | Exposure Growth: ${profile.exposure_growth_pct ?? 'N/A'}%
${pdLine}

Return this exact JSON structure:
{
  "risk_narrative": {
    "summary": "2-3 sentence risk assessment specific to this client",
    "risk_level": "Low|Medium|High|Critical",
    "key_concern": "The primary risk driver in one clear sentence"
  },
  "deterioration_prediction": {
    "deterioration_risk": "Low|Medium|High|Critical",
    "risk_score": <integer 0-100>,
    "probability_statement": "One sentence probability assessment with a timeframe",
    "key_signals": ["signal 1", "signal 2", "signal 3"]
  },
  "recommended_actions": {
    "priority": "Low|Medium|High|Urgent",
    "primary_action": "The single most important action the banker should take now",
    "supporting_actions": ["second action", "third action"],
    "escalate_to_committee": <true|false>
  },
  "recovery_recommendation": {
    "recovery_probability": "Low|Medium|High",
    "recommended_strategy": "One of: Monitor|Outreach|Restructure|Collection|Legal",
    "strategy_detail": "One sentence explaining the strategy",
    "estimated_recovery_rate": "percentage e.g. 70%"
  },
  "transparency_letter": {
    "subject": "Subject line for a formal letter to the client",
    "salutation": "Dear ${String(profile.full_name ?? '').split(' ')[0] || 'Valued Client'},",
    "body": "Professional 2-3 paragraph letter informing the client about their account status, any concerns, and what steps they should take. Use a formal but empathetic tone.",
    "closing": "Yours sincerely,\\nCredit Risk Management\\nSPECTRA Bank"
  }
}`

  // ── Streaming SSE response ─────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const messageStream = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1800,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
        })

        let accumulated = ''

        for await (const chunk of messageStream) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) {
            accumulated += text
            controller.enqueue(sseChunk({ chunk: text }))
          }
        }

        // Parse and emit final result
        const jsonMatch = accumulated.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          controller.enqueue(sseError('Model did not return valid JSON'))
          controller.close()
          return
        }

        const insights = JSON.parse(jsonMatch[0])
        controller.enqueue(
          sseChunk({ done: true, insights: { ...insights, generated_at: new Date().toISOString() } })
        )
      } catch (err) {
        const raw = (err as Error).message ?? String(err)
        const msg = raw.includes('429') || raw.toLowerCase().includes('quota')
          ? 'AI Insights quota exceeded. Check your Groq plan at console.groq.com, then retry.'
          : raw
        controller.enqueue(sseError(msg))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream; charset=utf-8',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
