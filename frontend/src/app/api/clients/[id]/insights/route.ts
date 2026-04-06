import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'

export async function POST(req: NextRequest) {
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

  const groqApiKey = process.env.GROQ_API_KEY?.trim()
  if (!groqApiKey) {
    return NextResponse.json(
      { error: 'AI insights are not configured. Set GROQ_API_KEY and retry.' },
      { status: 503 }
    )
  }

  const groq = new OpenAI({
    apiKey: groqApiKey,
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

  const prompt = `You are a senior credit risk officer at a European bank. Analyse this client's risk profile and return ONLY valid JSON - no markdown, no explanation, no code fences.

Client: ${profile.full_name || profile.personal_id}
ID: ${profile.personal_id} | Age: ${profile.age} | Region: ${profile.region}
Employment: ${profile.employment_type} | Tenure: ${profile.tenure_years}y
Stage: ${profile.stage} | Risk Score: ${profile.risk_score}/10 | SICR Flagged: ${profile.sicr_flagged}
Exposure: EUR${Number(profile.total_exposure).toLocaleString()} (on-balance: EUR${Number(profile.on_balance).toLocaleString()})
Current DPD: ${profile.current_due_days}d | Max DPD 12M: ${profile.max_due_days_12m}d
Missed Payments: ${profile.missed_payments} of ${profile.total_payments} | Repayment Rate: ${profile.repayment_rate_pct}%
DTI Ratio: ${profile.dti_ratio != null ? profile.dti_ratio + '%' : 'N/A'} | Exposure Growth: ${profile.exposure_growth_pct ?? 'N/A'}%
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

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = completion.choices[0]?.message?.content
    const accumulated = Array.isArray(content)
      ? content.map(part => ('text' in part ? part.text : '')).join('')
      : content ?? ''
    const jsonMatch = accumulated.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      return NextResponse.json({ error: 'Model did not return valid JSON' }, { status: 502 })
    }

    const insights = JSON.parse(jsonMatch[0])
    return NextResponse.json({
      insights: {
        ...insights,
        generated_at: new Date().toISOString(),
      },
    })
  } catch (err) {
    const raw = (err as Error).message ?? String(err)
    const msg = raw.includes('429') || raw.toLowerCase().includes('quota')
      ? 'AI Insights quota exceeded. Check your Groq plan at console.groq.com, then retry.'
      : raw

    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
