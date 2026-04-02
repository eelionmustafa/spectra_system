import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { sendSystemMessage } from '@/lib/messagingService'
import { emitSpectraEvent } from '@/lib/eventBus'

type NotifyType = 'payment_reminder' | 'overdue_notice' | 'legal_notice' | 'custom'

interface NotifyBody {
  type: NotifyType
  amount?: number
  daysOverdue?: number
  dueDate?: string
  customBody?: string
}

function fmtEur(n: number): string {
  return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

function buildBody(params: NotifyBody): string {
  const { type, amount, daysOverdue, dueDate, customBody } = params
  switch (type) {
    case 'payment_reminder':
      return (
        `\uD83D\uDCC5 Payment Reminder\n\n` +
        `Your next instalment${amount ? ` of \u20ac${fmtEur(amount)}` : ''} is due` +
        `${dueDate ? ` on ${fmtDate(dueDate)}` : ' soon'}.\n\n` +
        `Please ensure sufficient funds are available in your account to avoid late payment fees.`
      )
    case 'overdue_notice':
      return (
        `\u26A0\uFE0F Overdue Payment Notice\n\n` +
        `Your account has ${daysOverdue ? `${daysOverdue} days` : 'an amount'} overdue` +
        `${amount ? ` of \u20ac${fmtEur(amount)}` : ''}.\n\n` +
        `Immediate payment is required to avoid further action. Please contact your branch or make payment as soon as possible.`
      )
    case 'legal_notice':
      return (
        `\u2696\uFE0F Pre-Legal Warning\n\n` +
        `Despite previous communications, your account remains overdue. ` +
        `If payment is not received within 7 days, your case will be referred to our legal department.\n\n` +
        `To avoid legal proceedings, please contact your branch immediately.`
      )
    case 'custom':
      return customBody ?? ''
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)
    const username = (session as { username?: string; role: string }).username ?? session.role

    const body = await req.json() as NotifyBody

    if (!body.type) {
      return NextResponse.json({ error: 'Missing type' }, { status: 400 })
    }
    if (body.type === 'custom' && (!body.customBody || body.customBody.trim().length < 10)) {
      return NextResponse.json({ error: 'customBody must be at least 10 characters' }, { status: 400 })
    }

    const messageBody = buildBody(body)

    await sendSystemMessage(id, username, username, messageBody)

    emitSpectraEvent({
      type:     'notification',
      clientId: id,
      actor:    username,
      message:  `Notification sent to client ${id}: ${body.type}`,
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
