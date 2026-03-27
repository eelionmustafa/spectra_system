'use client'

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'

const C = { muted: '#64748B', border: '#E2E8F0' }
const tipStyle = { fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }

interface DPDBucket { label: string; count: number; color: string }

export default function DPDBucketChart({ data }: { data: DPDBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} margin={{ top: 14, right: 12, left: 0, bottom: 0 }} barCategoryGap="35%">
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} width={28} />
        <Tooltip formatter={(v: any) => [v, 'Clients']} contentStyle={tipStyle} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((b, i) => <Cell key={i} fill={b.color} />)}
          <LabelList dataKey="count" position="top"
            style={{ fontSize: 10, fill: C.muted, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
