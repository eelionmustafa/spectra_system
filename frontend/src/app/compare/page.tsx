export const dynamic = 'force-dynamic'

import Link from 'next/link'
import Topbar from '@/components/Topbar'
import { getClientProfile } from '@/lib/queries'
import type { ClientProfile } from '@/lib/queries'
import CompareSearch from './CompareSearch'

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function fmtEur(n: number | null | undefined) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1_000_000) return '€' + (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return '€' + (n / 1_000).toFixed(0) + 'K'
  return '€' + n.toLocaleString()
}

function stageLabel(s: number | null | undefined) {
  if (s === 3) return 'Stage 3 · NPL'
  if (s === 2) return 'Stage 2 · Watch'
  return 'Stage 1 · Performing'
}

function stageColor(s: number | null | undefined) {
  if (s === 3) return '#ef4444'
  if (s === 2) return '#f97316'
  return '#10b981'
}

function riskScoreColor(score: number | null | undefined) {
  const s = score ?? 0
  if (s >= 0.75) return '#ef4444'
  if (s >= 0.50) return '#f97316'
  if (s >= 0.30) return '#eab308'
  return '#10b981'
}

function dpdColor(d: number | null | undefined) {
  const n = d ?? 0
  if (n >= 90) return '#ef4444'
  if (n >= 30) return '#f97316'
  return '#10b981'
}

/* ─── comparison row ──────────────────────────────────────────────────────── */

type CellVal = string | number | null | undefined

