'use client'

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import type { PDByRating } from '@/lib/queries'

const C = { green: '#10B981', amber: '#F59E0B', red: '#EF4444', muted: '#64748B', border: '#E2E8F0' }
const tipStyle = { fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }
const axTick   = { fontSize: 10, fill: C.muted }

export default function PDRatingChart({ data }: { data: PDByRating[] }) {
  const sorted = [...data].sort((a, b) => b.pd_pct - a.pd_pct)
  const height  = Math.max(sorted.length * 32 + 24, 100)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 48, left: 0, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
        <XAxis type="number" tickFormatter={v => `${v}%`} tick={axTick} tickLine={false} axisLine={false} domain={[0, 'auto']} />
        <YAxis type="category" dataKey="rating_last_month" tick={axTick} tickLine={false} axisLine={false} width={30} />
        <Tooltip formatter={(v: any) => [`${v}%`, 'PD']} contentStyle={tipStyle} />
        <Bar dataKey="pd_pct" radius={[0, 4, 4, 0]}>
          {sorted.map((r, i) => (
            <Cell key={i} fill={r.pd_pct > 10 ? C.red : r.pd_pct > 5 ? C.amber : C.green} />
          ))}
          <LabelList dataKey="pd_pct" position="right"
            formatter={(v: any) => `${v}%`}
            style={{ fontSize: 10, fill: C.muted, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
