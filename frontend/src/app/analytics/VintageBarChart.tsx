'use client'

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, ReferenceLine } from 'recharts'
import type { VintageRow } from '@/lib/queries'

const C = { navy: '#1D2B4E', red: '#EF4444', muted: '#64748B', border: '#E2E8F0' }
const tipStyle = { fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }
const axTick   = { fontSize: 10, fill: C.muted }

export default function VintageBarChart({ data, warnThreshold }: { data: VintageRow[]; warnThreshold: number }) {
  const rows = data.map(v => ({
    year: String(v.vintage_year),
    pct: v.delinquency_rate_pct,
    flagged: v.delinquency_rate_pct > warnThreshold,
  }))
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={rows} margin={{ top: 12, right: 16, left: 0, bottom: 0 }} barCategoryGap="35%">
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="year" tick={axTick} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={v => `${v}%`} tick={axTick} tickLine={false} axisLine={false} width={34} />
        <Tooltip formatter={(v) => [`${v}%`, 'Delinquency rate']} contentStyle={tipStyle} />
        <ReferenceLine y={warnThreshold} stroke={C.red} strokeDasharray="4 2" strokeWidth={1}
          label={{ value: `${warnThreshold}%`, position: 'insideTopRight', fontSize: 9, fill: C.red }} />
        <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
          {rows.map((r, i) => <Cell key={i} fill={r.flagged ? C.red : C.navy} />)}
          <LabelList dataKey="pct" position="top"
            formatter={(v) => `${v}%`} style={{ fontSize: 9, fill: C.muted }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
