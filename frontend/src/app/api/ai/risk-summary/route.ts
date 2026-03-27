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

    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })

    const profile = await req.json()

    const msg = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `You are a senior credit risk analyst at a bank. Write a concise 3-4 sentence risk assessment for this client. Be specific about the key risk drivers and state a recommended action.

Client: ${profile.full_name || profile.personal_id} | Age: ${profile.age} | ${profile.region} | ${profile.employment_type}
Stage: ${profile.stage} | Risk Score: ${profile.risk_score}/10 | Exposure: €${Number(profile.total_exposure).toLocaleString()}
Current DPD: ${profile.current_due_days} days | Max DPD (12M): ${profile.max_due_days_12m} days
Payments missed: ${profile.missed_payments} of ${profile.total_payments} | Repayment rate: ${profile.repayment_rate_pct}% | Tenure: ${profile.tenure_years} years`,
      }],
    })

    const text = msg.choices[0]?.message?.content ?? ''
    return NextResponse.json({ summary: text })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
