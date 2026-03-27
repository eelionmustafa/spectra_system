export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import {
  getAllFrozenClients,
  getAllPendingDocumentRequests,
  getAllRecentCollateralReviews,
} from '@/lib/monitoringService'
import { getRecentSystemActions } from '@/lib/notificationService'
import {
  getCardSpendAlerts,
  getOverdraftDependency,
  type CardSpendAlert,
  type OverdraftDependency,
} from '@/lib/queries'
import { fmt, fmtDateTime } from '@/lib/formatters'
import SectionHeader from '@/components/SectionHeader'

function docTypeLabel(t: string) {
  return ({
    financial_statement: 'Financial Statement',
    bank_statement:      'Bank Statement',
    tax_return:          'Tax Return',
    other:               'Other',
  }[t] ?? t)
}

function eventTypeLabel(t: string) {
  return ({
    stage_change:       'Stage Change',
    risk_score_update:  'Risk Score Update',
    ewi_trigger:        'EWI Trigger',
  }[t] ?? t)
}

function EmptyState({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <div style={{ padding: '32px', textAlign: 'center' }}>
      <div style={{ fontSize: '32px', marginBottom: 10, opacity: 0.35 }}>{icon}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{text}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

function PageSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ height: 88, borderRadius: 12, background: '#0D1B2A', opacity: 0.12, animation: 'pulse 1.4s ease-in-out infinite' }} />
      {[200, 240, 200, 180].map((h, i) => (
        <div key={i} style={{
          height: h, borderRadius: 10, border: '1px solid var(--border)',
          background: 'linear-gradient(90deg,#F8FAFC 25%,#F1F5F9 50%,#F8FAFC 75%)',
          backgroundSize: '200% 100%', animation: `pulse 1.4s ease-in-out ${i * 0.1}s infinite`,
        }} />
      ))}
    </div>
  )
}

// ─── All data fetched in one parallel Promise.all, one Suspense boundary ─────

