'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { RepaymentSummary } from '@/lib/queries'

const C = { green: '#10B981', amber: '#F59E0B', red: '#EF4444', muted: '#64748B', border: '#E2E8F0' }
const tipStyle = { fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }

const SLICES = [
  { name: 'Full (≥100%)',     key: 'full_pct',     color: C.green },
  { name: 'Partial (50–99%)', key: 'partial_pct',  color: C.amber },
  { name: 'Critical (<50%)',  key: 'critical_pct', color: C.red   },
]

export default function RepaymentDonut({ data }: { data: RepaymentSummary }) {
  const slices = SLICES.map(p => ({
    name: p.name, value: data[p.key as keyof RepaymentSummary] as number, color: p.color,
  }))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{ flexShrink: 0 }}>
        <ResponsiveContainer width={130} height={130}>
          <PieChart>
            <Pie data={slices} cx="50%" cy="50%" innerRadius={36} outerRadius={58}
              dataKey="value" strokeWidth={2} stroke="#fff">
              {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
            </Pie>
            <Tooltip formatter={(v: any) => [`${v}%`, '']} contentStyle={tipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {slices.map(s => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: 'var(--mono)' }}>{s.value}%</div>
              <div style={{ fontSize: 10, color: C.muted }}>{s.name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