function Row({
  label,
  a,
  b,
  colorFn,
  mono,
  worseIsHigher = true,
}: {
  label: string
  a: CellVal
  b: CellVal
  colorFn?: (v: CellVal) => string
  mono?: boolean
  worseIsHigher?: boolean
}) {
  const aNum = typeof a === 'number' ? a : null
  const bNum = typeof b === 'number' ? b : null
  const aWorse = aNum != null && bNum != null && (worseIsHigher ? aNum > bNum : aNum < bNum)
  const bWorse = aNum != null && bNum != null && (worseIsHigher ? bNum > aNum : bNum < aNum)

  function cell(val: CellVal, worse: boolean, id: 'a' | 'b') {
    const color = colorFn ? colorFn(val) : worse ? '#ef4444' : 'var(--text)'
    return (
      <td key={id} style={{
        padding: '8px 14px',
        fontSize: 12,
        fontFamily: mono ? 'var(--mono)' : undefined,
        fontWeight: 600,
        color,
        background: worse ? 'rgba(239,68,68,0.05)' : undefined,
        borderBottom: '1px solid var(--border)',
        textAlign: 'right',
      }}>
        {val ?? '—'}
      </td>
    )
  }

  return (
    <tr>
      <td style={{
        padding: '8px 14px',
        fontSize: 11,
        color: 'var(--muted)',
        borderBottom: '1px solid var(--border)',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </td>
      {cell(a, aWorse, 'a')}
      {cell(b, bWorse, 'b')}
    </tr>
  )
}

/* ─── comparison table ────────────────────────────────────────────────────── */

function CompareTable({ a, b }: { a: ClientProfile; b: ClientProfile }) {
  const aStage = a.stage ?? 1
  const bStage = b.stage ?? 1

  return (
    <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '38%' }} />
          <col style={{ width: '31%' }} />
          <col style={{ width: '31%' }} />
        </colgroup>
        <thead>
          <tr style={{ background: 'var(--navy)' }}>
            <th style={{ padding: '10px 14px', fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', fontWeight: 500 }}>
              Metric
            </th>
            {[a, b].map((p, i) => (
              <th key={i} style={{ padding: '10px 14px', textAlign: 'right' }}>
                <Link href={`/clients/${p.personal_id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>
                    {p.full_name || p.personal_id}
                    <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 4 }}>↗</span>
                  </div>
                  <div style={{
                    display: 'inline-block', marginTop: 4,
                    fontSize: 9, padding: '2px 8px', borderRadius: 10,
                    background: `${stageColor(p.stage)}25`,
                    color: stageColor(p.stage),
                    border: `1px solid ${stageColor(p.stage)}40`,
                    fontWeight: 700,
                  }}>
                    {stageLabel(p.stage)}
                  </div>
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Risk */}
          <tr><td colSpan={3} style={{ padding: '6px 14px 2px', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, background: 'var(--bg)' }}>Risk</td></tr>
          <Row label="Risk Score" a={`${Math.round((a.risk_score ?? 0) * 100)}%`} b={`${Math.round((b.risk_score ?? 0) * 100)}%`} colorFn={v => riskScoreColor(parseFloat(String(v)) / 100)} />
          <Row label="Risk Tier"  a={a.risk_tier}  b={b.risk_tier} />
          <Row label="IFRS 9 Stage" a={aStage} b={bStage} colorFn={v => stageColor(Number(v))} worseIsHigher={true} mono />

          {/* Delinquency */}
          <tr><td colSpan={3} style={{ padding: '6px 14px 2px', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, background: 'var(--bg)' }}>Delinquency</td></tr>
          <Row label="Current DPD"   a={a.current_due_days} b={b.current_due_days} colorFn={v => dpdColor(Number(v))} worseIsHigher mono />
          <Row label="Max DPD 12M"   a={a.max_due_days_12m} b={b.max_due_days_12m} colorFn={v => dpdColor(Number(v))} worseIsHigher mono />
          <Row label="Max DPD 24M"   a={a.max_due_days_24m} b={b.max_due_days_24m} colorFn={v => dpdColor(Number(v))} worseIsHigher mono />
          <Row label="Missed Pmts"   a={a.missed_payments}  b={b.missed_payments}  worseIsHigher mono />
          <Row label="Repayment Rate" a={a.repayment_rate_pct != null ? `${a.repayment_rate_pct}%` : null} b={b.repayment_rate_pct != null ? `${b.repayment_rate_pct}%` : null} worseIsHigher={false} />

          {/* Exposure */}
          <tr><td colSpan={3} style={{ padding: '6px 14px 2px', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, background: 'var(--bg)' }}>Exposure</td></tr>
          <Row label="Total Exposure" a={fmtEur(a.total_exposure)} b={fmtEur(b.total_exposure)} />
          <Row label="On-Balance"     a={fmtEur(a.on_balance)}     b={fmtEur(b.on_balance)} />
          <Row label="DTI Ratio"      a={a.dti_ratio != null ? `${a.dti_ratio}%` : null}  b={b.dti_ratio != null ? `${b.dti_ratio}%` : null} worseIsHigher mono />

          {/* Profile */}
          <tr><td colSpan={3} style={{ padding: '6px 14px 2px', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, background: 'var(--bg)' }}>Profile</td></tr>
          <Row label="Region"          a={a.region}          b={b.region} />
          <Row label="Employment"      a={a.employment_type} b={b.employment_type} />
          <Row label="Tenure"          a={a.tenure_years != null ? `${a.tenure_years}y` : null} b={b.tenure_years != null ? `${b.tenure_years}y` : null} worseIsHigher={false} />
          <Row label="Product"         a={a.product_type}    b={b.product_type} />
        </tbody>
      </table>
    </div>
  )
}

/* ─── page ────────────────────────────────────────────────────────────────── */

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const { a: idA, b: idB } = await searchParams

  let profileA: ClientProfile | null = null
  let profileB: ClientProfile | null = null
  let errorA = '', errorB = ''

  if (idA) {
    try { profileA = await getClientProfile(idA) }
    catch { errorA = `Could not load client ${idA}` }
  }
  if (idB) {
    try { profileB = await getClientProfile(idB) }
    catch { errorB = `Could not load client ${idB}` }
  }

  const bothLoaded = profileA && profileB

  return (
    <>
      <Topbar title="Compare Clients" sub="Side-by-side risk comparison" />
      <div className="content">

        {/* Search form */}
        <CompareSearch idA={idA ?? ''} idB={idB ?? ''} />

        {/* Errors */}
        {(errorA || errorB) && (
          <div className="panel" style={{ padding: '10px 14px', color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>
            {errorA && <div>{errorA}</div>}
            {errorB && <div>{errorB}</div>}
          </div>
        )}

        {/* Not found notices */}
        {idA && !profileA && !errorA && (
          <div className="panel" style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 12 }}>
            No client found with ID <code>{idA}</code>
          </div>
        )}
        {idB && !profileB && !errorB && (
          <div className="panel" style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 12 }}>
            No client found with ID <code>{idB}</code>
          </div>
        )}

        {/* Comparison table */}
        {bothLoaded && <CompareTable a={profileA!} b={profileB!} />}

        {/* Empty state */}
        {!idA && !idB && (
          <div className="panel" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⇄</div>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Compare two clients side by side</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              Enter two client IDs above to compare their risk scores, DPD, exposure, and profile.
            </div>
          </div>
        )}

      </div>
    </>
  )
}
