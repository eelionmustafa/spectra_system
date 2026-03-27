import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { recordRichClientAction, resolveClientFreezeAction } from '@/lib/queries'
import fs from 'fs'
import path from 'path'

const LOG_PATH = path.join(process.cwd(), '..', 'data', 'action_log.jsonl')

function appendLog(entry: Record<string, unknown>) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n')
  } catch { /* non-fatal */ }
}

function legalCaseRef(clientId: string): string {
  const year = new Date().getFullYear()
  const seq  = parseInt(crypto.randomUUID().replace(/-/g, '').slice(0, 4), 16) % 9000 + 1000
  return `LEGAL-${year}-${String(clientId).slice(-6).toUpperCase()}-${seq}`
}

export async function POST(req: NextRequest) {
  try {
    // Auth
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = await verifyToken(token)

    const body = await req.json()
    const { clientId, type } = body
    if (!clientId || !type) return NextResponse.json({ error: 'clientId and type required' }, { status: 400 })

    let action   = ''
    let notes    = ''
    let metadata: Record<string, unknown> = {}

    switch (type) {

      case 'call_log': {
        const { result, callNotes, followUpDate } = body
        action = 'Call Attempt'
        notes  = `Result: ${result}${callNotes ? ` — ${callNotes}` : ''}${followUpDate ? ` · Follow-up: ${followUpDate}` : ''}`
        metadata = { result, callNotes, followUpDate, officer: session.name }
        break
      }

      case 'payment_sweep': {
        const { amount, dueAmount, balanceAtSweep } = body
        action = 'Payment Sweep'
        notes  = `€${Number(amount).toLocaleString('en', { minimumFractionDigits: 2 })} swept from account balance. Due: €${Number(dueAmount).toLocaleString('en', { minimumFractionDigits: 2 })}. Balance available at time of sweep: €${Number(balanceAtSweep).toLocaleString('en', { minimumFractionDigits: 2 })}.`
        metadata = { amount, dueAmount, balanceAtSweep, currency: 'EUR', officer: session.name }
        break
      }

      case 'restructure_offer': {
        const { newMonthlyAmount, extensionMonths, holidayMonths, restructureNotes } = body
        action = 'Restructure Offer'
        notes  = `New monthly instalment: €${Number(newMonthlyAmount).toLocaleString()}. Term extension: ${extensionMonths} months. Payment holiday: ${holidayMonths} months.${restructureNotes ? ` Notes: ${restructureNotes}` : ''}`
        metadata = { newMonthlyAmount, extensionMonths, holidayMonths, restructureNotes, offerStatus: 'pending', officer: session.name, offeredAt: new Date().toISOString() }
        break
      }

      case 'legal_demand': {
        const { demandNotes } = body
        const caseRef    = legalCaseRef(clientId)
        const deadline   = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        action = 'Legal Demand Notice'
        notes  = `Case reference: ${caseRef}. Client must respond by ${deadline}.${demandNotes ? ` ${demandNotes}` : ''}`
        metadata = { caseRef, deadline, demandNotes, officer: session.name, issuedAt: new Date().toISOString() }
        break
      }

      case 'collection_assign': {
        const { team, assignedTo, collectionNotes } = body
        action = 'Collection Assignment'
        notes  = `Assigned to: ${assignedTo} (${team} team).${collectionNotes ? ` ${collectionNotes}` : ''}`
        metadata = { team, assignedTo, collectionNotes, officer: session.name }
        break
      }

      case 'unfreeze': {
        if (session.role !== 'admin' && session.role !== 'risk_officer') {
          return NextResponse.json({ error: 'Risk officer or admin required' }, { status: 403 })
        }
        const { unfreezeReason } = body
        await resolveClientFreezeAction(clientId)
        action = 'Account Unfrozen'
        notes  = `Account restriction lifted.${unfreezeReason ? ` Reason: ${unfreezeReason}` : ''} Authorised by: ${session.name}.`
        metadata = { unfreezeReason, authorisedBy: session.name, authorisedAt: new Date().toISOString() }
        break
      }

      case 'write_off': {
        if (session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
        const { writeOffReason } = body
        action = 'Debt Write-off'
        notes  = `Debt written off. Reason: ${writeOffReason}. Authorised by: ${session.name}.`
        metadata = { writeOffReason, authorisedBy: session.name, authorisedAt: new Date().toISOString() }
        break
      }

      default:
        return NextResponse.json({ error: `Unknown action type: ${type}` }, { status: 400 })
    }

    await recordRichClientAction(clientId, action, session.username, notes, metadata)

    appendLog({ id: crypto.randomUUID(), action, clientId, type, notes, metadata, user: session.username, timestamp: new Date().toISOString() })

    return NextResponse.json({ ok: true, action, notes, metadata })

  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
