'use client'

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import type { SegmentDelinquency } from '@/lib/queries'

const C = { navy: '#1D2B4E', blue: '#378ADD', amber: '#F59E0B', green: '#10B981', red: '#EF4444', muted: '#64748B', border: '#E2E8F0' }
const SEGMENT_COLORS: Record<string, string> = {
  'Consumer': C.navy, 'Mortgage': C.blue, 'Overdraft': C.amber, 'Card': C.green, 'Micro': C.red,
}
const tipStyle = { fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }
const axTick   = { fontSize: 10, fill: C.muted }

export default function SegmentBarChart({ data }: { data: SegmentDelinquency[] }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }} barCategoryGap="35%">
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="product_type" tick={axTick} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={v => `${v}%`} tick={axTick} tickLine={false} axisLine={false} width={34} />
        <Tooltip formatter={(v) => [`${v}%`, 'Delinquency ≥30 DPD']} contentStyle={tipStyle} />
        <Bar dataKey="delinquency_pct" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={SEGMENT_COLORS[d.product_type] ?? C.navy} />)}
          <LabelList dataKey="delinquency_pct" position="top"
            formatter={(v) => `${v}%`} style={{ fontSize: 9, fill: C.muted }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