async function MonitoringContent() {
  let frozen:      Awaited<ReturnType<typeof getAllFrozenClients>>          = []
  let docRequests: Awaited<ReturnType<typeof getAllPendingDocumentRequests>> = []
  let collateral:  Awaited<ReturnType<typeof getAllRecentCollateralReviews>> = []
  let sysActions:  Awaited<ReturnType<typeof getRecentSystemActions>>       = []
  let cardSpend:   CardSpendAlert[]   = []
  let overdraftDep: OverdraftDependency[] = []
  let dbError = false

  try {
    ;[frozen, docRequests, collateral, sysActions, cardSpend, overdraftDep] = await Promise.all([
      getAllFrozenClients(),
      getAllPendingDocumentRequests(50),
      getAllRecentCollateralReviews(20),
      getRecentSystemActions(50),
      getCardSpendAlerts().catch((): CardSpendAlert[] => []),
      getOverdraftDependency().catch((): OverdraftDependency[] => []),
    ])
  } catch {
    dbError = true
  }

  const pendingDocs    = docRequests.filter(d => d.status === 'Pending' || d.status === 'Overdue')
  const receivedDocs   = docRequests.filter(d => d.status === 'Received')
  const highLtvReviews = collateral.filter(r => r.ltv_recalculated != null && r.ltv_recalculated > 80)
  const fetchedAt      = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  if (dbError) {
    return (
      <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
        Database not connected — check <code>.env.local</code> settings.
      </div>
    )
  }

  return (
    <>
      {/* Hero summary */}
      <div style={{
        background: 'var(--navy)', borderRadius: 12, padding: '20px 24px',
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 4,
      }}>
        {[
          { label: 'Frozen Accounts',      value: frozen.length,         sub: 'Credit disbursements blocked',               color: frozen.length > 0 ? '#F87171' : '#4ADE80' },
          { label: 'Pending Doc Requests', value: pendingDocs.length,    sub: `${receivedDocs.length} received`,             color: pendingDocs.length > 5 ? '#FCD34D' : pendingDocs.length > 0 ? '#93C5FD' : '#4ADE80' },
          { label: 'Collateral Reviews',   value: collateral.length,     sub: `${highLtvReviews.length} high LTV (>80%)`,   color: highLtvReviews.length > 0 ? '#FCD34D' : 'rgba(255,255,255,0.75)' },
          { label: 'System Events',        value: sysActions.length,     sub: `as of ${fetchedAt}`,                          color: 'rgba(255,255,255,0.75)' },
          { label: 'Card Spend Alerts',    value: cardSpend.length,      sub: 'MoM acceleration >30%',                      color: cardSpend.length > 0 ? '#FCD34D' : '#4ADE80' },
          { label: 'Overdraft Dependency', value: overdraftDep.length,   sub: `${overdraftDep.filter(o => o.severity === 'Critical').length} Critical`, color: overdraftDep.some(o => o.severity === 'Critical') ? '#F87171' : overdraftDep.length > 0 ? '#FCD34D' : '#4ADE80' },
        ].map(card => (
          <div key={card.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 9, padding: '14px 16px', borderBottom: `2px solid ${card.color}` }}>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1.2px', color: 'rgba(255,255,255,0.4)', marginBottom: 5, fontWeight: 600 }}>{card.label}</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: card.color, fontFamily: 'var(--mono)', lineHeight: 1.1 }}>{card.value}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Frozen accounts */}
      <SectionHeader title="Frozen Accounts" sub="credit disbursements blocked" />
      <div className="panel">
        <div className="ph">
          <span className="pt">Frozen Accounts</span>
          {frozen.length > 0 && <span className="badge br">{frozen.length} frozen</span>}
        </div>
        {frozen.length === 0 ? (
          <EmptyState icon="✅" text="No frozen accounts" sub="All client accounts are currently active." />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl tbl-alt">
              <thead><tr><th>Client ID</th><th>Review Cadence</th><th>Freeze Reason</th><th>Frozen At</th><th>Last Updated</th></tr></thead>
              <tbody>
                {frozen.map(f => (
                  <tr key={f.client_id}>
                    <td>
                      <Link href={`/clients/${f.client_id}`} style={{ textDecoration: 'none' }}>
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 600 }}>{f.client_id}</span>
                        <span style={{ marginLeft: 6, fontSize: '9px', padding: '1px 6px', borderRadius: 3, background: '#FEE2E2', color: '#991B1B', fontWeight: 700 }}>🔒 Frozen</span>
                      </Link>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: f.review_frequency === 'Daily' ? '#FEE2E2' : f.review_frequency === 'Weekly' ? '#FEF3C7' : '#DCFCE7',
                        color: f.review_frequency === 'Daily' ? 'var(--red)' : f.review_frequency === 'Weekly' ? '#92400E' : 'var(--green)',
                      }}>{f.review_frequency}</span>
                    </td>
                    <td style={{ fontSize: '11.5px', color: 'var(--text)', maxWidth: 280 }}>{f.freeze_reason ?? '—'}</td>
                    <td className="mono" style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDateTime(f.frozen_at)}</td>
                    <td className="mono" style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDateTime(f.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Document requests */}
      <SectionHeader title="Document Request Queue" sub="all pending & recent requests" />
      <div className="panel">
        <div className="ph">
          <span className="pt">Document Requests</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {pendingDocs.length > 0  && <span className="badge ba">{pendingDocs.length} pending</span>}
            {receivedDocs.length > 0 && <span className="badge bg">{receivedDocs.length} received</span>}
          </div>
        </div>
        {docRequests.length === 0 ? (
          <EmptyState icon="📋" text="No document requests" sub="Requests are created from a client profile's Quick Actions sidebar." />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl tbl-alt">
              <thead><tr><th>Client</th><th>Documents Requested</th><th>Status</th><th>Requested By</th><th>Requested At</th><th>Fulfilled At</th><th>Notes</th></tr></thead>
              <tbody>
                {docRequests.map(d => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/clients/${d.client_id}`} style={{ textDecoration: 'none' }}>
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 600 }}>{d.client_id}</span>
                      </Link>
                    </td>
                    <td style={{ fontSize: '12px', fontWeight: 500 }}>
                      {(() => { try { const docs: string[] = JSON.parse(d.requested_docs); return docs.join(', ') } catch { return d.requested_docs } })()}
                    </td>
                    <td>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: d.status === 'Received' ? '#DCFCE7' : d.status === 'Overdue' ? '#FEE2E2' : '#FEF3C7',
                        color: d.status === 'Received' ? 'var(--green)' : d.status === 'Overdue' ? 'var(--red)' : '#92400E',
                      }}>{d.status}</span>
                    </td>
                    <td className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>{d.requested_by}</td>
                    <td className="mono" style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDateTime(d.created_at)}</td>
                    <td className="mono" style={{ fontSize: '11px', color: d.fulfilled_at ? 'var(--green)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {d.fulfilled_at ? fmtDateTime(d.fulfilled_at) : '—'}
                    </td>
                    <td style={{ fontSize: '11px', color: 'var(--muted)', maxWidth: 200 }}>{d.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Collateral reviews */}
      <SectionHeader title="Collateral Reviews" sub="recent revaluations & LTV changes" />
      <div className="panel">
        <div className="ph">
          <span className="pt">Collateral Revaluations</span>
          {highLtvReviews.length > 0 && <span className="badge ba">{highLtvReviews.length} high LTV (&gt;80%)</span>}
        </div>
        {collateral.length === 0 ? (
          <EmptyState icon="🏦" text="No collateral reviews" sub="Collateral revaluations are recorded from the client profile's monitoring section." />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl tbl-alt">
              <thead><tr><th>Client</th><th>Revaluation Date</th><th className="tr">Old Value</th><th className="tr">New Value</th><th className="tr">Exposure</th><th className="tr">LTV</th><th>Reviewed By</th><th>Notes</th></tr></thead>
              <tbody>
                {collateral.map(c => {
                  const ltvHigh = c.ltv_recalculated != null && c.ltv_recalculated > 80
                  const ltvColor = ltvHigh ? 'var(--red)' : c.ltv_recalculated != null && c.ltv_recalculated > 60 ? 'var(--amber)' : 'var(--green)'
                  const valueDir = c.old_value != null && c.new_value > c.old_value ? '▲' : c.old_value != null && c.new_value < c.old_value ? '▼' : ''
                  const valueDirColor = valueDir === '▲' ? 'var(--green)' : valueDir === '▼' ? 'var(--red)' : 'var(--muted)'
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/clients/${c.client_id}`} style={{ textDecoration: 'none' }}>
                          <span className="mono" style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 600 }}>{c.client_id}</span>
                        </Link>
                      </td>
                      <td className="mono" style={{ fontSize: '11px' }}>{c.revaluation_date}</td>
                      <td className="mono tr" style={{ fontSize: '11px', color: 'var(--muted)' }}>{c.old_value != null ? fmt(c.old_value) : '—'}</td>
                      <td className="mono tr" style={{ fontSize: '11px', fontWeight: 600 }}>
                        {fmt(c.new_value)}
                        {valueDir && <span style={{ marginLeft: 4, fontSize: '10px', color: valueDirColor }}>{valueDir}</span>}
                      </td>
                      <td className="mono tr" style={{ fontSize: '11px', color: 'var(--muted)' }}>{c.current_exposure != null ? fmt(c.current_exposure) : '—'}</td>
                      <td className="mono tr" style={{ fontSize: '12px', fontWeight: 700, color: ltvColor }}>
                        {c.ltv_recalculated != null ? `${c.ltv_recalculated.toFixed(1)}%` : '—'}
                      </td>
                      <td className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>{c.reviewed_by}</td>
                      <td style={{ fontSize: '11px', color: 'var(--muted)', maxWidth: 180 }}>{c.notes ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Card spend alerts */}
      <SectionHeader title="Card Spend Alerts" sub="month-over-month spend acceleration >30% (last 3 months)" />
      <div className="panel">
        <div className="ph">
          <span className="pt">Card Spend Acceleration</span>
          {cardSpend.length > 0 && <span className="badge ba">{cardSpend.length} flagged</span>}
        </div>
        {cardSpend.length === 0 ? (
          <EmptyState icon="💳" text="No card spend alerts" sub="Clients with month-over-month card spend acceleration above 30% will appear here." />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl tbl-alt">
              <thead><tr><th>Client</th><th>Account</th><th className="tr">Current Spend</th><th className="tr">MoM Growth</th></tr></thead>
              <tbody>
                {cardSpend.map(c => (
                  <tr key={c.account}>
                    <td>
                      <Link href={`/clients/${c.personal_id}`} style={{ textDecoration: 'none' }}>
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 600 }}>{c.personal_id || '—'}</span>
                      </Link>
                    </td>
                    <td className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>{c.account}</td>
                    <td className="mono tr" style={{ fontSize: '12px', fontWeight: 600 }}>{fmt(c.current_spend)}</td>
                    <td className="tr">
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--mono)',
                        background: c.mom_growth_pct > 80 ? '#FEE2E2' : '#FEF3C7',
                        color: c.mom_growth_pct > 80 ? 'var(--red)' : '#92400E',
                      }}>+{c.mom_growth_pct.toFixed(1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Overdraft dependency */}
      <SectionHeader title="Chronic Overdraft Dependency" sub="clients with 3+ months of overdraft usage in the past 12 months" />
      <div className="panel">
        <div className="ph">
          <span className="pt">Overdraft Dependency</span>
          {overdraftDep.some(o => o.severity === 'Critical') && (
            <span className="badge br">{overdraftDep.filter(o => o.severity === 'Critical').length} Critical</span>
          )}
        </div>
        {overdraftDep.length === 0 ? (
          <EmptyState icon="🏦" text="No chronic overdraft users" sub="Clients using overdraft facilities for 3 or more months in the past 12 months will appear here." />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl tbl-alt">
              <thead><tr><th>Client</th><th className="tr">Months with Overdraft</th><th>Severity</th></tr></thead>
              <tbody>
                {overdraftDep.map(o => (
                  <tr key={o.personal_id}>
                    <td>
                      <Link href={`/clients/${o.personal_id}`} style={{ textDecoration: 'none' }}>
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 600 }}>{o.personal_id}</span>
                      </Link>
                    </td>
                    <td className="mono tr" style={{ fontSize: '12px', fontWeight: 600 }}>{o.months_with_overdraft} / 12</td>
                    <td>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: o.severity === 'Critical' ? '#FEE2E2' : o.severity === 'Warning' ? '#FEF3C7' : '#EFF6FF',
                        color: o.severity === 'Critical' ? 'var(--red)' : o.severity === 'Warning' ? '#92400E' : 'var(--blue)',
                      }}>{o.severity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System events */}
      <SectionHeader title="System Events" sub="automated stage changes, score updates, EWI triggers" />
      <div className="panel">
        <div className="ph">
          <span className="pt">System Actions Log</span>
          <span className="pa">{sysActions.length} recent events</span>
        </div>
        {sysActions.length === 0 ? (
          <EmptyState icon="⚡" text="No system events recorded" sub="Events are logged when the ML pipeline triggers stage changes, risk score updates, or EWI signals." />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl tbl-alt">
              <thead><tr><th>Client</th><th>Event</th><th>Stage Change</th><th>Score Change</th><th>Performed By</th><th>Timestamp</th></tr></thead>
              <tbody>
                {sysActions.map(a => {
                  const stageUp   = a.new_stage != null && a.old_stage != null && a.new_stage > a.old_stage
                  const stageDown = a.new_stage != null && a.old_stage != null && a.new_stage < a.old_stage
                  return (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/clients/${a.client_id}`} style={{ textDecoration: 'none' }}>
                          <span className="mono" style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 600 }}>{a.client_id}</span>
                        </Link>
                      </td>
                      <td>
                        <span style={{
                          fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                          background: a.event_type === 'stage_change' ? '#FEE2E2' : a.event_type === 'ewi_trigger' ? '#FEF3C7' : '#EFF6FF',
                          color:      a.event_type === 'stage_change' ? 'var(--red)' : a.event_type === 'ewi_trigger' ? '#92400E' : 'var(--blue)',
                        }}>{eventTypeLabel(a.event_type)}</span>
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        {a.old_stage != null && a.new_stage != null ? (
                          <span style={{ color: stageUp ? 'var(--red)' : stageDown ? 'var(--green)' : 'var(--muted)', fontWeight: 600, fontFamily: 'var(--mono)' }}>
                            Stage {a.old_stage} → Stage {a.new_stage}{stageUp ? ' ▲' : stageDown ? ' ▼' : ''}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}>
                        {a.old_risk_score != null && a.new_risk_score != null ? (
                          <span style={{ color: a.new_risk_score > a.old_risk_score ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                            {a.old_risk_score} → {a.new_risk_score}{a.new_risk_score > a.old_risk_score ? ' ▲' : ' ▼'}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>{a.performed_by}</td>
                      <td className="mono" style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDateTime(a.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function MonitoringPage() {
  return (
    <>
      <Topbar title="Monitoring" sub="Document Requests · Collateral · Behavioral Signals · System Events" />
      <div className="content">
        <Suspense fallback={<PageSkeleton />}>
          <MonitoringContent />
        </Suspense>
      </div>
    </>
  )
}
