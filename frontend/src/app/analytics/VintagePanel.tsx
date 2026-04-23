'use client'

import { useState } from 'react'
import Link from 'next/link'
import VintageBarChart from './VintageBarChart'
import type { VintageRow } from '@/lib/queries'

type Metric = 'delinquency_rate_pct' | 'performing_pct' | 'avg_loan_amount'

const METRICS: { id: Metric; label: string }[] = [
  { id: 'delinquency_rate_pct', label: 'Delinquency %' },
  { id: 'performing_pct',       label: 'Performing %' },
  { id: 'avg_loan_amount',      label: 'Avg Loan Size' },
]

function fmtEur(n: number) {
  if (n >= 1_000_000) return '€' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return '€' + (n / 1_000).toFixed(0) + 'K'
  return '€' + n.toLocaleString()
}

export default function VintagePanel({ data, warnThreshold }: { data: VintageRow[]; warnThreshold: number }) {
  const [metric,         setMetric]         = useState<Metric>('delinquency_rate_pct')
  const [selectedVintage, setSelectedVintage] = useState<number | null>(null)

  return (
    <div className="panel">
      <div className="ph" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <span className="pt">Vintage Analysis</span>
          <span className="pa" style={{ marginLeft: 8 }}>By issuance year</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {METRICS.map(m => (
            <button key={m.id} onClick={() => setMetric(m.id)}
              style={{
                fontSize: 10, padding: '3px 9px', borderRadius: 5, cursor: 'pointer', fontWeight: 600,
                border: metric === m.id ? 'none' : '1px solid var(--border)',
                background: metric === m.id ? 'var(--navy)' : 'transparent',
                color: metric === m.id ? 'white' : 'var(--muted)',
              }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <VintageBarChart data={data} warnThreshold={warnThreshold} metric={metric} onSelectYear={setSelectedVintage} />

      <div style={{ display: 'flex', gap: 16, marginTop: 4, marginBottom: 12, fontSize: 10, color: 'var(--muted)' }}>
        {metric === 'delinquency_rate_pct' && (
          <>
            <span style={{ color: 'var(--navy)' }}>■</span> Normal
            <span style={{ color: 'var(--red)' }}>■</span> &gt;{warnThreshold}% flagged
          </>
        )}
        {metric === 'performing_pct' && <><span style={{ color: '#10b981' }}>■</span> Performing loans</>}
        {metric === 'avg_loan_amount' && <><span style={{ color: 'var(--navy)' }}>■</span> Average approved amount</>}
        <span style={{ marginLeft: 'auto', fontSize: 9 }}>Click a bar to highlight cohort</span>
      </div>

      {/* Cohort Detail table */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: 6 }}>
          Cohort Detail
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Year', 'Loans', 'Avg Loan Size', 'Delinquency %', 'Performing %', ''].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'var(--muted)', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(r => {
                const isSelected = r.vintage_year === selectedVintage
                return (
                  <tr key={r.vintage_year}
                    onClick={() => setSelectedVintage(isSelected ? null : r.vintage_year)}
                    style={{
                      background: isSelected ? '#EFF6FF' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}>
                    <td style={{ padding: '7px 10px', fontWeight: isSelected ? 700 : 400, color: isSelected ? 'var(--navy)' : 'var(--text)' }}>
                      {r.vintage_year}
                    </td>
                    <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)' }}>{r.loan_count.toLocaleString()}</td>
                    <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)' }}>{fmtEur(r.avg_loan_amount)}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{
                        fontFamily: 'var(--mono)', fontWeight: 700,
                        color: r.delinquency_rate_pct > warnThreshold ? 'var(--red)' : 'var(--green)',
                      }}>
                        {r.delinquency_rate_pct}%
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ fontFamily: 'var(--mono)', color: r.performing_pct >= 80 ? 'var(--green)' : r.performing_pct >= 60 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>
                        {r.performing_pct}%
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                      <Link href={`/clients?vintage=${r.vintage_year}`}
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 10, color: 'var(--blue)', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        View Clients →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
