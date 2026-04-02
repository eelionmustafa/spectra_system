'use client'

import { useState, useCallback } from 'react'
import type { CaseAction } from '@/lib/queries'
import type { Role } from '@/lib/users'

interface Props {
  clientId:       string
  userRole:       Role
  accountBalance: number
  totalExposure:  number
  currentDPD:     number
  caseHistory:    CaseAction[]
  isFrozen:       boolean
}

type Tab   = 'actions' | 'history'
type Panel = 'call' | 'sweep' | 'restructure' | 'legal' | 'collection' | 'writeoff' | 'unfreeze' | null

const CALL_RESULTS = ['Answered', 'No Answer', 'Voicemail', 'Refused to speak', 'Wrong number'] as const

function fmt(n: number) {
  return '€' + n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function actionIcon(action: string): string {
  if (action.includes('Call'))        return '📞'
  if (action.includes('Sweep'))       return '💰'
  if (action.includes('Restructure')) return '📋'
  if (action.includes('Legal'))       return '⚖️'
  if (action.includes('Collection'))  return '👥'
  if (action.includes('Write-off'))   return '🗑️'
  if (action.includes('Unfreeze') || action.includes('Unfrozen')) return '🔓'
  if (action.includes('Freeze'))      return '🔒'
  if (action.includes('Escalate'))    return '🚨'
  if (action.includes('Watchlist'))   return '👁'
  return '📌'
}

function actionColor(action: string): string {
  if (action.includes('Unfreeze') || action.includes('Unfrozen')) return '#065F46'
  if (action.includes('Legal') || action.includes('Write-off') || action.includes('Freeze')) return '#991B1B'
  if (action.includes('Sweep') || action.includes('Escalate'))  return '#92400E'
  if (action.includes('Call') || action.includes('Collection')) return '#1E3A5F'
  if (action.includes('Restructure'))                           return '#065F46'
  return '#475569'
}

export default function CaseManagement({ clientId, userRole, accountBalance, totalExposure, currentDPD, caseHistory: initial, isFrozen: initialFrozen }: Props) {
  const [tab,        setTab]        = useState<Tab>('actions')
  const [panel,      setPanel]      = useState<Panel>(null)
  const [history,    setHistory]    = useState<CaseAction[]>(initial)
  const [loading,    setLoading]    = useState(false)
  const [feedback,   setFeedback]   = useState<{ msg: string; ok: boolean } | null>(null)
  const [frozen,     setFrozen]     = useState(initialFrozen)

  const [callResult, setCallResult] = useState<typeof CALL_RESULTS[number]>(CALL_RESULTS[0])
  const [callNotes,  setCallNotes]  = useState('')
  const [followUp,   setFollowUp]   = useState('')
  const [sweepAmt,   setSweepAmt]   = useState(Math.min(accountBalance, totalExposure * 0.05).toFixed(2))
  const [newAmount,  setNewAmount]  = useState('')
  const [extMonths,  setExtMonths]  = useState('12')
  const [holiday,    setHoliday]    = useState('0')
  const [restNotes,  setRestNotes]  = useState('')
  const [legalNotes, setLegalNotes] = useState('')
  const [collTeam,   setCollTeam]   = useState('internal')
  const [collAgent,  setCollAgent]  = useState('')
  const [collNotes,  setCollNotes]  = useState('')
  const [woReason,   setWoReason]   = useState('')
  const [unfreezeReason, setUnfreezeReason] = useState('')

  const isOfficer = userRole === 'credit_risk_manager' || userRole === 'senior_risk_manager'
  const sweepEligible = accountBalance > 0 && currentDPD > 0

  const submit = useCallback(async (type: string, payload: Record<string, unknown>) => {
    setLoading(true); setFeedback(null)
    try {
      const res  = await fetch('/api/actions/case', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, type, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setFeedback({ msg: `✓ ${data.action} logged successfully`, ok: true })
      setPanel(null)
      if (type === 'unfreeze') setFrozen(false)
      setHistory(prev => [{ id: data.id ?? crypto.randomUUID(), action: data.action, status: 'active', actionedBy: 'you', notes: data.notes, metadata: data.metadata, createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ') }, ...prev])
      setCallNotes(''); setFollowUp(''); setRestNotes(''); setLegalNotes(''); setCollNotes(''); setCollAgent(''); setWoReason(''); setUnfreezeReason('')
    } catch (e) {
      setFeedback({ msg: (e as Error).message, ok: false })
    } finally {
      setLoading(false)
    }
  }, [clientId])

  const togglePanel = useCallback((p: Panel) => { setPanel(prev => prev === p ? null : p); setFeedback(null) }, [])

  const actionButtons: {
    key: Panel; icon: string; label: string
    color: string; bg: string; border: string; desc: string
    officerOnly: boolean; hidden?: boolean; danger?: boolean
  }[] = [
    { key: 'unfreeze',    icon: '🔓', label: 'Unfreeze Account',    color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0', desc: 'Lift account restriction',         officerOnly: true,  hidden: !frozen },
    { key: 'call',        icon: '📞', label: 'Log Call',            color: '#1E3A5F', bg: '#EFF6FF', border: '#BFDBFE', desc: 'Record outbound call attempt',     officerOnly: false },
    { key: 'sweep',       icon: '💰', label: 'Payment Sweep',       color: sweepEligible ? '#92400E' : '#94A3B8', bg: sweepEligible ? '#FFFBEB' : '#F8FAFC', border: sweepEligible ? '#FDE68A' : '#E2E8F0', desc: sweepEligible ? `Bal: ${fmt(accountBalance)}` : 'No balance available', officerOnly: true },
    { key: 'restructure', icon: '📋', label: 'Restructure Offer',   color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0', desc: 'Revise payment plan',             officerOnly: true },
    { key: 'legal',       icon: '⚖️', label: 'Legal Demand',        color: '#991B1B', bg: '#FEF2F2', border: '#FECACA', desc: '14-day formal notice',            officerOnly: true,  danger: true },
    { key: 'collection',  icon: '👥', label: 'Assign Collections',  color: '#4C1D95', bg: '#EDE9FE', border: '#DDD6FE', desc: 'Recovery agent or agency',        officerOnly: true },
    { key: 'writeoff',    icon: '🗑️', label: 'Write-off Flag',      color: '#374151', bg: '#F4F7FA', border: '#E2E8F0', desc: 'Admin only — uncollectable',      officerOnly: true,  danger: true },
  ]

  const visibleButtons = actionButtons.filter(b => !b.hidden)

  return (
    <div className="panel" style={{ padding: '0', overflow: 'hidden' }}>
      {/* ── Header ── */}
      <div style={{ padding: '12px 16px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="pt">Case Management</span>
            {history.length > 0 && (
              <span style={{
                fontSize: '9px', fontFamily: 'var(--mono)', fontWeight: 700,
                background: 'var(--navy)', color: 'white',
                padding: '1px 7px', borderRadius: '10px',
              }}>{history.length}</span>
            )}
          </div>
          <span style={{ fontSize: '9px', color: 'var(--muted)' }}>
            {history.length} action{history.length !== 1 ? 's' : ''} logged
          </span>
        </div>
        <div style={{ display: 'flex', gap: '2px' }}>
          {(['actions', 'history'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '5px 12px', fontSize: '10px', fontWeight: tab === t ? 700 : 400,
              color: tab === t ? 'var(--navy)' : 'var(--muted)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t ? '2px solid var(--navy)' : '2px solid transparent',
              marginBottom: '-1px', letterSpacing: '0.02em', textTransform: 'capitalize',
            }}>
              {t === 'actions' ? 'Actions' : `History (${history.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Feedback ── */}
      {feedback && (
        <div style={{
          padding: '8px 16px', fontSize: '11px', fontWeight: 500,
          background: feedback.ok ? '#ECFDF5' : '#FEF2F2',
          color: feedback.ok ? '#065F46' : '#991B1B',
          borderBottom: '1px solid var(--border)',
        }}>
          {feedback.msg}
        </div>
      )}

      {/* ══════════════════════════════════
          ACTIONS TAB — 2-column card grid
      ══════════════════════════════════ */}
      {tab === 'actions' && (
        <div style={{ padding: '12px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: panel ? '10px' : 0 }}>
            {visibleButtons.map(btn => {
              const locked = btn.officerOnly && !isOfficer
              const isOpen = panel === btn.key
              return (
                <button
                  key={btn.key}
                  onClick={() => !locked && togglePanel(btn.key)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '8px',
                    padding: '9px 10px', borderRadius: '8px', textAlign: 'left',
                    border: `1px solid ${isOpen ? btn.border : locked ? 'var(--border)' : btn.border + '80'}`,
                    background: isOpen ? btn.bg : locked ? '#F8FAFC' : 'white',
                    cursor: locked ? 'not-allowed' : 'pointer',
                    opacity: locked ? 0.5 : 1,
                    transition: 'all 0.12s',
                    outline: isOpen ? `2px solid ${btn.border}` : 'none',
                    outlineOffset: '-1px',
                  }}
                >
                  <span style={{ fontSize: '18px', lineHeight: 1, flexShrink: 0, marginTop: '1px' }}>{btn.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '11px', fontWeight: 700, lineHeight: 1.2,
                      color: locked ? 'var(--muted)' : btn.color,
                      marginBottom: '2px',
                    }}>
                      {btn.label}{locked ? ' 🔒' : ''}
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--muted)', lineHeight: 1.3 }}>{btn.desc}</div>
                  </div>
                  <span style={{ fontSize: '9px', color: isOpen ? btn.color : 'var(--muted)', flexShrink: 0, marginTop: '2px' }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── Inline form (full-width, below grid) ── */}
          {panel && (() => {
            const btn = visibleButtons.find(b => b.key === panel)!
            return (
              <div style={{
                border: `1px solid ${btn.border}`,
                borderRadius: '8px', background: btn.bg,
                padding: '14px',
              }}>
                {/* UNFREEZE */}
                {panel === 'unfreeze' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '10px', color: '#065F46', background: '#ECFDF5', borderRadius: '6px', padding: '9px 11px', lineHeight: 1.6, border: '1px solid #A7F3D0' }}>
                      <strong>🔓 This will lift the account restriction.</strong><br/>
                      • All frozen actions will be marked resolved<br/>
                      • Client regains full access to their account
                    </div>
                    <div>
                      <label style={labelStyle}>Reason for lifting restriction</label>
                      <textarea value={unfreezeReason} onChange={e => setUnfreezeReason(e.target.value)} placeholder="e.g. Debt arrangement agreed, outstanding balance cleared…" rows={2} style={taStyle} />
                    </div>
                    <button disabled={loading || !unfreezeReason} onClick={() => submit('unfreeze', { unfreezeReason })} style={{ ...submitStyle(loading), background: loading ? '#94A3B8' : '#065F46' }}>
                      {loading ? 'Processing…' : 'Confirm Unfreeze'}
                    </button>
                  </div>
                )}

                {/* CALL LOG */}
                {panel === 'call' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <label style={labelStyle}>Call Result</label>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {CALL_RESULTS.map(r => (
                          <button key={r} onClick={() => setCallResult(r)} style={{
                            padding: '4px 9px', borderRadius: '5px', fontSize: '10px', cursor: 'pointer',
                            border: `1px solid ${callResult === r ? '#1E3A5F' : 'var(--border)'}`,
                            background: callResult === r ? '#1E3A5F' : 'white',
                            color: callResult === r ? 'white' : 'var(--text)', fontWeight: callResult === r ? 700 : 400,
                          }}>{r}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Notes</label>
                      <textarea value={callNotes} onChange={e => setCallNotes(e.target.value)} placeholder="What was discussed? Promises made?" rows={2} style={taStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Follow-up Date (optional)</label>
                      <input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)} style={inputStyle} />
                    </div>
                    <button disabled={loading} onClick={() => submit('call_log', { result: callResult, callNotes, followUpDate: followUp })} style={submitStyle(loading)}>
                      {loading ? 'Logging…' : 'Log Call Attempt'}
                    </button>
                  </div>
                )}

                {/* PAYMENT SWEEP */}
                {panel === 'sweep' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {!sweepEligible ? (
                      <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', padding: '8px' }}>
                        No positive account balance detected. Sweep is unavailable.
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <div style={{ flex: 1, background: 'white', borderRadius: '7px', padding: '8px 10px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '9px', color: 'var(--muted)' }}>Available balance</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#065F46', fontFamily: 'var(--mono)' }}>{fmt(accountBalance)}</div>
                          </div>
                          <div style={{ flex: 1, background: 'white', borderRadius: '7px', padding: '8px 10px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '9px', color: 'var(--muted)' }}>Total exposure</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#991B1B', fontFamily: 'var(--mono)' }}>{fmt(totalExposure)}</div>
                          </div>
                        </div>
                        <div>
                          <label style={labelStyle}>Sweep Amount (€)</label>
                          <input type="number" value={sweepAmt} onChange={e => setSweepAmt(e.target.value)} min={0.01} max={accountBalance} step={0.01} style={{ ...inputStyle, width: '160px' }} />
                          <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '4px' }}>Max: {fmt(Math.min(accountBalance, totalExposure))}</div>
                        </div>
                        <div style={{ fontSize: '10px', color: '#92400E', background: 'rgba(240,160,75,0.1)', borderRadius: '6px', padding: '7px 9px', lineHeight: 1.5 }}>
                          ⚠ Sweep <strong>{fmt(Number(sweepAmt))}</strong> from client&apos;s account to offset arrears.
                        </div>
                        <button disabled={loading || Number(sweepAmt) <= 0} onClick={() => submit('payment_sweep', { amount: Number(sweepAmt), dueAmount: totalExposure, balanceAtSweep: accountBalance })} style={submitStyle(loading)}>
                          {loading ? 'Processing…' : `Sweep ${fmt(Number(sweepAmt))}`}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* RESTRUCTURE OFFER */}
                {panel === 'restructure' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      <div><label style={labelStyle}>New Monthly (€)</label><input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="e.g. 150" style={inputStyle} /></div>
                      <div><label style={labelStyle}>Extend (months)</label><input type="number" value={extMonths} onChange={e => setExtMonths(e.target.value)} min={0} max={120} style={inputStyle} /></div>
                      <div><label style={labelStyle}>Holiday (months)</label><input type="number" value={holiday} onChange={e => setHoliday(e.target.value)} min={0} max={12} style={inputStyle} /></div>
                    </div>
                    <div>
                      <label style={labelStyle}>Notes for client</label>
                      <textarea value={restNotes} onChange={e => setRestNotes(e.target.value)} placeholder="Terms, special considerations…" rows={2} style={taStyle} />
                    </div>
                    <button disabled={loading || !newAmount} onClick={() => submit('restructure_offer', { newMonthlyAmount: Number(newAmount), extensionMonths: Number(extMonths), holidayMonths: Number(holiday), restructureNotes: restNotes })} style={submitStyle(loading)}>
                      {loading ? 'Sending…' : 'Send Restructure Offer'}
                    </button>
                  </div>
                )}

                {/* LEGAL DEMAND */}
                {panel === 'legal' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '10px', color: '#991B1B', background: '#FEF2F2', borderRadius: '6px', padding: '9px 11px', lineHeight: 1.6 }}>
                      <strong>⚖️ Formal legal demand notice.</strong><br/>
                      • Auto-generated case reference<br/>
                      • Client has <strong>14 days</strong> to respond · Non-response triggers proceedings
                    </div>
                    <div>
                      <label style={labelStyle}>Additional notes</label>
                      <textarea value={legalNotes} onChange={e => setLegalNotes(e.target.value)} placeholder="Previous warnings, correspondence reference…" rows={2} style={taStyle} />
                    </div>
                    <button disabled={loading} onClick={() => submit('legal_demand', { demandNotes: legalNotes })} style={{ ...submitStyle(loading), background: loading ? '#94A3B8' : '#991B1B' }}>
                      {loading ? 'Issuing…' : 'Issue Legal Demand Notice'}
                    </button>
                  </div>
                )}

                {/* COLLECTIONS */}
                {panel === 'collection' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={labelStyle}>Team</label>
                        <select value={collTeam} onChange={e => setCollTeam(e.target.value)} style={inputStyle}>
                          <option value="internal">Internal Recovery</option>
                          <option value="external">External Agency</option>
                          <option value="legal">Legal Department</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Assigned to</label>
                        <input type="text" value={collAgent} onChange={e => setCollAgent(e.target.value)} placeholder="Agent name or ID" style={inputStyle} />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Notes</label>
                      <textarea value={collNotes} onChange={e => setCollNotes(e.target.value)} placeholder="Priority, special instructions…" rows={2} style={taStyle} />
                    </div>
                    <button disabled={loading || !collAgent} onClick={() => submit('collection_assign', { team: collTeam, assignedTo: collAgent, collectionNotes: collNotes })} style={submitStyle(loading)}>
                      {loading ? 'Assigning…' : 'Assign to Collections'}
                    </button>
                  </div>
                )}

                {/* WRITE-OFF */}
                {panel === 'writeoff' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {userRole !== 'senior_risk_manager' ? (
                      <div style={{ fontSize: '11px', color: '#991B1B', textAlign: 'center', padding: '8px' }}>🔒 Admin access required to write off a debt.</div>
                    ) : (
                      <>
                        <div style={{ fontSize: '10px', color: '#374151', background: '#F4F7FA', borderRadius: '6px', padding: '9px 11px', lineHeight: 1.6 }}>
                          <strong>⚠ This action is irreversible.</strong> Marked as uncollectable and removed from active recovery.
                        </div>
                        <div>
                          <label style={labelStyle}>Reason for write-off</label>
                          <textarea value={woReason} onChange={e => setWoReason(e.target.value)} placeholder="Death, bankruptcy, unenforceable, statute-barred…" rows={2} style={taStyle} />
                        </div>
                        <button disabled={loading || !woReason} onClick={() => submit('write_off', { writeOffReason: woReason })} style={{ ...submitStyle(loading), background: loading ? '#94A3B8' : '#374151' }}>
                          {loading ? 'Processing…' : 'Confirm Write-off'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* ══════════════════════════════
          HISTORY TAB
      ══════════════════════════════ */}
      {tab === 'history' && (
        <div style={{ padding: '12px 16px', maxHeight: '380px', overflowY: 'auto' }}>
          {history.length === 0 ? (
            <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
              No actions logged yet for this client.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {history.map((h, i) => (
                <div key={h.id ?? i} style={{
                  display: 'flex', gap: '10px', padding: '10px 0',
                  borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                    background: actionColor(h.action) + '18',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
                  }}>
                    {actionIcon(h.action)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: actionColor(h.action) }}>{h.action}</div>
                    {h.notes && (
                      <div style={{ fontSize: '10px', color: 'var(--text)', marginTop: '2px', lineHeight: 1.4 }}>{h.notes}</div>
                    )}
                    <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '3px', fontFamily: 'var(--mono)' }}>
                      {h.createdAt} &middot; {h.actionedBy}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '8px', padding: '2px 6px', borderRadius: '8px', flexShrink: 0, height: 'fit-content',
                    background: h.status === 'active' ? 'rgba(34,197,94,0.1)' : '#F0F4F8',
                    color: h.status === 'active' ? '#065F46' : 'var(--muted)',
                  }}>
                    {h.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '9px', fontWeight: 700, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: '6px',
  border: '1px solid var(--border)', fontSize: '11px',
  fontFamily: 'var(--font)', background: 'white', boxSizing: 'border-box',
}

const taStyle: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: '6px',
  border: '1px solid var(--border)', fontSize: '11px',
  fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box', background: 'white',
}

function submitStyle(loading: boolean): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: '7px', border: 'none',
    background: loading ? '#94A3B8' : 'var(--navy)',
    color: 'white', fontSize: '11px', fontWeight: 700,
    cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.04em',
    alignSelf: 'flex-start',
  }
}
